"use client";

import { useActionState, useState } from "react";
import {
  editSlotSchedule,
  addSlotToRequest,
  type SlotActionState,
} from "@/app/_actions/slots";
import { dayTypeFromUsDayNumber } from "@/lib/schedule/rotation";

type DayType = "green" | "gold" | "a_day" | "b_day" | "c_day";

const initial: SlotActionState = { phase: "idle" };

export type CohortOption = {
  id: string;
  code: string;
  label: string;
  divisionCode: "US" | "MS";
  divisionLabel: string;
};

function shortTime(t: string) {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function isUsCohort(c: CohortOption | undefined) {
  return c?.divisionCode === "US";
}

/* ---------- Edit existing slot's schedule ---------- */

export function EditSlotScheduleForm({
  slotId,
  cohorts,
  initialCohortId,
  initialDate,
  initialDayType,
  initialDayNumber,
  initialBlockLabel,
  initialStartTime,
  initialEndTime,
  onClose,
}: {
  slotId: string;
  cohorts: CohortOption[];
  initialCohortId: string;
  initialDate: string;
  initialDayType: DayType;
  initialDayNumber: number | null;
  initialBlockLabel: string;
  initialStartTime: string;
  initialEndTime: string;
  onClose: () => void;
}) {
  const [cohortId, setCohortId] = useState(initialCohortId);
  const [date, setDate] = useState(initialDate);
  const [dayType, setDayType] = useState<DayType>(initialDayType);
  const [dayNumber, setDayNumber] = useState<number | null>(initialDayNumber);
  const [blockLabel, setBlockLabel] = useState(initialBlockLabel);
  const [startTime, setStartTime] = useState(shortTime(initialStartTime));
  const [endTime, setEndTime] = useState(shortTime(initialEndTime));

  const [state, action, pending] = useActionState(editSlotSchedule, initial);

  const cohort = cohorts.find((c) => c.id === cohortId);
  const usMode = isUsCohort(cohort);

  const payload = JSON.stringify({
    slotId,
    cohortId,
    date,
    dayType,
    dayNumber: usMode ? dayNumber : null,
    blockLabel: blockLabel.trim(),
    startTime: `${startTime}:00`,
    endTime: `${endTime}:00`,
  });

  return (
    <form
      action={action}
      className="mt-3 grid grid-cols-1 gap-3 rounded border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/40 sm:grid-cols-2"
    >
      <input type="hidden" name="payload" value={payload} />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Cohort
        </span>
        <select
          value={cohortId}
          onChange={(e) => {
            setCohortId(e.target.value);
            const next = cohorts.find((c) => c.id === e.target.value);
            // Snap day_type into the right family for the new cohort.
            if (next?.divisionCode === "US") {
              setDayType("green");
              setDayNumber((n) => n ?? 1);
            } else {
              setDayType("a_day");
              setDayNumber(null);
            }
          }}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        >
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.divisionLabel} — {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      {usMode ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Day number (1–8)
          </span>
          <select
            value={dayNumber ?? 1}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setDayNumber(n);
              setDayType(dayTypeFromUsDayNumber(n));
            }}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} ({dayTypeFromUsDayNumber(n)})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Day type
          </span>
          <select
            value={dayType}
            onChange={(e) => setDayType(e.target.value as DayType)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="a_day">A Day</option>
            <option value="b_day">B Day</option>
            <option value="c_day">C Day</option>
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Block label
        </span>
        <input
          value={blockLabel}
          onChange={(e) => setBlockLabel(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Start
        </span>
        <input
          type="time"
          step="60"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          End
        </span>
        <input
          type="time"
          step="60"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <div className="sm:col-span-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || blockLabel.trim().length === 0}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Saving..." : "Save schedule"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
        {state.phase === "ok" ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            {state.message}
          </span>
        ) : null}
        {state.phase === "error" ? (
          <span className="text-xs text-red-700 dark:text-red-400">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/* ---------- Toggleable wrapper for edit ---------- */

export function EditScheduleToggle({
  slotId,
  cohorts,
  initialCohortId,
  initialDate,
  initialDayType,
  initialDayNumber,
  initialBlockLabel,
  initialStartTime,
  initialEndTime,
}: {
  slotId: string;
  cohorts: CohortOption[];
  initialCohortId: string;
  initialDate: string;
  initialDayType: DayType;
  initialDayNumber: number | null;
  initialBlockLabel: string;
  initialStartTime: string;
  initialEndTime: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Edit schedule
      </button>
    );
  }
  return (
    <EditSlotScheduleForm
      slotId={slotId}
      cohorts={cohorts}
      initialCohortId={initialCohortId}
      initialDate={initialDate}
      initialDayType={initialDayType}
      initialDayNumber={initialDayNumber}
      initialBlockLabel={initialBlockLabel}
      initialStartTime={initialStartTime}
      initialEndTime={initialEndTime}
      onClose={() => setOpen(false)}
    />
  );
}

/* ---------- Add a brand-new slot to an existing request ---------- */

export function AddSlotForm({
  requestId,
  cohorts,
  defaultCohortId,
}: {
  requestId: string;
  cohorts: CohortOption[];
  defaultCohortId?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [cohortId, setCohortId] = useState(
    defaultCohortId ?? cohorts[0]?.id ?? "",
  );
  const [date, setDate] = useState(today);
  const [dayType, setDayType] = useState<DayType>(() => {
    const c = cohorts.find((c) => c.id === (defaultCohortId ?? cohorts[0]?.id));
    return c?.divisionCode === "US" ? "green" : "a_day";
  });
  const [dayNumber, setDayNumber] = useState<number | null>(() => {
    const c = cohorts.find((c) => c.id === (defaultCohortId ?? cohorts[0]?.id));
    return c?.divisionCode === "US" ? 1 : null;
  });
  const [blockLabel, setBlockLabel] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:50");

  const [state, action, pending] = useActionState(addSlotToRequest, initial);

  const cohort = cohorts.find((c) => c.id === cohortId);
  const usMode = isUsCohort(cohort);

  const payload = JSON.stringify({
    requestId,
    cohortId,
    date,
    dayType,
    dayNumber: usMode ? dayNumber : null,
    blockLabel: blockLabel.trim(),
    courseTitle: courseTitle.trim(),
    startTime: `${startTime}:00`,
    endTime: `${endTime}:00`,
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + Add another block
      </button>
    );
  }

  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-300 p-4 text-sm dark:border-zinc-700 sm:grid-cols-2"
    >
      <input type="hidden" name="payload" value={payload} />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Cohort
        </span>
        <select
          value={cohortId}
          onChange={(e) => {
            setCohortId(e.target.value);
            const next = cohorts.find((c) => c.id === e.target.value);
            if (next?.divisionCode === "US") {
              setDayType("green");
              setDayNumber((n) => n ?? 1);
            } else {
              setDayType("a_day");
              setDayNumber(null);
            }
          }}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        >
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.divisionLabel} — {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      {usMode ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Day number
          </span>
          <select
            value={dayNumber ?? 1}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setDayNumber(n);
              setDayType(dayTypeFromUsDayNumber(n));
            }}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} ({dayTypeFromUsDayNumber(n)})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Day type
          </span>
          <select
            value={dayType}
            onChange={(e) => setDayType(e.target.value as DayType)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="a_day">A Day</option>
            <option value="b_day">B Day</option>
            <option value="c_day">C Day</option>
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Block label
        </span>
        <input
          required
          value={blockLabel}
          onChange={(e) => setBlockLabel(e.target.value)}
          placeholder="e.g. A, Green, Office Hours"
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Course title <span className="text-red-600">*</span>
        </span>
        <input
          required
          value={courseTitle}
          onChange={(e) => setCourseTitle(e.target.value)}
          placeholder="e.g. AP Calculus"
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Start
        </span>
        <input
          type="time"
          step="60"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          End
        </span>
        <input
          type="time"
          step="60"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <div className="sm:col-span-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={
            pending ||
            blockLabel.trim().length === 0 ||
            courseTitle.trim().length === 0
          }
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Adding..." : "Add slot"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
        {state.phase === "ok" ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            {state.message}
          </span>
        ) : null}
        {state.phase === "error" ? (
          <span className="text-xs text-red-700 dark:text-red-400">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
