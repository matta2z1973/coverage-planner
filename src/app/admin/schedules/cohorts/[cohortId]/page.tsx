import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockTemplates, cohorts, divisions } from "@/lib/db/schema";
import EditForm from "./edit-form";

export default async function CohortDetailPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  await requireAdmin();
  const { cohortId } = await params;

  const [cohort] = await db
    .select({
      id: cohorts.id,
      code: cohorts.code,
      label: cohorts.label,
      divisionId: cohorts.divisionId,
      divisionCode: divisions.code,
      divisionLabel: divisions.label,
    })
    .from(cohorts)
    .leftJoin(divisions, eq(divisions.id, cohorts.divisionId))
    .where(eq(cohorts.id, cohortId))
    .limit(1);
  if (!cohort) notFound();

  const blocks = await db
    .select()
    .from(blockTemplates)
    .where(eq(blockTemplates.cohortId, cohortId))
    .orderBy(asc(blockTemplates.sortOrder));

  const initialRows = blocks.map((b) => ({
    dayType: b.dayType as "green" | "gold" | "a_day" | "b_day" | "c_day",
    dayNumber: b.dayNumber,
    label: b.label,
    startTime: b.startTime,
    endTime: b.endTime,
    sortOrder: b.sortOrder,
    isCoverable: b.isCoverable,
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {cohort.divisionLabel} — {cohort.label}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Edit this cohort&rsquo;s saved blocks. Changes here replace the
            stored schedule for this cohort only.
          </p>
        </div>
        <Link
          href="/admin/schedules"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← Schedules
        </Link>
      </header>

      <EditForm
        cohortId={cohort.id}
        divisionCode={cohort.divisionCode as "US" | "MS"}
        initialRows={initialRows}
      />
    </main>
  );
}
