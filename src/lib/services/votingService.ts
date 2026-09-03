import crypto from "crypto";
import { db as defaultDb } from "@/db";
import {
  challenges,
  challengeSubmissions,
  artworks,
  artworkVersions,
  profiles,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  challengeResults,
  auditLogs,
  users,
} from "@/db/schema";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
import type { ServiceContext } from "./challengeService";
import { internalTransitionChallengeStatus } from "./challengeService";
import { validateJuryPhaseReadinessService } from "./juryService";

/**
 * Deterministic candidate shuffle per voter to prevent position bias.
 */
export function getDeterministicVoterCandidateOrder<T extends { submissionId: string }>(
  candidates: T[],
  userId?: string | null,
  challengeId?: string
): T[] {
  if (!userId || !challengeId || candidates.length <= 1) {
    return [...candidates];
  }

  return [...candidates].sort((a, b) => {
    const hashA = crypto
      .createHash("sha256")
      .update(`${challengeId}:${userId}:${a.submissionId}`)
      .digest("hex");
    const hashB = crypto
      .createHash("sha256")
      .update(`${challengeId}:${userId}:${b.submissionId}`)
      .digest("hex");
    return hashA.localeCompare(hashB);
  });
}

export interface CandidateRoundData {
  submissionId: string;
  artistUserId: string;
  artistName: string;
  artistSlug: string;
  artistAvatar: string | null;
  artworkId: string;
  artworkVersionId: string;
  isSpoiler: boolean;
  versionNumber: number;
  title: string;
  description: string | null;
  softwareUsed: string | null;
  thumbnailStorageKey: string | null;
  publicStorageKey: string | null;
  width: number | null;
  height: number | null;
  mediaType: "image" | "gif" | "video";
  totalStars: number;
  userAllocatedStars: number;
  isSelfSubmission: boolean;
}

export type RoundTallyResult =
  | { outcome: "no_votes"; maxStars: 0; candidates: Array<{ submissionId: string; totalStars: number }> }
  | {
      outcome: "winner";
      winnerSubmissionId: string;
      maxStars: number;
      candidates: Array<{ submissionId: string; totalStars: number }>;
    }
  | {
      outcome: "tie";
      tiedSubmissionIds: string[];
      maxStars: number;
      candidates: Array<{ submissionId: string; totalStars: number }>;
    };

/**
 * 1. Authoritative closed-round tally and tie-set calculation helper.
 * Behavior:
 * - MAIN:
 *   - 0 valid Stars => no_votes (no Community Winner)
 *   - positive unique maximum => winner
 *   - positive shared maximum => tie (unresolved tied set)
 * - TIEBREAK:
 *   - 0 valid Stars => tie (all frozen tiebreak candidates remain the unresolved tied set)
 *   - positive unique maximum => winner
 *   - positive shared maximum => tie (candidates sharing that maximum)
 */
export async function computeAuthoritativeRoundTally(
  dbOrTx: any,
  votingRoundId: string
): Promise<RoundTallyResult> {
  const [round] = await dbOrTx
    .select()
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, votingRoundId))
    .limit(1);

  if (!round) {
    throw new Error(`Voting round tidak ditemukan (ID: ${votingRoundId}).`);
  }

  // 1. Fetch exact frozen candidates for this round
  const frozenCandidates = await dbOrTx
    .select({
      submissionId: challengeVotingRoundCandidates.submissionId,
    })
    .from(challengeVotingRoundCandidates)
    .where(eq(challengeVotingRoundCandidates.votingRoundId, votingRoundId));

  const candidateIds = frozenCandidates.map((fc: any) => fc.submissionId);

  if (candidateIds.length === 0) {
    return { outcome: "no_votes", maxStars: 0, candidates: [] };
  }

  // 2. Fetch star totals for these frozen candidates in this round
  const starCounts = await dbOrTx
    .select({
      submissionId: challengeBallotStars.submissionId,
      totalStars: sql<number>`COALESCE(SUM(${challengeBallotStars.starsCount}), 0)::int`,
    })
    .from(challengeBallotStars)
    .innerJoin(challengeBallots, eq(challengeBallots.id, challengeBallotStars.ballotId))
    .where(
      and(
        eq(challengeBallots.votingRoundId, votingRoundId),
        inArray(challengeBallotStars.submissionId, candidateIds)
      )
    )
    .groupBy(challengeBallotStars.submissionId);

  const starMap = new Map<string, number>();
  for (const sc of starCounts) {
    starMap.set(sc.submissionId, sc.totalStars);
  }

  const candidateTallies = candidateIds.map((id: string) => ({
    submissionId: id,
    totalStars: starMap.get(id) || 0,
  }));

  const totalValidStars = candidateTallies.reduce((sum: number, c: any) => sum + c.totalStars, 0);
  const maxStars = Math.max(...candidateTallies.map((c: any) => c.totalStars), 0);

  if (round.roundType === "main") {
    if (totalValidStars === 0 || maxStars === 0) {
      return { outcome: "no_votes", maxStars: 0, candidates: candidateTallies };
    }

    const tiedCandidates = candidateTallies.filter((c: any) => c.totalStars === maxStars);
    if (tiedCandidates.length === 1) {
      return {
        outcome: "winner",
        winnerSubmissionId: tiedCandidates[0].submissionId,
        maxStars,
        candidates: candidateTallies,
      };
    } else {
      return {
        outcome: "tie",
        tiedSubmissionIds: tiedCandidates.map((c: any) => c.submissionId),
        maxStars,
        candidates: candidateTallies,
      };
    }
  } else {
    // TIEBREAK round
    if (totalValidStars === 0 || maxStars === 0) {
      // 0 valid Stars in tiebreak: all frozen tiebreak candidates are the unresolved tied set
      return {
        outcome: "tie",
        tiedSubmissionIds: candidateIds,
        maxStars: 0,
        candidates: candidateTallies,
      };
    }

    const tiedCandidates = candidateTallies.filter((c: any) => c.totalStars === maxStars);
    if (tiedCandidates.length === 1) {
      return {
        outcome: "winner",
        winnerSubmissionId: tiedCandidates[0].submissionId,
        maxStars,
        candidates: candidateTallies,
      };
    } else {
      return {
        outcome: "tie",
        tiedSubmissionIds: tiedCandidates.map((c: any) => c.submissionId),
        maxStars,
        candidates: candidateTallies,
      };
    }
  }
}

