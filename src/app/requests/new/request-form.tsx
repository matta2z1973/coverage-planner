"use client";

import { useActionState, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  generateDateRows,
  dayTypeFromUsDayNumber,
  type DateRow,
  type DivisionCode,
} from "@/lib/schedule/rotation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createRequest, type CreateRequestState } from "./actions";

export type RequestFormProps = {
  divisions: { id: string; code: DivisionCode; label: string }[];
  cohorts: { id: string; divisionId: string; code: string; label: string }[];
  blocks: {
    id: string;
    cohortId: string;
    dayType: string;
    dayNumber: number | null;
    label: string;
    startTime: string;
    endTime: string;
    isCoverable: boolean;
  }[];
  seed: { date: string; dayNumber: number | null } | null;
  currentUser: {
    role: "faculty" | "admin";
    fullName: string | null;
    email: string;
  };
};

type UploadedFile = { storagePath: string; fileName: string };
type BlockEntry = {
  selected: boolean;
  courseTitle: string;
  curriculumText: string;
  curriculumUrl: string;
  notes: string;
  files: UploadedFile[];
  panelOpen: boolean;
  uploading: number;
  uploadError: string | null;
};

const emptyEntry: BlockEntry = {
  selected: false,
  courseTitle: "",
  curriculumText: "",
  curriculumUrl: "",
  notes: "",
  files: [],
  panelOpen: false,
  uploading: 0,
  uploadError: null,
};

const DAY_TYPE_LABEL: Record<string, string> = {
  green: "Green",
  gold: "Gold",
  a_day: "A Day",
  b_day: "B Day",
  c_day: "C Day",
  no_school: "No school",
};

const initialState: CreateRequestState = { phase: "idle" };

const dayKey = (cohortId: string, date: string) => `${cohortId}|${date}`;
const blockKey = (cohortId: string, date: string, blockId: string) =>
  `${cohortId}|${date}|${blockId}`;

