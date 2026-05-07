import Link from "next/link";
import { format, parseISO } from "date-fns";
import { eq, asc, sql, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  coverageSlots,
  coverageRequests,
  coverageFiles,
  cohorts,
  divisions,
} from "@/lib/db/schema";
import { ClaimButton } from "@/components/slot-claim-button";
import { SlotEntry, type SlotEntryData } from "@/components/slot-entry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OpenCoveragePage() {
  await requireUser();

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
    .where(
      sql`${coverageSlots.status} = 'open' and ${coverageSlots.date} >= ${today}`,
    )
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

  const byDate = new Map<string, SlotEntryData[]>();
  for (const r of enriched) {
    const arr = byDate.get(r.date) ?? [];
    arr.push(r);
    byDate.set(r.date, arr);
  }
  const orderedDates = [...byDate.keys()].sort();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Open coverage
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {enriched.length === 0
            ? "Nothing open right now. Check back later or post your own."
            : `${enriched.length} block${enriched.length === 1 ? "" : "s"} need cover. Click Claim to sign up.`}
        </p>
      </header>

      {orderedDates.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800">
          <Link
            href="/requests/new"
            className="text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
          >
            Post a coverage request →
          </Link>
        </section>
      ) : null}

      {orderedDates.map((d) => {
        const list = byDate.get(d)!;
        const dt = parseISO(d);
        return (
          <section
            key={d}
            className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
          >
            <h2 className="text-base font-medium">
              {format(dt, "EEEE, MMM d")}
            </h2>
            <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {list.map((slot) => (
                <SlotEntry
                  key={slot.slotId}
                  slot={slot}
                  showDate={false}
                  trailing={<ClaimButton slotId={slot.slotId} />}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