/**
 * 2. Fetch authoritative voting data for a challenge and user
 */
export async function getAuthoritativeVotingRoundData(
  challengeId: string,
  userId?: string | null,
  options?: { dbOrTx?: any; targetRoundId?: string }
) {
  const dbOrTx = options?.dbOrTx || defaultDb;

  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) return null;

  // Resolve target or latest active voting round
  let roundQuery = dbOrTx
    .select()
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.challengeId, challengeId));

  if (options?.targetRoundId) {
    roundQuery = dbOrTx
      .select()
      .from(challengeVotingRounds)
      .where(
        and(
          eq(challengeVotingRounds.challengeId, challengeId),
          eq(challengeVotingRounds.id, options.targetRoundId)
        )
      );
  }

  const rounds = await roundQuery.orderBy(
    desc(challengeVotingRounds.createdAt)
  );

  // Prefer open round, otherwise latest round
  const votingRound = rounds.find((r: any) => r.status === "open") || rounds[0] || null;

  if (!votingRound) {
    return {
      challenge,
      votingRound: null,
      candidates: [],
      userBallot: null,
      roundTally: null,
      starsAllowance: challenge.starsPerMember || 1,
    };
  }

  // 1. Fetch frozen candidate submissions
  const frozenCandidates = await dbOrTx
    .select({
      submissionId: challengeVotingRoundCandidates.submissionId,
    })
    .from(challengeVotingRoundCandidates)
    .where(eq(challengeVotingRoundCandidates.votingRoundId, votingRound.id));

  const candidateIds = frozenCandidates.map((fc: any) => fc.submissionId);

  let candidateRows: any[] = [];
  if (candidateIds.length > 0) {
    candidateRows = await dbOrTx
      .select({
        submissionId: challengeSubmissions.id,
        artistUserId: challengeSubmissions.userId,
        artistName: profiles.displayName,
        artistSlug: profiles.slug,
        artistAvatar: profiles.avatarUrl,
        artworkId: challengeSubmissions.artworkId,
        artworkVersionId: challengeSubmissions.artworkVersionId,
        isSpoiler: artworks.isSpoiler,
        versionNumber: sql<number>`1`,
        title: challengeSubmissions.title,
        description: challengeSubmissions.description,
        softwareUsed: challengeSubmissions.softwareUsed,
        thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
        publicStorageKey: artworkVersions.publicStorageKey,
        width: artworkVersions.width,
        height: artworkVersions.height,
        mediaType: artworkVersions.mediaType,
      })
      .from(challengeSubmissions)
      .innerJoin(artworks, eq(artworks.id, challengeSubmissions.artworkId))
      .innerJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
      .innerJoin(
        artworkVersions,
        eq(artworkVersions.id, challengeSubmissions.artworkVersionId)
      )
      .where(inArray(challengeSubmissions.id, candidateIds));
  }

  // 2. Compute Tally
  const roundTally = await computeAuthoritativeRoundTally(dbOrTx, votingRound.id);
  const starCountMap = new Map<string, number>();
  for (const c of roundTally.candidates) {
    starCountMap.set(c.submissionId, c.totalStars);
  }

  // 3. User Ballot Allocations
  let userAllocations = new Map<string, number>();
  let totalUserStarsAllocated = 0;
  let ballotId: string | null = null;
  let isFinalized = false;

  if (userId) {
    const [userBallot] = await dbOrTx
      .select()
      .from(challengeBallots)
      .where(
        and(
          eq(challengeBallots.votingRoundId, votingRound.id),
          eq(challengeBallots.userId, userId)
        )
      )
      .limit(1);

    if (userBallot) {
      ballotId = userBallot.id;
      totalUserStarsAllocated = userBallot.starsAllocated;
      isFinalized = userBallot.isFinalized;

      const userStars = await dbOrTx
        .select()
        .from(challengeBallotStars)
        .where(eq(challengeBallotStars.ballotId, userBallot.id));

      for (const item of userStars) {
        userAllocations.set(item.submissionId, item.starsCount);
      }
    }
  }

  const mappedCandidates: CandidateRoundData[] = candidateRows.map((c: any) => ({
    ...c,
    totalStars: starCountMap.get(c.submissionId) || 0,
    userAllocatedStars: userAllocations.get(c.submissionId) || 0,
    isSelfSubmission: userId ? c.artistUserId === userId : false,
  }));

  const maxStars = votingRound.starsPerMember || challenge.starsPerMember || 1;
  const remainingStars = Math.max(0, maxStars - totalUserStarsAllocated);

  return {
    challenge,
    votingRound,
    candidates: getDeterministicVoterCandidateOrder(mappedCandidates, userId, challenge.id),
    userBallot: {
      ballotId,
      starsAllocated: totalUserStarsAllocated,
      maxStars,
      remainingStars,
      isFinalized,
    },
    roundTally,
    starsAllowance: maxStars,
  };
}

