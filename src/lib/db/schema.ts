import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  time,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["faculty", "admin"]);
export const divisionCode = pgEnum("division_code", ["US", "MS"]);
export const dayType = pgEnum("day_type", [
  "green",
  "gold",
  "a_day",
  "b_day",
  "c_day",
  "no_school",
]);
export const rotationKind = pgEnum("rotation_kind", [
  "eight_day",
  "weekly_fixed",
]);
export const slotStatus = pgEnum("slot_status", [
  "open",
  "claimed",
  "cancelled",
]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: userRole("role").notNull().default("faculty"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const divisions = pgTable("divisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: divisionCode("code").notNull().unique(),
  label: text("label").notNull(),
});

// A cohort is a group of students with a shared schedule within a division.
// US has one ("Upper School"). MS has three ("5th Grade", "6th Grade", "7th-8th Grade").
export const cohorts = pgTable(
  "cohorts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    divisionId: uuid("division_id")
      .references(() => divisions.id, { onDelete: "cascade" })
      .notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("cohorts_division_code_idx").on(t.divisionId, t.code)],
);

// A block template is one row of the daily schedule grid for a single cohort
// on a single day-type. Includes coverable academic blocks (Green, A-D, etc.)
// and non-coverable items (Lunch, PE, Athletics) — distinguished by isCoverable.
//
// dayNumber: optional 1-8 for US rotation. NULL means "applies to every
// matching day_type day" (e.g. block A on every Green day). Non-null means
// "applies only on this specific rotation number" (e.g. Office Hours on
// Green-5 at 1:50 but no other Green day).
export const blockTemplates = pgTable(
  "block_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cohortId: uuid("cohort_id")
      .references(() => cohorts.id, { onDelete: "cascade" })
      .notNull(),
    dayType: dayType("day_type").notNull(),
    dayNumber: integer("day_number"),
    label: text("label").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isCoverable: boolean("is_coverable").notNull().default(true),
  },
  (t) => [
    uniqueIndex("block_templates_cohort_daytype_daynumber_label_idx").on(
      t.cohortId,
      t.dayType,
      t.dayNumber,
      t.label,
    ),
  ],
);

// One academic year per division. rotationKind decides how academic_days
// gets populated:
//   - eight_day  (US): seed startDate + startDayType, cycle Green/Gold across school days.
//   - weekly_fixed (MS): day-of-week → day-type lookup, no seed needed.
export const academicYears = pgTable("academic_years", {
  id: uuid("id").primaryKey().defaultRandom(),
  divisionId: uuid("division_id")
    .references(() => divisions.id, { onDelete: "cascade" })
    .notNull(),
  label: text("label").notNull(),
  rotationKind: rotationKind("rotation_kind").notNull(),
  startDate: date("start_date"),
  startDayType: dayType("start_day_type"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const academicDays = pgTable(
  "academic_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academicYearId: uuid("academic_year_id")
      .references(() => academicYears.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    dayType: dayType("day_type").notNull(),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("academic_days_year_date_idx").on(t.academicYearId, t.date),
  ],
);

export const coverageRequests = pgTable(
  "coverage_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdBy: uuid("created_by")
      .references(() => profiles.id)
      .notNull(),
    absentTeacherName: text("absent_teacher_name").notNull(),
    absentTeacherEmail: text("absent_teacher_email"),
    notes: text("notes"),
    curriculumText: text("curriculum_text"),
    curriculumUrl: text("curriculum_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("coverage_requests_created_by_idx").on(t.createdBy),
    index("coverage_requests_absent_email_idx").on(t.absentTeacherEmail),
  ],
);

// Files are attached at the slot level (per-block) starting 2026-05-06.
// requestId is retained for legacy rows; new inserts always set slotId.
export const coverageFiles = pgTable("coverage_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").references(() => coverageRequests.id, {
    onDelete: "cascade",
  }),
  slotId: uuid("slot_id").references(() => coverageSlots.id, {
    onDelete: "cascade",
  }),
  storagePath: text("storage_path").notNull(),
  fileName: text("file_name").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Each slot is one block-on-one-date that needs (or had) coverage.
// cohort_id + date + block_label points back to a block_template, but we
// snapshot start/end times here so reports stay correct if the school
// schedule is edited later.
//
// curriculumText / curriculumUrl / notes live at the slot level so each
// block can have its own lesson plan and instructions for the cover-er.
export const coverageSlots = pgTable(
  "coverage_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .references(() => coverageRequests.id, { onDelete: "cascade" })
      .notNull(),
    cohortId: uuid("cohort_id")
      .references(() => cohorts.id)
      .notNull(),
    date: date("date").notNull(),
    dayType: dayType("day_type").notNull(),
    dayNumber: integer("day_number"),
    blockLabel: text("block_label").notNull(),
    courseTitle: text("course_title"),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    status: slotStatus("status").notNull().default("open"),
    claimedByUserId: uuid("claimed_by_user_id").references(() => profiles.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    curriculumText: text("curriculum_text"),
    curriculumUrl: text("curriculum_url"),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("coverage_slots_request_cohort_date_block_idx").on(
      t.requestId,
      t.cohortId,
      t.date,
      t.blockLabel,
    ),
    index("coverage_slots_claimed_by_idx").on(t.claimedByUserId),
    index("coverage_slots_date_idx").on(t.date),
  ],
);

export const reminderLog = pgTable(
  "reminder_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotId: uuid("slot_id")
      .references(() => coverageSlots.id, { onDelete: "cascade" })
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("reminder_log_slot_idx").on(t.slotId)],
);
