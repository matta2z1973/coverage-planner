import Link from "next/link";
import { eq, asc, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  coverageSlots,
  coverageRequests,
  coverageFiles,
  cohorts,
  divisions,
} from "@/lib/db/schema";
import { ReleaseButton } from "@/components/slot-claim-button";
import { SlotEntry, type SlotEntryData } from "@/components/slot-entry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MyCoveragePage() {
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      slotId: coverageSlots.id,
      requestId: coverageSlots.requestId,
      date: coverageSlots.date,
      dayType: coverageSlots.dayType,
      dayNumber: coverageSlots.dayNumber,
      blockLabel: coverageSlots.blockLabel,
      courseTitle: coverageSlots.courseTitle,
      startTime: coverageSlots.startTime,
      endTime: coverageSlots.endTime,
      curriculumText: coverageSlots.curriculumText,
      curriculumUrl: coverageSlots.curriculumUrl,
      notes: coverageSlots.notes,
      absentTeacher: coverageRequests.absentTeacherName,
      cohortLabel: cohorts.label,
      divisionLabel: divisions.label,
    })
    .from(coverageSlots)
    .leftJoin(
      coverageRequests,
      eq(coverageRequests.id, coverageSlots.requestId),
    )
    .leftJoin(cohorts, eq(cohorts.id, coverageSlots.cohortId))
    .leftJoin(divisions, eq(divisions.id, cohorts.divisionId))
    .where(eq(coverageSlots.claimedByUserId, user.id))
    .orderBy(asc(coverageSlots.date), asc(coverageSlots.startTime));

  const slotIds = rows.map((r) => r.slotId);
  const fileRows =
    slotIds.length > 0
      ? await db
          .select()
          .from(coverageFiles)
          .where(inArray(coverageFiles.slotId, slotIds))
      : [];

  const supabase = await createSupabaseServerClient();
  const filesBySlot = new Map<
    string,
    Array<{ id: string; fileName: string; url: string | null }>
  >();
  for (const f of fileRows) {
    if (!f.slotId) continue;
    const { data } = await supabase.storage
      .from("curriculum")
      .createSignedUrl(f.storagePath, 60 * 60);
    const arr = filesBySlot.get(f.slotId) ?? [];
    arr.push({ id: f.id, fileName: f.fileName, url: data?.signedUrl ?? null });
    filesBySlot.set(f.slotId, arr);
  }

  const enriched: SlotEntryData[] = rows.map((r) => ({
    slotId: r.slotId,
    requestId: r.requestId,
    date: r.date,
    dayType: r.dayType,
    dayNumber: r.dayNumber,
    blockLabel: r.blockLabel,
    courseTitle: r.courseTitle,
    startTime: r.startTime,
    endTime: r.endTime,
    absentTeacher: r.absentTeacher ?? "(unknown)",
    divisionLabel: r.divisionLabel ?? null,
    cohortLabel: r.cohortLabel ?? null,
    curriculumText: r.curriculumText,
    curriculumUrl: r.curriculumUrl,
    notes: r.notes,
    files: filesBySlot.get(r.slotId) ?? [],
  }));

  const upcoming = enriched.filter((r) => r.date >= today);
  const past = enriched.filter((r) => r.date < today);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My coverage</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Blocks you&rsquo;ve signed up to cover.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <span className="rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Total: {enriched.length}
          </span>
          <span className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            Upcoming: {upcoming.length}
          </span>
          <span className="rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Past: {past.length}
          </span>
        </div>
      </header>

      {enriched.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
          You haven&rsquo;t claimed any coverage yet.{" "}
          <Link
            href="/open"
            className="text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
          >
            See what&rsquo;s open →
          </Link>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-base font-medium">Upcoming</h2>
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {upcoming.map((slot) => (
              <SlotEntry
                key={slot.slotId}
                slot={slot}
                trailing={<ReleaseButton slotId={slot.slotId} />}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-base font-medium">
            Past ({past.length} block{past.length === 1 ? "" : "s"})
          </h2>
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            {past
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((slot) => (
                <SlotEntry key={slot.slotId} slot={slot} />
              ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
