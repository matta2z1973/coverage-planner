"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { SlotEditor } from "@/components/slot-editor";

const DAY_TYPE_LABEL: Record<string, string> = {
  green: "Green",
  gold: "Gold",
  a_day: "A Day",
  b_day: "B Day",
  c_day: "C Day",
};

export type SlotEntryData = {
  slotId: string;
  requestId: string;
  date: string;
  dayType: string;
  dayNumber: number | null;
  blockLabel: string;
  courseTitle: string | null;
  startTime: string;
  endTime: string;
  absentTeacher: string;
  divisionLabel: string | null;
  cohortLabel: string | null;
  curriculumText: string | null;
  curriculumUrl: string | null;
  notes: string | null;
  files: Array<{ id: string; fileName: string; url: string | null }>;
};

export function SlotEntry({
  slot,
  trailing,
  showDate = true,
  showTeacher = true,
  allowEdit = true,
}: {
  slot: SlotEntryData;
  trailing?: React.ReactNode;
  showDate?: boolean;
  showTeacher?: boolean;
  allowEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dt = parseISO(slot.date);
  const hasDetails =
    !!slot.curriculumText ||
    !!slot.curriculumUrl ||
    !!slot.notes ||
    slot.files.length > 0;

  return (
    <li className="flex flex-col gap-2 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {showDate ? (
          <span className="font-medium">{format(dt, "EEE, MMM d")}</span>
        ) : null}
        {showTeacher ? (
          <Link
            href={`/requests/${slot.requestId}`}
            className="font-medium hover:underline"
          >
            {slot.absentTeacher}
          </Link>
        ) : null}
        <span className="text-zinc-700 dark:text-zinc-300">
          {slot.courseTitle ?? "(no course title)"}
        </span>
        <span className="text-zinc-500">
          {slot.divisionLabel} · {slot.cohortLabel}
        </span>
        <span className="text-zinc-500">
          {DAY_TYPE_LABEL[slot.dayType] ?? slot.dayType}
          {slot.dayNumber ? ` · Day ${slot.dayNumber}` : ""}
        </span>
        <span className="font-medium">{slot.blockLabel}</span>
        <span className="text-zinc-500">
          {slot.startTime.slice(0, 5)}&ndash;{slot.endTime.slice(0, 5)}
        </span>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          disabled={!hasDetails && !allowEdit}
          title={
            hasDetails
              ? "Show curriculum/notes"
              : allowEdit
                ? "Add curriculum/notes"
                : "No curriculum or notes attached"
          }
        >
          {open
            ? "Hide"
            : hasDetails
              ? "Details"
              : allowEdit
                ? "Add details"
                : "No details"}
        </button>

        {trailing ? <span className="ml-auto">{trailing}</span> : null}
      </div>

      {open ? (
        <div className="flex flex-col gap-2">
          {hasDetails ? (
            <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              {slot.curriculumText ? (
                <div className="mb-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Lesson plan
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {slot.curriculumText}
                  </p>
                </div>
              ) : null}
              {slot.curriculumUrl ? (
                <div className="mb-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Materials
                  </p>
                  <a
                    href={slot.curriculumUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                  >
                    {slot.curriculumUrl}
                  </a>
                </div>
              ) : null}
              {slot.files.length > 0 ? (
                <div className="mb-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Files
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {slot.files.map((f) => (
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
              {slot.notes ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{slot.notes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {allowEdit ? (
            <SlotEditor
              slotId={slot.slotId}
              initialCourseTitle={slot.courseTitle ?? ""}
              initialCurriculumText={slot.curriculumText ?? ""}
              initialCurriculumUrl={slot.curriculumUrl ?? ""}
              initialNotes={slot.notes ?? ""}
              initialFiles={slot.files}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