/**
 * 3. Cast or Update Ballot Service
 * Operates authoritatively on votingRoundId
 */
export async function castOrUpdateBallotService(
  dbOrTx: any,
  actor: ServiceContext,
  params: {
    votingRoundId: string;
    votes: Array<{ submissionId: string; starsCount: number }>;
  }
) {
  const { votingRoundId, votes } = params;

  if (!actor?.userId) {
    throw new Error("Pengguna autentikasi tidak valid untuk melakukan pemungutan suara.");
  }
  const voterUserId = actor.userId;

  // 1. Verify Actor Status
  const [user] = await dbOrTx
    .select({
      id: users.id,
      membershipStatus: users.membershipStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, voterUserId))
    .limit(1);

  if (!user || user.membershipStatus !== "active" || user.deletedAt) {
    throw new Error("Akun Anda tidak aktif atau sedang ditangguhkan/dicabut. Aksi voting ditolak.");
  }

  // 2. Validate input votes structure & check for negative/fractional/duplicates
  if (!Array.isArray(votes)) {
    throw new Error("Format alokasi suara tidak valid.");
  }

  const seenSubmissions = new Set<string>();
  for (const vote of votes) {
    if (!vote || typeof vote.submissionId !== "string" || vote.submissionId.trim() === "") {
      throw new Error("ID karya (submissionId) tidak boleh kosong.");
    }
    if (
      typeof vote.starsCount !== "number" ||
      !Number.isFinite(vote.starsCount) ||
      !Number.isInteger(vote.starsCount)
    ) {
      throw new Error("Jumlah Stars harus berupa bilangan bulat (integer).");
    }
    if (vote.starsCount < 0) {
      throw new Error("Jumlah Stars tidak boleh bernilai negatif.");
    }
    if (seenSubmissions.has(vote.submissionId)) {
      throw new Error(`Duplikasi entri alokasi suara untuk karya ${vote.submissionId}.`);
    }
    seenSubmissions.add(vote.submissionId);
  }

  // 3. Lock Voting Round Row FOR UPDATE
  const [round] = await dbOrTx
    .select()
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, votingRoundId))
    .for("update")
    .limit(1);

  if (!round) {
    throw new Error(`Babak pemungutan suara (ID: ${votingRoundId}) tidak ditemukan.`);
  }

  // 4. Lock Challenge Parent Row FOR UPDATE
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, round.challengeId))
    .for("update")
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge induk tidak ditemukan.");
  }

  // 5. Validate Round Status & Time Window
  if (round.status !== "open") {
    throw new Error(`Babak pemungutan suara sedang tidak dibuka (Status saat ini: "${round.status}").`);
  }

  const expectedChallengeStatus = round.roundType === "main" ? "voting_open" : "tiebreak_open";
  if (challenge.status !== expectedChallengeStatus) {
    throw new Error(
      `Status challenge ("${challenge.status}") tidak mengizinkan pemungutan suara untuk babak ${round.roundType}.`
    );
  }

  const now = new Date();
  if (round.startsAt && now < round.startsAt) {
    throw new Error("Babak pemungutan suara belum dimulai.");
  }
  if (round.deadline && now >= round.deadline) {
    throw new Error("Batas waktu pemungutan suara telah berakhir.");
  }

  // 6. Validate Star Allocation Limits
  const maxStars = round.starsPerMember;
  const totalAllocated = votes.reduce((sum, v) => sum + v.starsCount, 0);

  if (totalAllocated > maxStars) {
    throw new Error(`Total Stars (${totalAllocated}) melebihi alokasi maksimal (${maxStars} Stars).`);
  }

  // 6. Validate Frozen Candidate Set & Anti-Self-Voting
  const frozenCandidates = await dbOrTx
    .select({
      submissionId: challengeVotingRoundCandidates.submissionId,
    })
    .from(challengeVotingRoundCandidates)
    .where(eq(challengeVotingRoundCandidates.votingRoundId, round.id));

  const candidateIdList: string[] = frozenCandidates.map((fc: any) => fc.submissionId);
  const frozenCandidateIds = new Set<string>(candidateIdList);

  const activeSubmissions =
    candidateIdList.length > 0
      ? await dbOrTx
          .select()
          .from(challengeSubmissions)
          .where(inArray(challengeSubmissions.id, candidateIdList))
      : [];

  const submissionMap = new Map(activeSubmissions.map((s: any) => [s.id, s]));

  for (const vote of votes) {
    if (vote.starsCount <= 0) continue;

    if (!frozenCandidateIds.has(vote.submissionId)) {
      throw new Error("Karya tidak terdaftar dalam kandidat resmi babak voting ini.");
    }

    const sub: any = submissionMap.get(vote.submissionId);
    if (!sub) {
      throw new Error("Submisi karya tidak ditemukan.");
    }

    if (sub.userId === voterUserId) {
      throw new Error("Self-voting dilarang dalam aturan atelier.");
    }
  }

  // 7. Upsert Ballot on (votingRoundId, userId)
  const [existingBallot] = await dbOrTx
    .select()
    .from(challengeBallots)
    .where(
      and(
        eq(challengeBallots.votingRoundId, round.id),
        eq(challengeBallots.userId, voterUserId)
      )
    )
    .for("update")
    .limit(1);

  let ballotId = existingBallot?.id;

  if (!existingBallot) {
    const [newBallot] = await dbOrTx
      .insert(challengeBallots)
      .values({
        challengeId: round.challengeId,
        votingRoundId: round.id,
        userId: voterUserId,
        roundType: round.roundType,
        starsAllocated: totalAllocated,
        isFinalized: false,
      })
      .returning();
    ballotId = newBallot.id;
  } else {
    await dbOrTx
      .update(challengeBallots)
      .set({
        starsAllocated: totalAllocated,
        updatedAt: new Date(),
      })
      .where(eq(challengeBallots.id, ballotId!));

    await dbOrTx
      .delete(challengeBallotStars)
      .where(eq(challengeBallotStars.ballotId, ballotId!));
  }

  // 8. Insert Star Allocations
  const activeVotes = votes.filter((v) => v.starsCount > 0);
  if (activeVotes.length > 0) {
    await dbOrTx.insert(challengeBallotStars).values(
      activeVotes.map((v) => ({
        ballotId: ballotId!,
        submissionId: v.submissionId,
        starsCount: v.starsCount,
      }))
    );
  }

  return { success: true, ballotId };
}

