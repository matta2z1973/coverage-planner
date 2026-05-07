ALTER TABLE "coverage_files" ALTER COLUMN "request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coverage_files" ADD COLUMN "slot_id" uuid;--> statement-breakpoint
ALTER TABLE "coverage_slots" ADD COLUMN "curriculum_text" text;--> statement-breakpoint
ALTER TABLE "coverage_slots" ADD COLUMN "curriculum_url" text;--> statement-breakpoint
ALTER TABLE "coverage_slots" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "coverage_files" ADD CONSTRAINT "coverage_files_slot_id_coverage_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."coverage_slots"("id") ON DELETE cascade ON UPDATE no action;