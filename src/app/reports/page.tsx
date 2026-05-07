import Link from "next/link";
import { format, parseISO, subDays } from "date-fns";
import { eq, and, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  coverageRequests,
  coverageSlots,
  cohorts,
  divisions,
  profiles,
} from "@/lib/db/schema";

const DAY_TYPE_LABEL: Record<string, string> = {
  green: "Green",
  gold: "Gold",
  a_day: "A Day",
  b_day: "B Day",
  c_day: "C Day",
};

type SearchParams = {
  start?: string;
  end?: string;
  status?: "claimed" | "open" | "all";
  division?: string;
  cohort?: string;
  coverer?: string;
};

function defaults(): Required<Omit<SearchParams, "division" | "cohort" | "coverer">> {
  const today = new Date();
  return {
    start: format(subDays(today, 60), "yyyy-MM-dd"),
    end: format(today, "yyyy-MM-dd"),
    status: "claimed",
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const def = defaults();
  const start = sp.start || def.start;
  const end = sp.end || def.end;
  const status = sp.status || def.status;
  const divisionCode = sp.division || "";
  const cohortId = sp.cohort || "";
  const covererQ = sp.coverer || "";

  const claimer = alias(profiles, "claimer");

  // Build the where clause progressively.
  const whereClauses = [
    sql`${coverageSlots.date} >= ${start}`,
    sql`${coverageSlots.date} <= ${end}`,
  ];
  if (status === "claimed") whereClauses.push(sql`${coverageSlots.status} = 'claimed'`);
  if (status === "open") whereClauses.push(sql`${coverageSlots.status} = 'open'`);
  if (divisionCode) whereClauses.push(sql`${divisions.code} = ${divisionCode}`);
  if (cohortId) whereClauses.push(sql`${cohorts.id} = ${cohortId}`);
  if (covererQ) {
    const like = `%${covererQ.toLowerCase()}%`;
    whereClauses.push(
      sql`(lower(coalesce(${claimer.fullName}, '')) like ${like} or lower(coalesce(${claimer.email}, '')) like ${like})`,
    );
  }

  const rows = await db
    .select({
      slotId: coverageSlots.id,
      date: coverageSlots.date,
      dayType: coverageSlots.dayType,
      dayNumber: coverageSlots.dayNumber,
      blockLabel: coverageSlots.blockLabel,
      courseTitle: coverageSlots.courseTitle,
      startTime: coverageSlots.startTime,
      endTime: coverageSlots.endTime,
      status: coverageSlots.status,
      claimedAt: coverageSlots.claimedAt,
      absentTeacher: coverageRequests.absentTeacherName,
      requestId: coverageRequests.id,
      cohortLabel: cohorts.label,
      divisionLabel: divisions.label,
      divisionCode: divisions.code,
      claimerName: claimer.fullName,
      claimerEmail: claimer.email,
    })
    .from(coverageSlots)
    .leftJoin(coverageRequests, eq(coverageRequests.id, coverageSlots.requestId))
    .leftJoin(cohorts, eq(cohorts.id, coverageSlots.cohortId))
    .leftJoin(divisions, eq(divisions.id, cohorts.divisionId))
    .leftJoin(claimer, eq(claimer.id, coverageSlots.claimedByUserId))
    .where(and(...whereClauses))
    .orderBy(asc(coverageSlots.date), asc(coverageSlots.startTime));

  // Per-coverer aggregate.
  const byCoverer = new Map<
    string,
    { name: string; email: string; count: number }
  >();
  for (const r of rows) {
    if (r.status !== "claimed") continue;
    const key = r.claimerEmail ?? "(unknown)";
    const existing = byCoverer.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byCoverer.set(key, {
        name: r.claimerName ?? r.claimerEmail ?? "(unknown)",
        email: r.claimerEmail ?? "",
        count: 1,
      });
    }
  }
  const covererTotals = [...byCoverer.values()].sort((a, b) => b.count - a.count);

  const allDivisions = await db.select().from(divisions).orderBy(divisions.code);
  const allCohorts = await db.select().from(cohorts).orderBy(cohorts.sortOrder);

  // Build CSV download URL with the same filter params.
  const exportParams = new URLSearchParams();
  exportParams.set("start", start);
  exportParams.set("end", end);
  exportParams.set("status", status);
  if (divisionCode) exportParams.set("division", divisionCode);
  if (cohortId) exportParams.set("cohort", cohortId);
  if (covererQ) exportParams.set("coverer", covererQ);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Coverage history with filters and CSV export.
          </p>
        </div>
        <Link
          href={`/reports/export?${exportParams.toString()}`}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Download CSV
        </Link>
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 sm:grid-cols-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Start
          </span>
          <input
            type="date"
            name="start"
            defaultValue={start}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            End
          </span>
          <input
            type="date"
            name="end"
            defaultValue={end}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Status
          </span>
          <select
            name="status"
            defaultValue={status}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="claimed">Claimed</option>
            <option value="open">Open</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Division
          </span>
          <select
            name="division"
            defaultValue={divisionCode}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {allDivisions.map((d) => (
              <option key={d.id} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cohort
          </span>
          <select
            name="cohort"
            defaultValue={cohortId}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {allCohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Coverer (name/email)
          </span>
          <input
            type="text"
            name="coverer"
            defaultValue={covererQ}
            placeholder="e.g. smith"
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <div className="flex items-end sm:col-span-6">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Apply filters
          </button>
        </div>
      </form>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Total rows
          </p>
          <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Unique coverers
          </p>
          <p className="mt-1 text-2xl font-semibold">{covererTotals.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Window
          </p>
          <p className="mt-1 text-sm">
            {format(parseISO(start), "MMM d, yyyy")} &ndash;{" "}
            {format(parseISO(end), "MMM d, yyyy")}
          </p>
        </div>
      </section>

      {covererTotals.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-base font-medium">Coverers — totals</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-1">Coverer</th>
                <th className="px-2 py-1">Email</th>
                <th className="px-2 py-1 text-right">Blocks covered</th>
              </tr>
            </thead>
            <tbody>
              {covererTotals.map((c) => (
                <tr
                  key={c.email}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-2 py-1 font-medium">{c.name}</td>
                  <td className="px-2 py-1 text-zinc-500">{c.email}</td>
                  <td className="px-2 py-1 text-right">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Division · cohort</th>
              <th className="px-3 py-2">Day · block</th>
              <th className="px-3 py-2">Course</th>
              <th className="px-3 py-2">Absent</th>
              <th className="px-3 py-2">Coverer</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-sm text-zinc-500"
                >
                  No rows for the current filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.slotId}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/requests/${r.requestId}`}
                      className="hover:underline"
                    >
                      {format(parseISO(r.date), "EEE, MMM d")}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-zinc-500">
                    {r.startTime.slice(0, 5)}&ndash;{r.endTime.slice(0, 5)}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-500">
                    {r.divisionLabel} · {r.cohortLabel}
                  </td>
                  <td className="px-3 py-1.5">
                    {DAY_TYPE_LABEL[r.dayType] ?? r.dayType}
                    {r.dayNumber ? ` · Day ${r.dayNumber}` : ""}
                    {" · "}
                    <span className="font-medium">{r.blockLabel}</span>
                  </td>
                  <td className="px-3 py-1.5">{r.courseTitle ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.absentTeacher}</td>
                  <td className="px-3 py-1.5">
                    {r.claimerName ?? r.claimerEmail ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">{r.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