/**
 * 4. Reset Ballot Service
 * Operates authoritatively on votingRoundId
 */
export async function resetBallotService(
  dbOrTx: any,
  actor: ServiceContext,
  params: { votingRoundId: string }
) {
  const { votingRoundId } = params;

  if (!actor?.userId) {
    throw new Error("Pengguna autentikasi tidak valid untuk mereset suara.");
  }
  const voterUserId = actor.userId;

  // 1. Verify Actor Status
  const [user] = await dbOrTx
    .select({
      id: users.id,
      membershipStatus: users.membershipStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, voterUserId))
    .limit(1);

  if (!user || user.membershipStatus !== "active" || user.deletedAt) {
    throw new Error("Akun Anda tidak aktif atau sedang ditangguhkan/dicabut. Aksi reset suara ditolak.");
  }

  // 2. Lock Voting Round Row FOR UPDATE
  const [round] = await dbOrTx
    .select()
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, votingRoundId))
    .for("update")
    .limit(1);

  if (!round) {
    throw new Error(`Babak pemungutan suara (ID: ${votingRoundId}) tidak ditemukan.`);
  }

  // 3. Lock Challenge Parent Row FOR UPDATE
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, round.challengeId))
    .for("update")
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge induk tidak ditemukan.");
  }

  if (round.status !== "open") {
    throw new Error(`Reset suara ditolak: Babak voting sedang tidak dibuka (Status saat ini: "${round.status}").`);
  }

  const expectedChallengeStatus = round.roundType === "main" ? "voting_open" : "tiebreak_open";
  if (challenge.status !== expectedChallengeStatus) {
    throw new Error(
      `Reset suara ditolak: Status challenge ("${challenge.status}") tidak mengizinkan reset suara untuk babak ${round.roundType}.`
    );
  }

  const now = new Date();
  if (round.startsAt && now < round.startsAt) {
    throw new Error("Reset suara ditolak: Babak pemungutan suara belum dimulai.");
  }
  if (round.deadline && now >= round.deadline) {
    throw new Error("Reset suara ditolak: Batas waktu voting telah terlewati.");
  }

  const [ballot] = await dbOrTx
    .select()
    .from(challengeBallots)
    .where(
      and(
        eq(challengeBallots.votingRoundId, round.id),
        eq(challengeBallots.userId, voterUserId)
      )
    )
    .for("update")
    .limit(1);

  if (ballot) {
    await dbOrTx.delete(challengeBallotStars).where(eq(challengeBallotStars.ballotId, ballot.id));
    await dbOrTx
      .update(challengeBallots)
      .set({ starsAllocated: 0, updatedAt: new Date() })
      .where(eq(challengeBallots.id, ballot.id));
  }

  return { success: true };
}

