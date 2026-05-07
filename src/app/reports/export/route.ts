import { NextResponse, type NextRequest } from "next/server";
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

const COLUMNS = [
  "Date",
  "Day Type",
  "Day #",
  "Start",
  "End",
  "Division",
  "Cohort",
  "Block",
  "Course Title",
  "Absent Teacher",
  "Coverer Name",
  "Coverer Email",
  "Status",
  "Claimed At",
];

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  await requireAdmin();
  const { searchParams } = new URL(request.url);

  const today = new Date();
  const start = searchParams.get("start") || format(subDays(today, 60), "yyyy-MM-dd");
  const end = searchParams.get("end") || format(today, "yyyy-MM-dd");
  const status = searchParams.get("status") || "claimed";
  const divisionCode = searchParams.get("division") || "";
  const cohortId = searchParams.get("cohort") || "";
  const covererQ = searchParams.get("coverer") || "";

  const claimer = alias(profiles, "claimer");
  const where = [
    sql`${coverageSlots.date} >= ${start}`,
    sql`${coverageSlots.date} <= ${end}`,
  ];
  if (status === "claimed") where.push(sql`${coverageSlots.status} = 'claimed'`);
  if (status === "open") where.push(sql`${coverageSlots.status} = 'open'`);
  if (divisionCode) where.push(sql`${divisions.code} = ${divisionCode}`);
  if (cohortId) where.push(sql`${cohorts.id} = ${cohortId}`);
  if (covererQ) {
    const like = `%${covererQ.toLowerCase()}%`;
    where.push(
      sql`(lower(coalesce(${claimer.fullName}, '')) like ${like} or lower(coalesce(${claimer.email}, '')) like ${like})`,
    );
  }

  const rows = await db
    .select({
      date: coverageSlots.date,
      dayType: coverageSlots.dayType,
      dayNumber: coverageSlots.dayNumber,
      startTime: coverageSlots.startTime,
      endTime: coverageSlots.endTime,
      blockLabel: coverageSlots.blockLabel,
      courseTitle: coverageSlots.courseTitle,
      status: coverageSlots.status,
      claimedAt: coverageSlots.claimedAt,
      absentTeacher: coverageRequests.absentTeacherName,
      cohortLabel: cohorts.label,
      divisionLabel: divisions.label,
      claimerName: claimer.fullName,
      claimerEmail: claimer.email,
    })
    .from(coverageSlots)
    .leftJoin(coverageRequests, eq(coverageRequests.id, coverageSlots.requestId))
    .leftJoin(cohorts, eq(cohorts.id, coverageSlots.cohortId))
    .leftJoin(divisions, eq(divisions.id, cohorts.divisionId))
    .leftJoin(claimer, eq(claimer.id, coverageSlots.claimedByUserId))
    .where(and(...where))
    .orderBy(asc(coverageSlots.date), asc(coverageSlots.startTime));

  const lines: string[] = [COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.dayType,
        r.dayNumber ?? "",
        r.startTime,
        r.endTime,
        r.divisionLabel ?? "",
        r.cohortLabel ?? "",
        r.blockLabel,
        r.courseTitle ?? "",
        r.absentTeacher ?? "",
        r.claimerName ?? "",
        r.claimerEmail ?? "",
        r.status,
        r.claimedAt ? new Date(r.claimedAt).toISOString() : "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const filename = `coverage-${start}-to-${end}.csv`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
