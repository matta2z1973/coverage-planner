import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  cohorts,
  divisions,
  blockTemplates,
  coverageSlots,
} from "@/lib/db/schema";
import RequestForm, { type RequestFormProps } from "./request-form";

export default async function NewRequestPage() {
  await requireUser();

  const [allDivisions, allCohorts, allBlocks] = await Promise.all([
    db.select().from(divisions).orderBy(divisions.code),
    db.select().from(cohorts).orderBy(cohorts.sortOrder),
    db.select().from(blockTemplates).orderBy(blockTemplates.sortOrder),
  ]);

  // Last US slot — used to suggest a day_number 1-8 for the next request.
  const usCohort = allCohorts.find(
    (c) =>
      allDivisions.find((d) => d.id === c.divisionId)?.code === "US" &&
      c.code === "US",
  );
  const lastUsSlot = usCohort
    ? (
        await db
          .select({
            date: coverageSlots.date,
            dayNumber: coverageSlots.dayNumber,
          })
          .from(coverageSlots)
          .where(eq(coverageSlots.cohortId, usCohort.id))
          .orderBy(desc(coverageSlots.date), desc(coverageSlots.claimedAt))
          .limit(1)
      )[0]
    : undefined;

  const props: RequestFormProps = {
    divisions: allDivisions.map((d) => ({
      id: d.id,
      code: d.code as "US" | "MS",
      label: d.label,
    })),
    cohorts: allCohorts.map((c) => ({
      id: c.id,
      divisionId: c.divisionId,
      code: c.code,
      label: c.label,
    })),
    blocks: allBlocks.map((b) => ({
      id: b.id,
      cohortId: b.cohortId,
      dayType: b.dayType,
      dayNumber: b.dayNumber,
      label: b.label,
      startTime: b.startTime,
      endTime: b.endTime,
      isCoverable: b.isCoverable,
    })),
    seed: lastUsSlot
      ? { date: lastUsSlot.date, dayNumber: lastUsSlot.dayNumber }
      : null,
  };

  return <RequestForm {...props} />;
}