/**
 * 5. Finalize Voting Round Service
 * Strictly enforces that deadline must be reached before closing an OPEN round.
 */
export async function finalizeVotingRoundService(
  dbOrTx: any,
  actor: ServiceContext,
  params: { votingRoundId: string }
) {
  const { votingRoundId } = params;

  // 1. Lock Voting Round Row FOR UPDATE
  const [round] = await dbOrTx
    .select()
    .from(challengeVotingRounds)
    .where(eq(challengeVotingRounds.id, votingRoundId))
    .for("update")
    .limit(1);

  if (!round) {
    throw new Error(`Babak pemungutan suara (ID: ${votingRoundId}) tidak ditemukan.`);
  }

  // 2. Lock Challenge Parent Row FOR UPDATE
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, round.challengeId))
    .for("update")
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge induk tidak ditemukan.");
  }

  // 3. Idempotent check
  if (round.status === "closed") {
    return {
      success: true,
      idempotent: true,
      status: "already_closed",
      roundType: round.roundType,
    };
  }

  // Round must be in OPEN status to finalize
  if (round.status !== "open") {
    throw new Error(
      `Babak pemungutan suara tidak dapat difinalisasi karena statusnya "${round.status}" (bukan "open").`
    );
  }

  // Validate Challenge Operational Status matches Round
  const expectedChallengeStatus = round.roundType === "main" ? "voting_open" : "tiebreak_open";
  if (challenge.status !== expectedChallengeStatus) {
    throw new Error(
      `Status challenge ("${challenge.status}") tidak valid untuk finalisasi babak ${round.roundType} (harus "${expectedChallengeStatus}").`
    );
  }

  // Validate Authoritative Persisted Deadline
  if (!round.deadline) {
    throw new Error("Batas waktu (deadline) babak voting tidak terkonfigurasi.");
  }

  const now = new Date();
  if (now < round.deadline) {
    throw new Error(
      `Babak pemungutan suara belum mencapai batas waktu deadline (${round.deadline.toISOString()}). Finalisasi sebelum deadline ditolak.`
    );
  }

  // 5. Close Voting Round
  await dbOrTx
    .update(challengeVotingRounds)
    .set({
      status: "closed",
      finalizedAt: now,
      updatedAt: now,
    })
    .where(eq(challengeVotingRounds.id, round.id));

  // 6. Compute Authoritative Tally
  const tally = await computeAuthoritativeRoundTally(dbOrTx, round.id);

  if (round.roundType === "main") {
    if (tally.outcome === "no_votes") {
      // Zero valid Stars in Main: no Community Winner
      if (challenge.awardMode === "vote_only") {
        await internalTransitionChallengeStatus(
          dbOrTx,
          actor,
          challenge.id,
          "finished",
          "Babak voting utama selesai tanpa ada suara (0 Stars). Challenge selesai tanpa pemenang komunitas."
        );
      } else if (challenge.awardMode === "vote_and_jury") {
        const readiness = await validateJuryPhaseReadinessService(dbOrTx, challenge.id);
        if (!readiness.ready) {
          throw new Error(`Transisi ke 'jury_selection_open' diblokir: ${readiness.reason}`);
        }
        await internalTransitionChallengeStatus(
          dbOrTx,
          actor,
          challenge.id,
          "jury_selection_open",
          "Babak voting utama selesai tanpa suara (0 Stars). Lanjut ke tahap pemilihan juri."
        );
      }
      return {
        success: true,
        outcome: "no_votes" as const,
        winnerSubmissionId: null,
        roundType: "main" as const,
      };
    } else if (tally.outcome === "winner") {
      // Unique positive max: Persist official Community Winner
      await dbOrTx
        .delete(challengeResults)
        .where(
          and(
            eq(challengeResults.challengeId, challenge.id),
            eq(challengeResults.awardType, "community_vote_winner")
          )
        );

      await dbOrTx.insert(challengeResults).values({
        challengeId: challenge.id,
        submissionId: tally.winnerSubmissionId,
        finalRank: 1,
        awardType: "community_vote_winner",
        totalCommunityStars: tally.maxStars,
        resolutionMethod: "unique_main_vote",
        sourceVotingRoundId: round.id,
        isPublished: challenge.awardMode === "vote_only",
      });

      if (challenge.awardMode === "vote_only") {
        await internalTransitionChallengeStatus(
          dbOrTx,
          actor,
          challenge.id,
          "finished",
          `Voting utama selesai: Pemenang komunitas ditetapkan (${tally.maxStars} Stars).`
        );
      } else if (challenge.awardMode === "vote_and_jury") {
        const readiness = await validateJuryPhaseReadinessService(dbOrTx, challenge.id);
        if (!readiness.ready) {
          throw new Error(`Transisi ke 'jury_selection_open' diblokir: ${readiness.reason}`);
        }
        await internalTransitionChallengeStatus(
          dbOrTx,
          actor,
          challenge.id,
          "jury_selection_open",
          `Voting utama selesai: Pemenang komunitas ditetapkan (${tally.maxStars} Stars). Lanjut ke penjurian.`
        );
      }

      return {
        success: true,
        outcome: "winner_resolved" as const,
        winnerSubmissionId: tally.winnerSubmissionId,
        roundType: "main" as const,
      };
    } else {
      // Shared highest positive stars: Transition to TIE_PENDING (do NOT auto-create tiebreak)
      await internalTransitionChallengeStatus(
        dbOrTx,
        actor,
        challenge.id,
        "tie_pending",
        `Voting utama selesai dengan ${tally.tiedSubmissionIds.length} karya seri pada peringkat 1 (${tally.maxStars} Stars). Menunggu keputusan staf.`
      );

      return {
        success: true,
        outcome: "tie_pending" as const,
        sourceVotingRoundId: round.id,
        tiedSubmissionIds: tally.tiedSubmissionIds,
        roundType: "main" as const,
      };
    }
  } else {
    // TIEBREAK round
    if (tally.outcome === "winner") {
      // Unique positive max in tiebreak: Persist official Community Winner
      await dbOrTx
        .delete(challengeResults)
        .where(
          and(
            eq(challengeResults.challengeId, challenge.id),
            eq(challengeResults.awardType, "community_vote_winner")
          )
        );

      await dbOrTx.insert(challengeResults).values({
        challengeId: challenge.id,
        submissionId: tally.winnerSubmissionId,
        finalRank: 1,
        awardType: "community_vote_winner",
        totalCommunityStars: tally.maxStars,
        resolutionMethod: "tiebreak_vote",
        sourceVotingRoundId: round.id,
        isPublished: challenge.awardMode === "vote_only",
      });

      if (challenge.awardMode === "vote_only") {
        await internalTransitionChallengeStatus(
          dbOrTx,
          actor,
          challenge.id,
          "finished",
          `Babak tiebreak selesai: Pemenang komunitas ditetapkan (${tally.maxStars} Stars).`
        );
      } else if (challenge.awardMode === "vote_and_jury") {
        const readiness = await validateJuryPhaseReadinessService(dbOrTx, challenge.id);
        if (!readiness.ready) {
          throw new Error(`Transisi ke 'jury_selection_open' diblokir: ${readiness.reason}`);
        }
        await internalTransitionChallengeStatus(
          dbOrTx,
          actor,
          challenge.id,
          "jury_selection_open",
          `Babak tiebreak selesai: Pemenang komunitas ditetapkan (${tally.maxStars} Stars). Lanjut ke penjurian.`
        );
      }

      return {
        success: true,
        outcome: "winner_resolved" as const,
        winnerSubmissionId: tally.winnerSubmissionId,
        roundType: "tiebreak" as const,
      };
    } else {
      // Tiebreak 0 votes or still tied: Transition to TIE_PENDING (Manual Resolve only)
      const frozenCandidates = await dbOrTx
        .select({ submissionId: challengeVotingRoundCandidates.submissionId })
        .from(challengeVotingRoundCandidates)
        .where(eq(challengeVotingRoundCandidates.votingRoundId, round.id));
      const tiedSubmissionIds: string[] =
        tally.outcome === "tie"
          ? tally.tiedSubmissionIds
          : frozenCandidates.map((c: any) => c.submissionId as string);

      await internalTransitionChallengeStatus(
        dbOrTx,
        actor,
        challenge.id,
        "tie_pending",
        `Babak tiebreak selesai tanpa pemenang tunggal (${tiedSubmissionIds.length} karya seri). Memerlukan resolusi manual staf.`
      );

      return {
        success: true,
        outcome: "tie_pending" as const,
        sourceVotingRoundId: round.id,
        tiedSubmissionIds,
        requiresManualResolve: true,
        roundType: "tiebreak" as const,
      };
    }
  }
}

