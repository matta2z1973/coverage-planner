import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { divisions, cohorts, blockTemplates } from "@/lib/db/schema";
import { eq, count, sql } from "drizzle-orm";
import UploadForm from "./upload-form";

export default async function SchedulesPage() {
  await requireAdmin();

  const allDivisions = await db.select().from(divisions).orderBy(divisions.code);
  const allCohorts = await db.select().from(cohorts).orderBy(cohorts.sortOrder);
  const counts = await db
    .select({
      cohortId: blockTemplates.cohortId,
      n: count(blockTemplates.id),
    })
    .from(blockTemplates)
    .groupBy(blockTemplates.cohortId);

  const countByCohort = new Map(counts.map((c) => [c.cohortId, c.n]));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Schedule setup
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Upload the official daily schedule PDF for each division. Coverable
            blocks are extracted automatically; you confirm before saving.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← Back
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {allDivisions.map((division) => {
          const divCohorts = allCohorts.filter(
            (c) => c.divisionId === division.id,
          );
          const totalBlocks = divCohorts.reduce(
            (acc, c) => acc + (countByCohort.get(c.id) ?? 0),
            0,
          );
          return (
            <div
              key={division.id}
              className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <h2 className="text-base font-medium">{division.label}</h2>
              <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                {divCohorts.length} cohort{divCohorts.length === 1 ? "" : "s"}
                {" · "}
                {totalBlocks} block{totalBlocks === 1 ? "" : "s"} saved
              </p>
              <ul className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                {divCohorts.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/schedules/cohorts/${c.id}`}
                      className="flex items-center justify-between rounded px-2 py-1 -mx-2 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <span>{c.label}</span>
                      <span className="text-xs text-zinc-500">
                        {countByCohort.get(c.id) ?? 0} blocks &middot; edit →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-medium">Upload a schedule PDF</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pick the division, then upload its PDF. We&rsquo;ll show the extracted
          blocks for you to review before saving.
        </p>
        <div className="mt-4">
          <UploadForm />
        </div>
      </section>
    </main>
  );
}
