"use client";

import { useActionState, useState } from "react";
import { saveCohortBlocks, type SaveCohortState } from "./actions";

type DayType = "green" | "gold" | "a_day" | "b_day" | "c_day";

type Row = {
  dayType: DayType;
  dayNumber: number | null;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isCoverable: boolean;
};

const DAY_TYPE_ORDER: Record<DayType, number> = {
  green: 0,
  gold: 1,
  a_day: 0,
  b_day: 1,
  c_day: 2,
};

function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const da = DAY_TYPE_ORDER[a.dayType] ?? 99;
    const db = DAY_TYPE_ORDER[b.dayType] ?? 99;
    if (da !== db) return da - db;
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.label.localeCompare(b.label);
  });
}

const initial: SaveCohortState = { phase: "idle" };

export default function EditForm({
  cohortId,
  divisionCode,
  initialRows,
}: {
  cohortId: string;
  divisionCode: "US" | "MS";
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(() => sortRows(initialRows));
  const [state, formAction, saving] = useActionState(saveCohortBlocks, initial);

  const dayTypes: DayType[] =
    divisionCode === "US" ? ["green", "gold"] : ["a_day", "b_day", "c_day"];

  const update = (i: number, patch: Partial<Row>) =>
    setRows((curr) => curr.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  const remove = (i: number) =>
    setRows((curr) => curr.filter((_, j) => j !== i));
  const add = () =>
    setRows((curr) => [
      ...curr,
      {
        dayType: dayTypes[0],
        dayNumber: null,
        label: "",
        startTime: "08:00:00",
        endTime: "08:50:00",
        sortOrder: curr.length,
        isCoverable: true,
      },
    ]);

  const payload = JSON.stringify(
    rows.map((r, i) => ({ ...r, sortOrder: i })),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Day type</th>
              {divisionCode === "US" ? (
                <th className="px-3 py-2">Day #</th>
              ) : null}
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">End</th>
              <th className="px-3 py-2">Coverable</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className="border-t border-zinc-200 dark:border-zinc-800"
              >
                <td className="px-2 py-1">
                  <select
                    value={r.dayType}
                    onChange={(e) =>
                      update(i, { dayType: e.target.value as DayType })
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
                {divisionCode === "US" ? (
                  <td className="px-2 py-1">
                    <select
                      value={r.dayNumber ?? ""}
                      onChange={(e) =>
                        update(i, {
                          dayNumber:
                            e.target.value === ""
                              ? null
                              : parseInt(e.target.value, 10),
                        })
                      }
                      className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="">all</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                ) : null}
                <td className="px-2 py-1">
                  <input
                    value={r.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    className="w-32 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="time"
                    step="60"
                    value={r.startTime.slice(0, 5)}
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
                    value={r.endTime.slice(0, 5)}
                    onChange={(e) =>
                      update(i, { endTime: `${e.target.value}:00` })
                    }
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={r.isCoverable}
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
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={divisionCode === "US" ? 7 : 6}
                  className="px-3 py-6 text-center text-sm text-zinc-500"
                >
                  No blocks. Add one below or upload a PDF on the Schedule
                  setup page.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          + Add block
        </button>

        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="cohortId" value={cohortId} />
          <input type="hidden" name="blocks" value={payload} />
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving
              ? "Saving..."
              : `Save ${rows.length} block${rows.length === 1 ? "" : "s"}`}
          </button>
          {state.phase === "saved" ? (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">
              Saved.
            </span>
          ) : null}
          {state.phase === "error" ? (
            <span className="text-sm text-red-700 dark:text-red-400">
              {state.message}
            </span>
          ) : null}
        </form>
      </div>
    </div>
  );
}