/**
 * 6. Start Single Optional Tiebreak Round Service
 */
export async function startTiebreakService(
  dbOrTx: any,
  actor: ServiceContext,
  params: {
    challengeId: string;
    deadline?: Date | string;
  }
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya administrator atau moderator yang dapat memulai babak tiebreak.");
  }

  const { challengeId, deadline } = params;

  // 1. Lock Challenge Parent Row FOR UPDATE
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge tidak ditemukan.");
  }

  if (challenge.status !== "tie_pending") {
    throw new Error(
      `Babak tiebreak hanya dapat dimulai saat status challenge adalah "tie_pending" (Status saat ini: "${challenge.status}").`
    );
  }

  // 2. Check if a tiebreak round already exists (Single Tiebreak Round Constraint)
  const existingTiebreakRounds = await dbOrTx
    .select()
    .from(challengeVotingRounds)
    .where(
      and(
        eq(challengeVotingRounds.challengeId, challengeId),
        eq(challengeVotingRounds.roundType, "tiebreak")
      )
    )
    .limit(1);

  if (existingTiebreakRounds.length > 0) {
    throw new Error("Babak tiebreak sudah pernah dibuat untuk challenge ini. Hanya resolusi manual yang diperbolehkan.");
  }

  // 3. Find closed Main Round
  const [mainRound] = await dbOrTx
    .select()
    .from(challengeVotingRounds)
    .where(
      and(
        eq(challengeVotingRounds.challengeId, challengeId),
        eq(challengeVotingRounds.roundType, "main"),
        eq(challengeVotingRounds.status, "closed")
      )
    )
    .limit(1);

  if (!mainRound) {
    throw new Error("Babak voting utama tidak ditemukan atau belum ditutup.");
  }

  // 4. Derive authoritative tied candidate set from Main Round
  const mainTally = await computeAuthoritativeRoundTally(dbOrTx, mainRound.id);
  if (mainTally.outcome !== "tie" || mainTally.tiedSubmissionIds.length < 2) {
    throw new Error("Tidak ditemukan seri pada peringkat 1 babak utama.");
  }

  // 5. Validate Deadline
  const now = new Date();
  let resolvedDeadline: Date;
  if (deadline) {
    resolvedDeadline = new Date(deadline);
    if (isNaN(resolvedDeadline.getTime()) || resolvedDeadline <= now) {
      throw new Error("Batas waktu tiebreak harus berupa tanggal dan waktu di masa mendatang.");
    }
  } else {
    resolvedDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default +24 hours
  }

  // 6. Create Tiebreak Voting Round (starsPerMember = 1)
  const [tiebreakRound] = await dbOrTx
    .insert(challengeVotingRounds)
    .values({
      challengeId,
      roundType: "tiebreak",
      status: "open",
      startsAt: now,
      deadline: resolvedDeadline,
      starsPerMember: 1,
    })
    .returning();

  // 7. Freeze Tied Candidates into challenge_voting_round_candidates
  await dbOrTx.insert(challengeVotingRoundCandidates).values(
    mainTally.tiedSubmissionIds.map((subId: string) => ({
      votingRoundId: tiebreakRound.id,
      submissionId: subId,
    }))
  );

  // 8. Transition Challenge to tiebreak_open
  await internalTransitionChallengeStatus(
    dbOrTx,
    actor,
    challengeId,
    "tiebreak_open",
    `Mulai babak tiebreak untuk ${mainTally.tiedSubmissionIds.length} karya seri hingga ${resolvedDeadline.toISOString()}`
  );

  // 9. Write Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor?.userId ? actor.userId : null,
    action: "challenge.start_tiebreak",
    targetType: "challenge",
    targetId: challengeId,
    reason: `Membuka babak tiebreak dengan deadline ${resolvedDeadline.toISOString()}`,
    metadata: {
      tiebreakRoundId: tiebreakRound.id,
      tiedSubmissionIds: mainTally.tiedSubmissionIds,
      deadline: resolvedDeadline.toISOString(),
    },
  });

  return {
    success: true,
    votingRoundId: tiebreakRound.id,
    deadline: resolvedDeadline,
    tiedCandidatesCount: mainTally.tiedSubmissionIds.length,
  };
}

