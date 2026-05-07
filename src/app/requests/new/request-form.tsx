"use client";

import { useActionState, useMemo, useState, useEffect } from "react";
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

const DAY_TYPE_SHORT: Record<string, string> = {
  green: "Green",
  gold: "Gold",
  a_day: "A",
  b_day: "B",
  c_day: "C",
  no_school: "—",
};

const initialState: CreateRequestState = { phase: "idle" };

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
  const [entries, setEntries] = useState<Record<string, BlockEntry>>({});
  const [activeCell, setActiveCell] = useState<{
    cohortId: string;
    date: string;
  } | null>(null);

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

  // Regenerate per-cohort date rows when the inputs change.
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
    // If the active cell is no longer in range, close the editor.
    setActiveCell((curr) => {
      if (!curr) return null;
      const stillExists = next[curr.cohortId]?.some((r) => r.date === curr.date);
      return stillExists ? curr : null;
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

  /** Apply a course title + curriculum across every other date in the range
   *  where this cohort has a block with the same label. */
  function applyAcrossRange(args: {
    cohortId: string;
    sourceDate: string;
    blockLabel: string;
    courseTitle: string;
    curriculumText: string;
    curriculumUrl: string;
    notes: string;
    files: UploadedFile[];
  }) {
    setEntries((curr) => {
      const next = { ...curr };
      const rows = rowsByCohort[args.cohortId] ?? [];
      for (const row of rows) {
        if (row.date === args.sourceDate) continue;
        const target = blocksFor(args.cohortId, row.dayType, row.dayNumber).find(
          (b) => b.label === args.blockLabel,
        );
        if (!target) continue;
        const k = blockKey(args.cohortId, row.date, target.id);
        next[k] = {
          ...(next[k] ?? emptyEntry),
          selected: true,
          courseTitle: args.courseTitle,
          curriculumText: args.curriculumText,
          curriculumUrl: args.curriculumUrl,
          notes: args.notes,
          files: args.files,
        };
      }
      return next;
    });
  }

  /** Count of additional dates in the range that share this cohort+block-label
   *  (excluding the source). */
  function matchingDateCount(
    cohortId: string,
    sourceDate: string,
    blockLabel: string,
  ): number {
    const rows = rowsByCohort[cohortId] ?? [];
    let count = 0;
    for (const row of rows) {
      if (row.date === sourceDate) continue;
      const found = blocksFor(cohortId, row.dayType, row.dayNumber).some(
        (b) => b.label === blockLabel,
      );
      if (found) count += 1;
    }
    return count;
  }

  // File upload (per-block).
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

    const list = Array.from(picked);
    setEntries((curr) => ({
      ...curr,
      [key]: {
        ...(curr[key] ?? emptyEntry),
        uploading: (curr[key]?.uploading ?? 0) + list.length,
      },
    }));

    try {
      for (const f of list) {
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
            uploading: Math.max(0, prev.uploading - list.length),
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

  // Build the unified date axis — every weekday in the range.
  const allDates = useMemo(() => {
    const set = new Set<string>();
    for (const cohortId of selectedCohortIds) {
      for (const r of rowsByCohort[cohortId] ?? []) set.add(r.date);
    }
    return [...set].sort();
  }, [selectedCohortIds, rowsByCohort]);

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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Request coverage
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pick the cohorts and dates, then click each cell to choose blocks.
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
              Pick one or more.
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
                      <label key={c.id} className="flex items-center gap-2 text-sm">
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
          Weekends are excluded automatically.
        </p>
      </section>

      {/* Section 3: Coverage matrix */}
      {selectedCohortIds.length === 0 || allDates.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800">
          Pick at least one cohort and a date range to set up the coverage
          matrix.
        </section>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <th
                  className="sticky left-0 z-10 min-w-[180px] border-b border-r border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  Cohort
                </th>
                {allDates.map((d) => {
                  const dt = parseISO(d);
                  return (
                    <th
                      key={d}
                      className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800"
                    >
                      <div className="whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                        {format(dt, "EEE")}
                      </div>
                      <div className="whitespace-nowrap text-zinc-500">
                        {format(dt, "MMM d")}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {selectedCohortIds.map((cohortId) => {
                const cohort = cohortById.get(cohortId);
                if (!cohort) return null;
                const division = divisionById.get(cohort.divisionId);
                const rows = rowsByCohort[cohortId] ?? [];

                return (
                  <tr key={cohortId} className="align-top">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 min-w-[180px] border-r border-b border-zinc-200 bg-white px-3 py-3 text-left dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="text-sm font-medium">{cohort.label}</div>
                      <div className="text-xs text-zinc-500">
                        {division?.label}
                      </div>
                    </th>
                    {allDates.map((date) => {
                      const row = rows.find((r) => r.date === date);
                      if (!row) {
                        return (
                          <td
                            key={date}
                            className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800"
                          >
                            <span className="text-xs text-zinc-400">—</span>
                          </td>
                        );
                      }
                      const avail = blocksFor(cohortId, row.dayType, row.dayNumber);
                      const selected = avail.filter(
                        (b) =>
                          getEntry(blockKey(cohortId, date, b.id)).selected,
                      );
                      const isActive =
                        activeCell?.cohortId === cohortId &&
                        activeCell.date === date;

                      return (
                        <td
                          key={date}
                          className={`border-b border-zinc-200 p-0 dark:border-zinc-800 ${
                            isActive ? "bg-zinc-100 dark:bg-zinc-900" : ""
                          }`}
                        >
                          {avail.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-zinc-400">
                              no blocks
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setActiveCell({ cohortId, date })
                              }
                              className="flex w-full flex-col items-start gap-1 px-3 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
                            >
                              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                {DAY_TYPE_SHORT[row.dayType]}
                                {row.dayNumber ? ` · ${row.dayNumber}` : ""}
                              </span>
                              {selected.length === 0 ? (
                                <span className="text-xs text-zinc-500 underline-offset-2 hover:underline">
                                  + add
                                </span>
                              ) : (
                                <>
                                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                    ★ {selected.length} block
                                    {selected.length === 1 ? "" : "s"}
                                  </span>
                                  <span className="text-xs text-zinc-700 dark:text-zinc-300">
                                    {selected
                                      .map((b) => {
                                        const e = getEntry(
                                          blockKey(cohortId, date, b.id),
                                        );
                                        return `${b.label}${e.courseTitle ? ` · ${e.courseTitle}` : ""}`;
                                      })
                                      .join(", ")}
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Cell editor */}
      {activeCell ? (
        <CellEditor
          activeCell={activeCell}
          cohort={cohortById.get(activeCell.cohortId)}
          division={
            cohortById.get(activeCell.cohortId)
              ? divisionById.get(
                  cohortById.get(activeCell.cohortId)!.divisionId,
                )
              : undefined
          }
          row={
            rowsByCohort[activeCell.cohortId]?.find(
              (r) => r.date === activeCell.date,
            ) ?? null
          }
          availableBlocks={(() => {
            const r = rowsByCohort[activeCell.cohortId]?.find(
              (x) => x.date === activeCell.date,
            );
            if (!r) return [];
            return blocksFor(
              activeCell.cohortId,
              r.dayType,
              r.dayNumber,
            );
          })()}
          getEntry={getEntry}
          updateEntry={updateEntry}
          handleFiles={handleFiles}
          removeBlockFile={removeBlockFile}
          onClose={() => setActiveCell(null)}
          applyAcrossRange={applyAcrossRange}
          matchingDateCount={matchingDateCount}
        />
      ) : null}

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

/* ------------------------------------------------------------------ */

function CellEditor({
  activeCell,
  cohort,
  division,
  row,
  availableBlocks,
  getEntry,
  updateEntry,
  handleFiles,
  removeBlockFile,
  onClose,
  applyAcrossRange,
  matchingDateCount,
}: {
  activeCell: { cohortId: string; date: string };
  cohort: { id: string; label: string } | undefined;
  division: { label: string; code: DivisionCode } | undefined;
  row: DateRow | null;
  availableBlocks: Array<{
    id: string;
    label: string;
    startTime: string;
    endTime: string;
  }>;
  getEntry: (key: string) => BlockEntry;
  updateEntry: (key: string, patch: Partial<BlockEntry>) => void;
  handleFiles: (
    e: React.ChangeEvent<HTMLInputElement>,
    key: string,
  ) => void | Promise<void>;
  removeBlockFile: (key: string, idx: number) => void;
  onClose: () => void;
  applyAcrossRange: (args: {
    cohortId: string;
    sourceDate: string;
    blockLabel: string;
    courseTitle: string;
    curriculumText: string;
    curriculumUrl: string;
    notes: string;
    files: UploadedFile[];
  }) => void;
  matchingDateCount: (
    cohortId: string,
    sourceDate: string,
    blockLabel: string,
  ) => number;
}) {
  if (!cohort || !row) {
    return (
      <section className="rounded-lg border border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800">
        Cell unavailable. <button onClick={onClose}>Close</button>
      </section>
    );
  }
  const dt = parseISO(activeCell.date);

  return (
    <section className="rounded-lg border-2 border-zinc-300 p-5 dark:border-zinc-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">
            {division?.label} — {cohort.label}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            {format(dt, "EEEE, MMM d")} ·{" "}
            <span className="font-medium">
              {DAY_TYPE_SHORT[row.dayType]}
              {row.dayNumber ? ` Day ${row.dayNumber}` : ""}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Done
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {availableBlocks.length === 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No coverable blocks defined for this cohort &middot; day-type.
          </p>
        ) : (
          availableBlocks.map((b) => {
            const k = blockKey(activeCell.cohortId, activeCell.date, b.id);
            const entry = getEntry(k);
            const matches = matchingDateCount(
              activeCell.cohortId,
              activeCell.date,
              b.label,
            );
            return (
              <div
                key={b.id}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={entry.selected}
                      onChange={(e) =>
                        updateEntry(k, { selected: e.target.checked })
                      }
                    />
                    <span className="font-medium">{b.label}</span>
                  </label>
                  <span className="text-xs text-zinc-500">
                    {b.startTime.slice(0, 5)}&ndash;{b.endTime.slice(0, 5)}
                  </span>
                  {entry.selected ? (
                    <button
                      type="button"
                      onClick={() =>
                        updateEntry(k, { panelOpen: !entry.panelOpen })
                      }
                      className="ml-auto rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      {entry.panelOpen ? "Hide curriculum" : "+ Curriculum / notes"}
                    </button>
                  ) : null}
                </div>

                {entry.selected ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <label className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Course title <span className="text-red-600">*</span>
                      </span>
                      <input
                        required
                        value={entry.courseTitle}
                        onChange={(e) =>
                          updateEntry(k, { courseTitle: e.target.value })
                        }
                        placeholder="e.g. AP Calculus"
                        className={`flex-1 rounded border bg-white px-2 py-1 text-sm dark:bg-zinc-950 ${
                          entry.courseTitle.trim().length === 0
                            ? "border-red-400 dark:border-red-600"
                            : "border-zinc-300 dark:border-zinc-700"
                        }`}
                      />
                    </label>

                    {matches > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          applyAcrossRange({
                            cohortId: activeCell.cohortId,
                            sourceDate: activeCell.date,
                            blockLabel: b.label,
                            courseTitle: entry.courseTitle,
                            curriculumText: entry.curriculumText,
                            curriculumUrl: entry.curriculumUrl,
                            notes: entry.notes,
                            files: entry.files,
                          })
                        }
                        disabled={entry.courseTitle.trim().length === 0}
                        className="self-start rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        title={
                          entry.courseTitle.trim().length === 0
                            ? "Enter a course title first"
                            : ""
                        }
                      >
                        Apply &ldquo;
                        {entry.courseTitle.trim() || "this"}
                        &rdquo; to all {b.label} blocks for {cohort.label} ({matches}{" "}
                        more date{matches === 1 ? "" : "s"})
                      </button>
                    ) : null}

                    {entry.panelOpen ? (
                      <CurriculumPanel
                        entry={entry}
                        onChange={(patch) => updateEntry(k, patch)}
                        onPickFiles={(e) => handleFiles(e, k)}
                        onRemoveFile={(idx) => removeBlockFile(k, idx)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
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
    <div className="flex flex-col gap-3 rounded bg-zinc-50 px-3 py-3 text-sm dark:bg-zinc-900/40">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Attached files
        </span>
        <input type="file" multiple onChange={onPickFiles} className="text-xs" />
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
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
