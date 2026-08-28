import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  numeric,
  index,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import {
  challenges,
  challengeSubmissions,
  challengeWinnerSlots,
  challengeVotingRounds,
} from "./challenges";

export const ballotRoundTypeEnum = pgEnum("ballot_round_type", ["main", "tiebreak"]);

export const challengeBallots = pgTable(
  "challenge_ballots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    votingRoundId: uuid("voting_round_id").references(() => challengeVotingRounds.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roundType: ballotRoundTypeEnum("round_type").default("main").notNull(),
    starsAllocated: integer("stars_allocated").default(0).notNull(),
    isFinalized: boolean("is_finalized").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ballots_challenge_id").on(table.challengeId),
    index("idx_ballots_user_id").on(table.userId),
    index("idx_ballots_voting_round_id").on(table.votingRoundId),
    uniqueIndex("uniq_challenge_user_ballot").on(table.challengeId, table.userId, table.roundType),
  ]
);

export const challengeBallotStars = pgTable(
  "challenge_ballot_stars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ballotId: uuid("ballot_id")
      .notNull()
      .references(() => challengeBallots.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => challengeSubmissions.id, { onDelete: "cascade" }),
    starsCount: integer("stars_count").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ballot_stars_ballot_id").on(table.ballotId),
    index("idx_ballot_stars_submission_id").on(table.submissionId),
    uniqueIndex("uniq_ballot_submission_stars").on(table.ballotId, table.submissionId),
  ]
);

export const challengeJuryScores = pgTable(
  "challenge_jury_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    juryUserId: uuid("jury_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => challengeSubmissions.id, { onDelete: "cascade" }),
    winnerSlotId: uuid("winner_slot_id").references(() => challengeWinnerSlots.id, {
      onDelete: "set null",
    }),
    score: integer("score"),
    critiqueNotes: text("critique_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_jury_scores_challenge_id").on(table.challengeId),
    index("idx_jury_scores_jury_user_id").on(table.juryUserId),
    index("idx_jury_scores_submission_id").on(table.submissionId),
    uniqueIndex("uniq_jury_submission_evaluation").on(
      table.challengeId,
      table.juryUserId,
      table.submissionId
    ),
  ]
);

export const challengeResults = pgTable(
  "challenge_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => challengeSubmissions.id, { onDelete: "cascade" }),
    winnerSlotId: uuid("winner_slot_id").references(() => challengeWinnerSlots.id, {
      onDelete: "set null",
    }),
    finalRank: integer("final_rank"), // Nullable for non-ranked jury award winners
    awardType: text("award_type").default("community_rank").notNull(), // 'community_rank' | 'jury_award' | 'honorable_mention'
    totalCommunityStars: integer("total_community_stars").default(0).notNull(),
    juryScore: numeric("jury_score", { precision: 5, scale: 2 }),
    isPublished: boolean("is_published").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_results_challenge_id").on(table.challengeId),
    index("idx_results_submission_id").on(table.submissionId),
    uniqueIndex("uniq_challenge_result").on(table.challengeId, table.submissionId),
  ]
);
