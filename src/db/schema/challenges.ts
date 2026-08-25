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
import { users } from "./users";
import { profiles } from "./profiles";
import { artworkVersions } from "./artworks";
import { badges } from "./badges";

export const challengeStatusEnum = pgEnum("challenge_status", [
  "draft",
  "scheduled",
  "submission_open",
  "submission_locked",
  "voting_open",
  "tiebreak_open",
  "jury_selection_open",
  "review",
  "finished",
  "paused",
  "cancelled",
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
    starsPerMember: integer("stars_per_member").default(3).notNull(),
    quorumRequirement: integer("quorum_requirement").default(0).notNull(), // 0 = no quorum required
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
    slotType: slotTypeEnum("slot_type").notNull(), // community_vote or jury_award
    rank: integer("rank").notNull(), // 1 = 1st Place, 2 = 2nd Place, etc.
    title: text("title").notNull(), // "Juara 1 Favorit Komunitas", "Pilihan Juri — Best Lighting"
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
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_jury_challenge_id").on(table.challengeId),
    index("idx_jury_user_id").on(table.userId),
    uniqueIndex("uniq_challenge_jury").on(table.challengeId, table.userId),
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
    currentVersionId: uuid("current_version_id"),
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
  ]
);

export const challengeSubmissionVersions = pgTable(
  "challenge_submission_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => challengeSubmissions.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    softwareUsed: text("software_used"),
    artworkVersionId: uuid("artwork_version_id")
      .notNull()
      .references(() => artworkVersions.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_submission_versions_submission_id").on(table.submissionId),
    uniqueIndex("uniq_submission_version").on(table.submissionId, table.versionNumber),
  ]
);
