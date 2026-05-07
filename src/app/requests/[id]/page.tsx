import { notFound } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { eq, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  coverageRequests,
  coverageSlots,
  coverageFiles,
  cohorts,
  divisions,
  profiles,
} from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ClaimButton,
  ReleaseButton,
} from "@/components/slot-claim-button";
import { SlotEditor } from "@/components/slot-editor";

const DAY_TYPE_LABEL: Record<string, string> = {
  green: "Green",
  gold: "Gold",
  a_day: "A Day",
  b_day: "B Day",
  c_day: "C Day",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  claimed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  cancelled: "bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-300",
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [request] = await db
    .select()
    .from(coverageRequests)
    .where(eq(coverageRequests.id, id))
    .limit(1);
  if (!request) notFound();
  const canEdit = user.id === request.createdBy || user.role === "admin";

  const [creator] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, request.createdBy))
    .limit(1);

  // Pull each slot together with its claimer's profile (when claimed).
  const claimer = alias(profiles, "claimer");
  const slots = await db
    .select({
      id: coverageSlots.id,
      requestId: coverageSlots.requestId,
      cohortId: coverageSlots.cohortId,
      date: coverageSlots.date,
      dayType: coverageSlots.dayType,
      dayNumber: coverageSlots.dayNumber,
      blockLabel: coverageSlots.blockLabel,
      courseTitle: coverageSlots.courseTitle,
      startTime: coverageSlots.startTime,
      endTime: coverageSlots.endTime,
      status: coverageSlots.status,
      claimedByUserId: coverageSlots.claimedByUserId,
      claimedAt: coverageSlots.claimedAt,
      curriculumText: coverageSlots.curriculumText,
      curriculumUrl: coverageSlots.curriculumUrl,
      notes: coverageSlots.notes,
      claimerEmail: claimer.email,
      claimerName: claimer.fullName,
    })
    .from(coverageSlots)
    .leftJoin(claimer, eq(claimer.id, coverageSlots.claimedByUserId))
    .where(eq(coverageSlots.requestId, id))
    .orderBy(asc(coverageSlots.date), asc(coverageSlots.startTime));

  const attachments = await db
    .select()
    .from(coverageFiles)
    .where(eq(coverageFiles.requestId, id))
    .orderBy(asc(coverageFiles.uploadedAt));

  // Mint short-lived signed URLs so the file links work without making the
  // bucket public.
  const supabase = await createSupabaseServerClient();
  const filesBySlot = new Map<string, Array<{ id: string; fileName: string; url: string | null }>>();
  for (const a of attachments) {
    const key = a.slotId ?? `request:${a.requestId ?? "_"}`;
    const { data } = await supabase.storage
      .from("curriculum")
      .createSignedUrl(a.storagePath, 60 * 60);
    const arr = filesBySlot.get(key) ?? [];
    arr.push({ id: a.id, fileName: a.fileName, url: data?.signedUrl ?? null });
    filesBySlot.set(key, arr);
  }

  const slotCohorts = await db
    .select({
      id: cohorts.id,
      label: cohorts.label,
      divisionLabel: divisions.label,
    })
    .from(cohorts)
    .leftJoin(divisions, eq(divisions.id, cohorts.divisionId));
  const cohortMap = new Map(slotCohorts.map((c) => [c.id, c]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Coverage for {request.absentTeacherName}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Posted by {creator?.fullName ?? creator?.email ?? "(unknown)"} on{" "}
            {format(request.createdAt, "MMM d, yyyy")}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← Back
        </Link>
      </header>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {slots.length} block{slots.length === 1 ? "" : "s"} · share this page to let colleagues sign up.
      </p>

      <ul className="flex flex-col gap-3">
        {slots.map((s) => {
          const cohort = cohortMap.get(s.cohortId);
          const dt = parseISO(s.date);
          const slotFiles = filesBySlot.get(s.id) ?? [];
          const hasDetails =
            s.curriculumText || s.curriculumUrl || s.notes || slotFiles.length > 0;

          return (
            <li
              key={s.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{format(dt, "EEE, MMM d")}</span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {s.courseTitle ?? "(no course title)"}
                </span>
                <span className="text-zinc-500">
                  {DAY_TYPE_LABEL[s.dayType] ?? s.dayType}
                  {s.dayNumber ? ` · Day ${s.dayNumber}` : ""}
                </span>
                <span className="text-zinc-500">
                  {cohort?.divisionLabel} · {cohort?.label}
                </span>
                <span className="font-medium">{s.blockLabel}</span>
                <span className="text-zinc-500">
                  {s.startTime.slice(0, 5)}&ndash;{s.endTime.slice(0, 5)}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {s.status === "open" ? (
                    <ClaimButton slotId={s.id} />
                  ) : s.status === "claimed" ? (
                    <>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        Claimed by{" "}
                        <span className="font-medium">
                          {s.claimerName ?? s.claimerEmail ?? "(unknown)"}
                        </span>
                      </span>
                      {s.claimedByUserId === user.id || user.role === "admin" ? (
                        <ReleaseButton slotId={s.id} />
                      ) : null}
                    </>
                  ) : (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[s.status] ?? ""
                      }`}
                    >
                      {s.status}
                    </span>
                  )}
                </div>
              </div>

              {hasDetails ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
                  {s.curriculumText ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Lesson plan
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {s.curriculumText}
                      </p>
                    </div>
                  ) : null}
                  {s.curriculumUrl ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Materials
                      </p>
                      <p className="mt-1">
                        <a
                          href={s.curriculumUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                        >
                          {s.curriculumUrl}
                        </a>
                      </p>
                    </div>
                  ) : null}
                  {slotFiles.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Attached files
                      </p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {slotFiles.map((f) => (
                          <li key={f.id}>
                            {f.url ? (
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                              >
                                {f.fileName}
                              </a>
                            ) : (
                              <span className="text-zinc-500">
                                {f.fileName} (link unavailable)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {s.notes ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Notes
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{s.notes}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {canEdit ? (
                <SlotEditor
                  slotId={s.id}
                  initialCourseTitle={s.courseTitle ?? ""}
                  initialCurriculumText={s.curriculumText ?? ""}
                  initialCurriculumUrl={s.curriculumUrl ?? ""}
                  initialNotes={s.notes ?? ""}
                  initialFiles={slotFiles}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
