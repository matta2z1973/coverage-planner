CREATE TYPE "public"."day_type" AS ENUM('green', 'gold', 'a_day', 'b_day', 'c_day', 'no_school');--> statement-breakpoint
CREATE TYPE "public"."division_code" AS ENUM('US', 'MS');--> statement-breakpoint
CREATE TYPE "public"."rotation_kind" AS ENUM('eight_day', 'weekly_fixed');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('open', 'claimed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('faculty', 'admin');--> statement-breakpoint
CREATE TABLE "academic_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_type" "day_type" NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"label" text NOT NULL,
	"rotation_kind" "rotation_kind" NOT NULL,
	"start_date" date,
	"start_day_type" "day_type",
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"day_type" "day_type" NOT NULL,
	"label" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"sort_order" integer NOT NULL,
	"is_coverable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"absent_teacher_name" text NOT NULL,
	"notes" text,
	"curriculum_text" text,
	"curriculum_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_type" "day_type" NOT NULL,
	"block_label" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"status" "slot_status" DEFAULT 'open' NOT NULL,
	"claimed_by_user_id" uuid,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "division_code" NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "divisions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "user_role" DEFAULT 'faculty' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_days" ADD CONSTRAINT "academic_days_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_files" ADD CONSTRAINT "coverage_files_request_id_coverage_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coverage_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_slots" ADD CONSTRAINT "coverage_slots_request_id_coverage_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coverage_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_slots" ADD CONSTRAINT "coverage_slots_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_slots" ADD CONSTRAINT "coverage_slots_claimed_by_user_id_profiles_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_slot_id_coverage_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."coverage_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_days_year_date_idx" ON "academic_days" USING btree ("academic_year_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "block_templates_cohort_daytype_label_idx" ON "block_templates" USING btree ("cohort_id","day_type","label");--> statement-breakpoint
CREATE UNIQUE INDEX "cohorts_division_code_idx" ON "cohorts" USING btree ("division_id","code");--> statement-breakpoint
CREATE INDEX "coverage_requests_created_by_idx" ON "coverage_requests" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_slots_request_cohort_date_block_idx" ON "coverage_slots" USING btree ("request_id","cohort_id","date","block_label");--> statement-breakpoint
CREATE INDEX "coverage_slots_claimed_by_idx" ON "coverage_slots" USING btree ("claimed_by_user_id");--> statement-breakpoint
CREATE INDEX "coverage_slots_date_idx" ON "coverage_slots" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_log_slot_idx" ON "reminder_log" USING btree ("slot_id");