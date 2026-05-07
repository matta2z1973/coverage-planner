"use client";

import { useActionState, useEffect, useState } from "react";
import { parseSchedule, saveSchedule, type ParseState, type SaveState } from "./actions";
import type { ExtractedBlock } from "@/lib/schedule/types";

const initialParse: ParseState = { phase: "idle" };
const initialSave: SaveState = { phase: "idle" };

export default function UploadForm() {
  const [division, setDivision] = useState<"US" | "MS">("US");
  const [parseState, parseAction, parsing] = useActionState(
    parseSchedule,
    initialParse,
  );

  // Keep the dropdown in sync with whatever was actually parsed. React 19's
  // form-action behavior can occasionally reset visible form state even on
  // controlled inputs; this defensively snaps it back.
  useEffect(() => {
    if (parseState.phase === "parsed" && parseState.divisionCode !== division) {
      setDivision(parseState.divisionCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseState]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        {/* The division select sits OUTSIDE the action form on purpose:
            React 19's form-action reset behavior was wiping the visible
            value on submit even with a controlled component. Keeping it
            here, with a hidden input below carrying the value into the
            form, is immune. */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Division</span>
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value as "US" | "MS")}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="US">Upper School</option>
            <option value="MS">Middle School</option>
          </select>
        </label>
        <form action={parseAction} className="contents">
          <input type="hidden" name="division" value={division} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">PDF</span>
            <input
              name="file"
              type="file"
              accept="application/pdf"
              required
              className="text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={parsing}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {parsing ? "Parsing..." : "Parse PDF"}
          </button>
        </form>
      </div>

      {parseState.phase === "error" ? (
        <p className="text-sm text-red-700 dark:text-red-400">
          {parseState.message}
        </p>
      ) : null}

      {parseState.phase === "parsed" ? (
        <ReviewTable
          key={parseState.parsedAt}
          divisionCode={parseState.divisionCode}
          initialBlocks={parseState.blocks}
          warnings={parseState.warnings}
        />
      ) : null}
    </div>
  );
}

const COHORT_ORDER = ["US", "5", "6", "7-8"] as const;
const DAY_TYPE_ORDER: Record<string, number> = {
  green: 0,
  gold: 1,
  a_day: 0,
  b_day: 1,
  c_day: 2,
};

function sortBlocks(blocks: ExtractedBlock[]): ExtractedBlock[] {
  return [...blocks].sort((a, b) => {
    const ca = COHORT_ORDER.indexOf(a.cohortCode as (typeof COHORT_ORDER)[number]);
    const cb = COHORT_ORDER.indexOf(b.cohortCode as (typeof COHORT_ORDER)[number]);
    if (ca !== cb) return ca - cb;
    const da = DAY_TYPE_ORDER[a.dayType] ?? 99;
    const db = DAY_TYPE_ORDER[b.dayType] ?? 99;
    if (da !== db) return da - db;
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.label.localeCompare(b.label);
  });
}

function ReviewTable({
  divisionCode,
  initialBlocks,
  warnings,
}: {
  divisionCode: "US" | "MS";
  initialBlocks: ExtractedBlock[];
  warnings: string[];
}) {
  const [blocks, setBlocks] = useState<ExtractedBlock[]>(() =>
    sortBlocks(initialBlocks),
  );
  const [saveState, saveAction, saving] = useActionState(
    saveSchedule,
    initialSave,
  );

  // After a successful save, hide the editor entirely and show a confirmation.
  if (saveState.phase === "saved") {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
        <p className="font-medium text-emerald-800 dark:text-emerald-200">
          Saved {saveState.total} block{saveState.total === 1 ? "" : "s"} to{" "}
          {saveState.cohorts.join(", ")}.
        </p>
        <p className="mt-1 text-emerald-700 dark:text-emerald-300">
          To make further edits, open the cohort from the list above, or upload
          a new PDF to replace the schedule.
        </p>
      </div>
    );
  }

  const update = (i: number, patch: Partial<ExtractedBlock>) =>
    setBlocks((curr) => curr.map((b, j) => (i === j ? { ...b, ...patch } : b)));
  const remove = (i: number) =>
    setBlocks((curr) => curr.filter((_, j) => j !== i));

  const dayTypes =
    divisionCode === "US" ? ["green", "gold"] : ["a_day", "b_day", "c_day"];
  const cohortCodes =
    divisionCode === "US" ? ["US"] : ["5", "6", "7-8"];

  return (
    <div className="flex flex-col gap-4">
      <div className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500 dark:bg-amber-950/40">
        Review the extracted blocks below. Edit times, labels, or coverable
        flags. Remove any rows that don&rsquo;t belong. <strong>Saving will
        replace</strong> the existing block templates for the affected cohorts.
        {warnings.length ? (
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Cohort</th>
              <th className="px-3 py-2">Day type</th>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">End</th>
              <th className="px-3 py-2">Coverable</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, i) => (
              <tr
                key={i}
                className="border-t border-zinc-200 dark:border-zinc-800"
              >
                <td className="px-2 py-1">
                  <select
                    value={b.cohortCode}
                    onChange={(e) =>
                      update(i, { cohortCode: e.target.value })
                    }
                    className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {cohortCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select
                    value={b.dayType}
                    onChange={(e) =>
                      update(i, {
                        dayType: e.target.value as ExtractedBlock["dayType"],
                      })
                    }
                    className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {dayTypes.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    value={b.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    className="w-32 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="time"
                    step="60"
                    value={b.startTime.slice(0, 5)}
                    onChange={(e) =>
                      update(i, { startTime: `${e.target.value}:00` })
                    }
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="time"
                    step="60"
                    value={b.endTime.slice(0, 5)}
                    onChange={(e) =>
                      update(i, { endTime: `${e.target.value}:00` })
                    }
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={b.isCoverable}
                    onChange={(e) =>
                      update(i, { isCoverable: e.target.checked })
                    }
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {blocks.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-sm text-zinc-500"
                >
                  No blocks. Re-upload to start over.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form action={saveAction} className="flex items-center gap-3">
        <input type="hidden" name="divisionCode" value={divisionCode} />
        <input
          type="hidden"
          name="blocks"
          value={JSON.stringify(
            blocks.map((b, i) => ({ ...b, sortOrder: i })),
          )}
        />
        <button
          type="submit"
          disabled={saving || blocks.length === 0}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving
            ? "Saving..."
            : `Save ${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
        </button>
        {saveState.phase === "error" ? (
          <span className="text-sm text-red-700 dark:text-red-400">
            {saveState.message}
          </span>
        ) : null}
      </form>
    </div>
  );
}
