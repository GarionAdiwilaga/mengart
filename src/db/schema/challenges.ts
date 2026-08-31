import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  bigint,
  index,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { profiles } from "./profiles";
import { artworks, artworkVersions } from "./artworks";
import { badges } from "./badges";

export const challengeStatusEnum = pgEnum("challenge_status", [
  "draft",
  "scheduled",
  "submission_open",
  "submission_locked",
  "voting_open",
  "tiebreak_open",
  "tie_pending",
  "jury_selection_open",
  "review",
  "finished",
  "paused",
  "cancelled",
  "results_revoked",
]);

export const awardModeEnum = pgEnum("award_mode", [
  "vote_only",
  "jury_only",
  "vote_and_jury",
  "showcase_only",
]);

export const tieStrategyEnum = pgEnum("tie_strategy", [
  "tiebreak_round",
  "manual",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "draft",
  "submitted",
  "disqualified",
  "withdrawn",
]);

export const slotTypeEnum = pgEnum("slot_type", [
  "community_vote",
  "jury_award",
]);

export const votingRoundTypeEnum = pgEnum("voting_round_type", [
  "main",
  "tiebreak",
]);

export const votingRoundStatusEnum = pgEnum("voting_round_status", [
  "pending",
  "open",
  "closed",
]);

export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    theme: text("theme").notNull(),
    description: text("description").notNull(),
    promptRules: text("prompt_rules").notNull(),
    bannerUrl: text("banner_url"),
    
    // Status & Lifecycle
    status: challengeStatusEnum("status").default("draft").notNull(),
    pausedPreviousStatus: challengeStatusEnum("paused_previous_status"),
    cancellationReason: text("cancellation_reason"),
    isVisible: boolean("is_visible").default(true).notNull(),
    
    // Award Mode & Rules
    awardMode: awardModeEnum("award_mode").default("vote_and_jury").notNull(),
    tieStrategy: tieStrategyEnum("tie_strategy").default("tiebreak_round").notNull(),
    starsPerMember: integer("stars_per_member").default(1).notNull(),
    quorumRequirement: integer("quorum_requirement").default(0).notNull(),
    maxSubmissionsPerArtist: integer("max_submissions_per_artist").default(1).notNull(),
    allowRevisions: boolean("allow_revisions").default(true).notNull(),
    
    // Timestamps
    submissionStartsAt: timestamp("submission_starts_at", { withTimezone: true }),
    submissionDeadline: timestamp("submission_deadline", { withTimezone: true }),
    votingStartsAt: timestamp("voting_starts_at", { withTimezone: true }),
    votingDeadline: timestamp("voting_deadline", { withTimezone: true }),
    
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_challenges_slug").on(table.slug),
    index("idx_challenges_status").on(table.status),
    index("idx_challenges_deadlines").on(table.submissionDeadline, table.votingDeadline),
  ]
);

export const challengeKitFiles = pgTable(
  "challenge_kit_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileStorageKey: text("file_storage_key").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_challenge_kit_challenge_id").on(table.challengeId)]
);

export const challengeWinnerSlots = pgTable(
  "challenge_winner_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    slotType: slotTypeEnum("slot_type").notNull(),
    rank: integer("rank").notNull(),
    title: text("title").notNull(),
    badgeId: uuid("badge_id").references(() => badges.id, { onDelete: "set null" }),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_winner_slots_challenge_id").on(table.challengeId),
    uniqueIndex("uniq_challenge_slot").on(table.challengeId, table.slotType, table.rank),
  ]
);

export const challengeJuryAssignments = pgTable(
  "challenge_jury_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    isRecorder: boolean("is_recorder").default(false).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_jury_challenge_id").on(table.challengeId),
    index("idx_jury_user_id").on(table.userId),
    uniqueIndex("uniq_challenge_jury").on(table.challengeId, table.userId),
    uniqueIndex("uniq_challenge_jury_recorder")
      .on(table.challengeId)
      .where(sql`"is_recorder" = true`),
  ]
);

export const challengeSubmissions = pgTable(
  "challenge_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    artworkId: uuid("artwork_id")
      .notNull()
      .references(() => artworks.id, { onDelete: "restrict" }),
    artworkVersionId: uuid("artwork_version_id")
      .notNull()
      .references(() => artworkVersions.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    softwareUsed: text("software_used"),
    submissionStatus: submissionStatusEnum("submission_status").default("submitted").notNull(),
    disqualificationReason: text("disqualification_reason"),
    disqualifiedBy: uuid("disqualified_by").references(() => users.id, { onDelete: "set null" }),
    disqualifiedAt: timestamp("disqualified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_submissions_challenge_id").on(table.challengeId),
    index("idx_submissions_user_id").on(table.userId),
    index("idx_submissions_status").on(table.submissionStatus),
    uniqueIndex("uniq_challenge_submission_user").on(table.challengeId, table.userId),
  ]
);

// Voting Rounds with Frozen Candidates
export const challengeVotingRounds = pgTable(
  "challenge_voting_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    roundType: votingRoundTypeEnum("round_type").default("main").notNull(),
    roundSequence: integer("round_sequence").default(1).notNull(),
    status: votingRoundStatusEnum("status").default("pending").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    deadline: timestamp("deadline", { withTimezone: true }),
    starsPerMember: integer("stars_per_member").default(1).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_voting_rounds_challenge_id").on(table.challengeId),
    uniqueIndex("uniq_challenge_round_sequence").on(table.challengeId, table.roundSequence),
    uniqueIndex("uniq_challenge_main_round")
      .on(table.challengeId)
      .where(sql`"round_type" = 'main'`),
    uniqueIndex("uniq_challenge_tiebreak_round")
      .on(table.challengeId)
      .where(sql`"round_type" = 'tiebreak'`),
    uniqueIndex("uniq_challenge_open_round")
      .on(table.challengeId)
      .where(sql`"status" = 'open'`),
  ]
);

export const challengeVotingRoundCandidates = pgTable(
  "challenge_voting_round_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    votingRoundId: uuid("voting_round_id")
      .notNull()
      .references(() => challengeVotingRounds.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => challengeSubmissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_round_candidates_round_id").on(table.votingRoundId),
    uniqueIndex("uniq_round_submission_candidate").on(table.votingRoundId, table.submissionId),
  ]
);

// Shared Jury Slot Assignments with Optimistic Concurrency Versioning
export const challengeJurySlotAssignments = pgTable(
  "challenge_jury_slot_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    winnerSlotId: uuid("winner_slot_id")
      .notNull()
      .references(() => challengeWinnerSlots.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => challengeSubmissions.id, { onDelete: "cascade" }),
    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_jury_slot_assignments_challenge_id").on(table.challengeId),
    uniqueIndex("uniq_jury_slot_winner_slot").on(table.challengeId, table.winnerSlotId),
    uniqueIndex("uniq_jury_slot_submission").on(table.challengeId, table.submissionId),
  ]
);

// Dynamic Jury Awards (Blueprint 2.2.1)
export const challengeJuryAwards = pgTable(
  "challenge_jury_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => challengeSubmissions.id, { onDelete: "cascade" }),
    categoryLabel: text("category_label"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_jury_awards_challenge_id").on(table.challengeId),
    index("idx_jury_awards_submission_id").on(table.submissionId),
    index("idx_jury_awards_recorder_id").on(table.recordedByUserId),
  ]
);