/**
 * 7. Resolve Tie Manually Service
 * Mandatory reason, selects winner strictly from authoritative tied candidate set.
 */
export async function resolveTieManuallyService(
  dbOrTx: any,
  actor: ServiceContext,
  params: {
    challengeId: string;
    submissionId: string;
    reason: string;
  }
) {
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Hanya administrator atau moderator yang dapat menyelesaikan seri secara manual.");
  }

  const { challengeId, submissionId, reason } = params;

  if (!reason || reason.trim().length < 5) {
    throw new Error("Alasan pemilihan pemenang manual wajib diisi (minimal 5 karakter).");
  }

  // 1. Lock Challenge Parent Row FOR UPDATE
  const [challenge] = await dbOrTx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge tidak ditemukan.");
  }

  if (challenge.status !== "tie_pending") {
    throw new Error(
      `Resolusi manual hanya dapat dilakukan saat challenge berstatus "tie_pending" (Status saat ini: "${challenge.status}").`
    );
  }

  // 2. Resolve Latest Closed Voting Round (Main or Tiebreak)
  const [latestClosedRound] = await dbOrTx
    .select()
    .from(challengeVotingRounds)
    .where(
      and(
        eq(challengeVotingRounds.challengeId, challengeId),
        eq(challengeVotingRounds.status, "closed")
      )
    )
    .orderBy(desc(challengeVotingRounds.createdAt))
    .limit(1);

  if (!latestClosedRound) {
    throw new Error("Tidak ditemukan babak voting yang telah ditutup untuk challenge ini.");
  }

  // 3. Compute Authoritative Tied Candidate Set
  const tally = await computeAuthoritativeRoundTally(dbOrTx, latestClosedRound.id);
  
  const frozenCandidates = await dbOrTx
    .select({ submissionId: challengeVotingRoundCandidates.submissionId })
    .from(challengeVotingRoundCandidates)
    .where(eq(challengeVotingRoundCandidates.votingRoundId, latestClosedRound.id));

  const candidateIdList: string[] = frozenCandidates.map((fc: any) => fc.submissionId as string);

  let tiedSubmissionIds: string[] = [];
  if (tally.outcome === "tie") {
    tiedSubmissionIds = tally.tiedSubmissionIds;
  } else if (tally.outcome === "no_votes" && latestClosedRound.roundType === "tiebreak") {
    tiedSubmissionIds = candidateIdList;
  } else {
    throw new Error("Babak voting terakhir tidak menghasilkan kondisi seri.");
  }

  if (!tiedSubmissionIds.includes(submissionId)) {
    throw new Error(
      "Karya yang dipilih bukan merupakan salah satu dari kandidat resmi yang seri pada babak ini."
    );
  }

  const resolutionMethod =
    latestClosedRound.roundType === "main" ? "manual_main_tie" : "manual_tiebreak_tie";

  // 4. Persist Official Community Winner
  await dbOrTx
    .delete(challengeResults)
    .where(
      and(
        eq(challengeResults.challengeId, challenge.id),
        eq(challengeResults.awardType, "community_vote_winner")
      )
    );

  await dbOrTx.insert(challengeResults).values({
    challengeId: challenge.id,
    submissionId,
    finalRank: 1,
    awardType: "community_vote_winner",
    totalCommunityStars: tally.maxStars,
    resolutionMethod,
    sourceVotingRoundId: latestClosedRound.id,
    isPublished: challenge.awardMode === "vote_only",
  });

  // 5. Transition Challenge to Next State
  if (challenge.awardMode === "vote_only") {
    await internalTransitionChallengeStatus(
      dbOrTx,
      actor,
      challenge.id,
      "finished",
      `Resolusi manual pemenang seri oleh ${actor.role}: ${reason.trim()}`
    );
  } else if (challenge.awardMode === "vote_and_jury") {
    const readiness = await validateJuryPhaseReadinessService(dbOrTx, challenge.id);
    if (!readiness.ready) {
      throw new Error(`Transisi ke 'jury_selection_open' diblokir: ${readiness.reason}`);
    }
    await internalTransitionChallengeStatus(
      dbOrTx,
      actor,
      challenge.id,
      "jury_selection_open",
      `Resolusi manual pemenang komunitas oleh ${actor.role}: ${reason.trim()}. Lanjut ke penjurian.`
    );
  }

  // 6. Write Audit Log
  await dbOrTx.insert(auditLogs).values({
    actorId: actor?.userId ? actor.userId : null,
    action: "challenge.resolve_tie_manually",
    targetType: "challenge",
    targetId: challenge.id,
    reason: `Resolusi manual pemenang seri (${reason.trim()})`,
    metadata: {
      winnerSubmissionId: submissionId,
      sourceVotingRoundId: latestClosedRound.id,
      sourceRoundType: latestClosedRound.roundType,
      resolutionMethod,
      reason: reason.trim(),
    },
  });

  return {
    success: true,
    outcome: "resolved_manually" as const,
    winnerSubmissionId: submissionId,
  };
}