export default function RequestForm({
  divisions,
  cohorts,
  blocks,
  seed,
  currentUser,
}: RequestFormProps) {
  const isAdmin = currentUser.role === "admin";
  const cohortById = useMemo(
    () => new Map(cohorts.map((c) => [c.id, c])),
    [cohorts],
  );
  const divisionById = useMemo(
    () => new Map(divisions.map((d) => [d.id, d])),
    [divisions],
  );

  const today = format(new Date(), "yyyy-MM-dd");
  const [absentTeacher, setAbsentTeacher] = useState(
    isAdmin ? "" : (currentUser.fullName ?? currentUser.email),
  );
  const [absentEmail, setAbsentEmail] = useState(
    isAdmin ? "" : currentUser.email,
  );
  const [selectedCohortIds, setSelectedCohortIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [firstUsDayNumber, setFirstUsDayNumber] = useState<number>(
    seed?.dayNumber ?? 1,
  );
  const [rowsByCohort, setRowsByCohort] = useState<Record<string, DateRow[]>>(
    {},
  );
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<Record<string, BlockEntry>>({});

  const [state, formAction, pending] = useActionState(createRequest, initialState);

  const toggleCohort = (id: string) =>
    setSelectedCohortIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  const isSelected = (id: string) => selectedCohortIds.includes(id);

  const hasUsSelected = selectedCohortIds.some((id) => {
    const c = cohortById.get(id);
    if (!c) return false;
    return divisionById.get(c.divisionId)?.code === "US";
  });

  // Regenerate date rows when inputs change. Default each new day to collapsed.
  useEffect(() => {
    const next: Record<string, DateRow[]> = {};
    for (const cohortId of selectedCohortIds) {
      const cohort = cohortById.get(cohortId);
      if (!cohort) continue;
      const division = divisionById.get(cohort.divisionId);
      if (!division) continue;
      next[cohortId] = generateDateRows({
        start: startDate,
        end: endDate,
        division: division.code,
        firstUsDayNumber: division.code === "US" ? firstUsDayNumber : undefined,
      });
    }
    setRowsByCohort(next);

    // Newly added day-keys default to collapsed.
    setCollapsedDays((prev) => {
      const updated = new Set(prev);
      for (const cohortId of Object.keys(next)) {
        for (const r of next[cohortId]) {
          updated.add(dayKey(cohortId, r.date));
        }
      }
      return updated;
    });
  }, [selectedCohortIds, startDate, endDate, firstUsDayNumber, cohortById, divisionById]);

  const blocksFor = useMemo(() => {
    return (cId: string, dayType: string, dayNumber: number | null) =>
      blocks.filter(
        (b) =>
          b.cohortId === cId &&
          b.dayType === dayType &&
          b.isCoverable &&
          (b.dayNumber === null || b.dayNumber === dayNumber),
      );
  }, [blocks]);

  const getEntry = (key: string) => entries[key] ?? emptyEntry;
  const updateEntry = (key: string, patch: Partial<BlockEntry>) =>
    setEntries((curr) => ({
      ...curr,
      [key]: { ...(curr[key] ?? emptyEntry), ...patch },
    }));

  const toggleDay = (cohortId: string, date: string) =>
    setCollapsedDays((prev) => {
      const k = dayKey(cohortId, date);
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const selectAllForDay = (
    cohortId: string,
    date: string,
    availableIds: string[],
    select: boolean,
  ) => {
    setEntries((curr) => {
      const next = { ...curr };
      for (const blockId of availableIds) {
        const k = blockKey(cohortId, date, blockId);
        next[k] = { ...(next[k] ?? emptyEntry), selected: select };
      }
      return next;
    });
  };

  async function handleFiles(
    e: React.ChangeEvent<HTMLInputElement>,
    key: string,
  ) {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    e.target.value = "";
    updateEntry(key, { uploadError: null });

    const supabase = createSupabaseBrowserClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      updateEntry(key, { uploadError: "Sign in required to upload." });
      return;
    }

    const count = picked.length;
    setEntries((curr) => ({
      ...curr,
      [key]: {
        ...(curr[key] ?? emptyEntry),
        uploading: (curr[key]?.uploading ?? 0) + count,
      },
    }));

    try {
      for (const f of Array.from(picked)) {
        const safeName = f.name.replace(/[^A-Za-z0-9._-]+/g, "_");
        const path = `requests/${userId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}-${safeName}`;
        const { error } = await supabase.storage
          .from("curriculum")
          .upload(path, f, { upsert: false });
        if (error) {
          updateEntry(key, { uploadError: error.message });
          continue;
        }
        setEntries((curr) => {
          const prev = curr[key] ?? emptyEntry;
          return {
            ...curr,
            [key]: {
              ...prev,
              files: [...prev.files, { storagePath: path, fileName: f.name }],
            },
          };
        });
      }
    } finally {
      setEntries((curr) => {
        const prev = curr[key] ?? emptyEntry;
        return {
          ...curr,
          [key]: {
            ...prev,
            uploading: Math.max(0, prev.uploading - count),
          },
        };
      });
    }
  }

  function removeBlockFile(key: string, idx: number) {
    setEntries((curr) => {
      const prev = curr[key] ?? emptyEntry;
      return {
        ...curr,
        [key]: {
          ...prev,
          files: prev.files.filter((_, i) => i !== idx),
        },
      };
    });
  }

  const cohortsByDivision = useMemo(() => {
    const grouped = new Map<string, typeof cohorts>();
    for (const c of cohorts) {
      const arr = grouped.get(c.divisionId) ?? [];
      arr.push(c);
      grouped.set(c.divisionId, arr);
    }
    return divisions.map((d) => ({
      division: d,
      cohorts: grouped.get(d.id) ?? [],
    }));
  }, [cohorts, divisions]);

  // Build the JSON payload submitted to the server action.
  const payload = useMemo(() => {
    type SlotPayload = {
      cohortId: string;
      date: string;
      dayType: string;
      dayNumber: number | null;
      blockLabel: string;
      courseTitle: string;
      startTime: string;
      endTime: string;
      curriculumText: string | null;
      curriculumUrl: string | null;
      notes: string | null;
      files: UploadedFile[];
    };

    const slots: SlotPayload[] = [];
    for (const cohortId of selectedCohortIds) {
      const rows = rowsByCohort[cohortId] || [];
      for (const row of rows) {
        const avail = blocksFor(cohortId, row.dayType, row.dayNumber);
        for (const b of avail) {
          const e = getEntry(blockKey(cohortId, row.date, b.id));
          if (!e.selected) continue;
          slots.push({
            cohortId,
            date: row.date,
            dayType: row.dayType,
            dayNumber: row.dayNumber,
            blockLabel: b.label,
            courseTitle: e.courseTitle.trim(),
            startTime: b.startTime,
            endTime: b.endTime,
            curriculumText: e.curriculumText.trim() || null,
            curriculumUrl: e.curriculumUrl.trim() || null,
            notes: e.notes.trim() || null,
            files: e.files,
          });
        }
      }
    }
    return JSON.stringify({
      absentTeacherName: absentTeacher.trim(),
      absentTeacherEmail: absentEmail.trim() || null,
      slots,
    });
  }, [absentTeacher, absentEmail, selectedCohortIds, rowsByCohort, blocksFor, entries]);

  const totalSelected = Object.values(entries).filter((e) => e.selected).length;
  const anyUploading = Object.values(entries).some((e) => e.uploading > 0);
  const missingTitleCount = Object.values(entries).filter(
    (e) => e.selected && e.courseTitle.trim().length === 0,
  ).length;
  const adminMissingFields =
    isAdmin && (absentTeacher.trim().length === 0 || absentEmail.trim().length === 0);
  const canSubmit =
    !pending &&
    absentTeacher.trim().length > 0 &&
    !adminMissingFields &&
    totalSelected > 0 &&
    missingTitleCount === 0 &&
    !anyUploading;

  const seedHint =
    seed?.date && seed.dayNumber
      ? `Last US request: ${format(parseISO(seed.date), "EEE, MMM d")} was day ${seed.dayNumber}.`
      : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Request coverage
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pick the cohorts you teach, the date(s), and the blocks that need
          coverage. Each block can have its own lesson plan.
        </p>
      </header>

      {/* Section 1: Absent teacher + cohorts */}
      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-medium">Who&rsquo;s out?</h2>
        <div className="mt-3 grid grid-cols-1 gap-3">
          {isAdmin ? (
            <>
              <p className="text-xs text-zinc-500">
                Posting on behalf of someone — fill in their name and school
                email so they get linked to this request.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    Absent teacher name <span className="text-red-600">*</span>
                  </span>
                  <input
                    required
                    value={absentTeacher}
                    onChange={(e) => setAbsentTeacher(e.target.value)}
                    placeholder="e.g. Mr. Smith"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    Absent teacher email <span className="text-red-600">*</span>
                  </span>
                  <input
                    required
                    type="email"
                    value={absentEmail}
                    onChange={(e) => setAbsentEmail(e.target.value)}
                    placeholder="msmith@greenhill.org"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              Posting as: <strong>{currentUser.fullName ?? currentUser.email}</strong>
              {currentUser.fullName ? (
                <span className="ml-2 text-zinc-500">({currentUser.email})</span>
              ) : null}
              <p className="mt-1 text-xs text-zinc-500">
                Faculty can only post requests for themselves. Ask an admin to
                post on someone else&rsquo;s behalf.
              </p>
            </div>
          )}

          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="font-medium">Cohorts taught</legend>
            <p className="text-xs text-zinc-500">
              Pick one or more. A teacher who covers Upper School and 5th
              Grade will get a section for each.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cohortsByDivision.map(({ division, cohorts: list }) => (
                <div
                  key={division.id}
                  className="rounded border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {division.label}
                  </p>
                  <div className="mt-2 flex flex-col gap-1">
                    {list.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected(c.id)}
                          onChange={() => toggleCohort(c.id)}
                        />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      {/* Section 2: Dates */}
      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-medium">When?</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">End date</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {hasUsSelected ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">US day-number of start date</span>
              <select
                value={firstUsDayNumber}
                onChange={(e) =>
                  setFirstUsDayNumber(parseInt(e.target.value, 10))
                }
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} ({dayTypeFromUsDayNumber(n) === "green" ? "Green" : "Gold"})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {hasUsSelected && seedHint ? (
          <p className="mt-2 text-xs text-zinc-500">{seedHint}</p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          Weekends are excluded automatically. To skip a weekday holiday,
          collapse the day and don&rsquo;t select any blocks.
        </p>
      </section>

      {/* Section 3: Per-cohort, per-day */}
      {selectedCohortIds.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800 text-sm text-zinc-500">
          Pick at least one cohort above to set up the day-by-day view.
        </section>
      ) : (
        selectedCohortIds.map((cohortId) => {
          const cohort = cohortById.get(cohortId);
          if (!cohort) return null;
          const division = divisionById.get(cohort.divisionId);
          const rows = rowsByCohort[cohortId] ?? [];

          return (
            <section
              key={cohortId}
              className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <h2 className="text-base font-medium">
                {division?.label} — {cohort.label}
              </h2>

              <div className="mt-4 flex flex-col gap-3">
                {rows.map((row) => {
                  const collapsed = collapsedDays.has(dayKey(cohortId, row.date));
                  const dayDate = parseISO(row.date);
                  const dayLabel = format(dayDate, "EEE, MMM d");
                  const availableBlocks = blocksFor(
                    cohortId,
                    row.dayType,
                    row.dayNumber,
                  );
                  const availableIds = availableBlocks.map((b) => b.id);
                  const selectedCount = availableIds.filter(
                    (id) => getEntry(blockKey(cohortId, row.date, id)).selected,
                  ).length;
                  const allSelected =
                    selectedCount > 0 && selectedCount === availableIds.length;

                  return (
                    <div
                      key={row.date}
                      className="rounded-md border border-zinc-200 dark:border-zinc-800"
                    >
                      {/* Day header */}
                      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleDay(cohortId, row.date)}
                          className="flex items-center gap-2 text-sm font-medium"
                        >
                          <span aria-hidden className="text-xs text-zinc-500">
                            {collapsed ? "▶" : "▼"}
                          </span>
                          <span>{dayLabel}</span>
                          <span className="text-xs text-zinc-500">
                            {DAY_TYPE_LABEL[row.dayType]}
                            {row.dayNumber ? ` · Day ${row.dayNumber}` : ""}
                          </span>
                        </button>

                        <span className="text-xs text-zinc-500">
                          {selectedCount} of {availableIds.length} selected
                        </span>

                        {availableIds.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              selectAllForDay(
                                cohortId,
                                row.date,
                                availableIds,
                                !allSelected,
                              )
                            }
                            className="ml-auto rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                          >
                            {allSelected ? "Clear all" : "Select all"}
                          </button>
                        ) : null}
                      </div>

                      {/* Day body (collapsible) */}
                      {!collapsed ? (
                        availableBlocks.length === 0 ? (
                          <p className="border-t border-zinc-200 px-3 py-2 text-xs text-amber-700 dark:border-zinc-800 dark:text-amber-400">
                            No coverable blocks defined for this cohort &middot;
                            day-type. Upload the schedule first.
                          </p>
                        ) : (
                          <div className="border-t border-zinc-200 dark:border-zinc-800">
                            {availableBlocks.map((b) => {
                              const k = blockKey(cohortId, row.date, b.id);
                              const entry = getEntry(k);
                              return (
                                <div
                                  key={b.id}
                                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60"
                                >
                                  <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={entry.selected}
                                        onChange={(e) =>
                                          updateEntry(k, {
                                            selected: e.target.checked,
                                          })
                                        }
                                      />
                                      <span className="font-medium">
                                        {b.label}
                                      </span>
                                    </label>
                                    <span className="text-xs text-zinc-500">
                                      {b.startTime.slice(0, 5)}&ndash;
                                      {b.endTime.slice(0, 5)}
                                    </span>

                                    {entry.selected ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateEntry(k, {
                                            panelOpen: !entry.panelOpen,
                                          })
                                        }
                                        className="ml-auto rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                                      >
                                        {entry.panelOpen
                                          ? "Hide curriculum"
                                          : entry.curriculumText ||
                                              entry.curriculumUrl ||
                                              entry.notes ||
                                              entry.files.length > 0
                                            ? "Edit curriculum"
                                            : "+ Curriculum / notes"}
                                      </button>
                                    ) : null}
                                  </div>

                                  {entry.selected ? (
                                    <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-sm">
                                      <label className="flex flex-1 items-center gap-2">
                                        <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-zinc-500">
                                          Course title <span className="text-red-600">*</span>
                                        </span>
                                        <input
                                          required
                                          value={entry.courseTitle}
                                          onChange={(e) =>
                                            updateEntry(k, {
                                              courseTitle: e.target.value,
                                            })
                                          }
                                          placeholder="e.g. AP Calculus, 7th Grade English"
                                          className={`flex-1 rounded border bg-white px-2 py-1 text-sm dark:bg-zinc-950 ${
                                            entry.courseTitle.trim().length === 0
                                              ? "border-red-400 dark:border-red-600"
                                              : "border-zinc-300 dark:border-zinc-700"
                                          }`}
                                        />
                                      </label>
                                    </div>
                                  ) : null}

                                  {entry.selected && entry.panelOpen ? (
                                    <CurriculumPanel
                                      entry={entry}
                                      onChange={(patch) => updateEntry(k, patch)}
                                      onPickFiles={(e) => handleFiles(e, k)}
                                      onRemoveFile={(idx) =>
                                        removeBlockFile(k, idx)
                                      }
                                    />
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : null}
                    </div>
                  );
                })}
                {rows.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Pick a date range above to populate days.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })
      )}

      {/* Submit */}
      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="payload" value={payload} />
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending
            ? "Saving..."
            : `Post ${totalSelected} block${totalSelected === 1 ? "" : "s"}`}
        </button>
        {missingTitleCount > 0 ? (
          <span className="text-sm text-red-700 dark:text-red-400">
            {missingTitleCount} block{missingTitleCount === 1 ? "" : "s"} need a course title.
          </span>
        ) : anyUploading ? (
          <span className="text-sm text-zinc-500">
            Wait for uploads to finish...
          </span>
        ) : null}
        {state.phase === "error" ? (
          <span className="text-sm text-red-700 dark:text-red-400">
            {state.message}
          </span>
        ) : null}
      </form>
    </main>
  );
}

function CurriculumPanel({
  entry,
  onChange,
  onPickFiles,
  onRemoveFile,
}: {
  entry: BlockEntry;
  onChange: (patch: Partial<BlockEntry>) => void;
  onPickFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (idx: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 bg-zinc-50 px-3 py-3 text-sm dark:bg-zinc-900/40">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-xs uppercase tracking-wide text-zinc-500">
          Lesson plan / instructions
        </span>
        <textarea
          value={entry.curriculumText}
          onChange={(e) => onChange({ curriculumText: e.target.value })}
          rows={3}
          placeholder="What should the cover-er teach or watch the class do?"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-xs uppercase tracking-wide text-zinc-500">
          Link to materials
        </span>
        <input
          value={entry.curriculumUrl}
          onChange={(e) => onChange({ curriculumUrl: e.target.value })}
          placeholder="https://docs.google.com/..."
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="font-medium text-xs uppercase tracking-wide text-zinc-500">
          Attached files
        </span>
        <input
          type="file"
          multiple
          onChange={onPickFiles}
          className="text-xs"
        />
        {entry.uploading > 0 ? (
          <p className="text-xs text-zinc-500">
            Uploading {entry.uploading}...
          </p>
        ) : null}
        {entry.uploadError ? (
          <p className="text-xs text-red-700 dark:text-red-400">
            {entry.uploadError}
          </p>
        ) : null}
        {entry.files.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {entry.files.map((f, i) => (
              <li
                key={f.storagePath}
                className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="truncate">{f.fileName}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(i)}
                  className="ml-auto text-red-600 hover:underline dark:text-red-400"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-xs uppercase tracking-wide text-zinc-500">
          Other notes
        </span>
        <textarea
          value={entry.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={2}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
    </div>
  );
}
