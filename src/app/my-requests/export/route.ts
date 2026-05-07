import { NextResponse } from "next/server";
import { eq, asc, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireUser } from "@/lib/auth";
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
  "Status",
  "Coverer Name",
  "Coverer Email",
  "Posted On",
];

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const user = await requireUser();
  const claimer = alias(profiles, "claimer");

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
      cohortLabel: cohorts.label,
      divisionLabel: divisions.label,
      claimerName: claimer.fullName,
      claimerEmail: claimer.email,
      createdAt: coverageRequests.createdAt,
    })
    .from(coverageSlots)
    .leftJoin(coverageRequests, eq(coverageRequests.id, coverageSlots.requestId))
    .leftJoin(cohorts, eq(cohorts.id, coverageSlots.cohortId))
    .leftJoin(divisions, eq(divisions.id, cohorts.divisionId))
    .leftJoin(claimer, eq(claimer.id, coverageSlots.claimedByUserId))
    .where(
      or(
        eq(coverageRequests.absentTeacherEmail, user.email),
        eq(coverageRequests.createdBy, user.id),
      ),
    )
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
        r.status,
        r.claimerName ?? "",
        r.claimerEmail ?? "",
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const filename = `my-absences-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
