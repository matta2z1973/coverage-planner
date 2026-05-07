DROP INDEX "block_templates_cohort_daytype_label_idx";--> statement-breakpoint
ALTER TABLE "block_templates" ADD COLUMN "day_number" integer;--> statement-breakpoint
ALTER TABLE "coverage_slots" ADD COLUMN "day_number" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "block_templates_cohort_daytype_daynumber_label_idx" ON "block_templates" USING btree ("cohort_id","day_type","day_number","label");