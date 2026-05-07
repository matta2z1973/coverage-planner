import { NextResponse, type NextRequest } from "next/server";
import { addDays, format } from "date-fns";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  coverageSlots,
  coverageRequests,
  cohorts,
  divisions,
  profiles,
  reminderLog,
} from "@/lib/db/schema";
import {
  buildReminderEmail,
  sendReminderEmail,
  type ReminderSlot,
} from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reminders
 *
 * Runs daily via Vercel Cron. Looks at slots scheduled for tomorrow and emails
 * each coverer a single message that lists everything they're on the hook for.
 * `reminder_log` makes the loop idempotent — if the cron runs twice the same
 * day, the second run finds existing log rows and sends nothing.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically when
 * the env var is set. We accept either Bearer or a `?secret=` query for manual
 * testing.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    const fromHeader = auth.startsWith("Bearer ")
      ? auth.slice("Bearer ".length)
      : "";
    const fromQuery = new URL(request.url).searchParams.get("secret") ?? "";
    if (fromHeader !== expected && fromQuery !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const tomorrowDate = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const rows = await db
    .select({
      slotId: coverageSlots.id,
      requestId: coverageSlots.requestId,
      date: coverageSlots.date,
      startTime: coverageSlots.startTime,
      endTime: coverageSlots.endTime,
      blockLabel: coverageSlots.blockLabel,
      courseTitle: coverageSlots.courseTitle,
      claimerId: coverageSlots.claimedByUserId,
      claimerEmail: profiles.email,
      claimerName: profiles.fullName,
      absentTeacher: coverageRequests.absentTeacherName,
      cohortLabel: cohorts.label,
      divisionLabel: divisions.label,
    })
    .from(coverageSlots)
    .leftJoin(profiles, eq(profiles.id, coverageSlots.claimedByUserId))
    .leftJoin(coverageRequests, eq(coverageRequests.id, coverageSlots.requestId))
    .leftJoin(cohorts, eq(cohorts.id, coverageSlots.cohortId))
    .leftJoin(divisions, eq(divisions.id, cohorts.divisionId))
    .where(
      sql`${coverageSlots.status} = 'claimed' and ${coverageSlots.date} = ${tomorrowDate}`,
    )
    .orderBy(asc(coverageSlots.startTime));

  // Group by claimer.
  type Group = {
    email: string;
    name: string | null;
    slots: Array<ReminderSlot & { slotId: string }>;
  };
  const byClaimer = new Map<string, Group>();
  for (const r of rows) {
    if (!r.claimerId || !r.claimerEmail) continue;
    const g = byClaimer.get(r.claimerId) ?? {
      email: r.claimerEmail,
      name: r.claimerName,
      slots: [],
    };
    g.slots.push({
      slotId: r.slotId,
      requestId: r.requestId,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      blockLabel: r.blockLabel,
      courseTitle: r.courseTitle,
      cohortLabel: r.cohortLabel ?? "",
      divisionLabel: r.divisionLabel ?? "",
      absentTeacher: r.absentTeacher ?? "(unknown)",
    });
    byClaimer.set(r.claimerId, g);
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const summary = {
    candidates: rows.length,
    coverers: byClaimer.size,
    sent: 0,
    skipped: 0,
    errors: [] as Array<{ email: string; message: string }>,
  };

  for (const group of byClaimer.values()) {
    // Reserve a reminder_log row per slot. If any slot in this group has
    // already been logged, skip the email so we don't double-notify on the
    // common "send all-or-nothing" semantics.
    const slotIds = group.slots.map((s) => s.slotId);

    // Insert all log rows in one go; ON CONFLICT DO NOTHING returns only the
    // newly-inserted rows. If we got back fewer than the group size, at least
    // one slot was already reminded.
    const reserved = await db
      .insert(reminderLog)
      .values(slotIds.map((id) => ({ slotId: id })))
      .onConflictDoNothing({ target: reminderLog.slotId })
      .returning({ slotId: reminderLog.slotId });

    if (reserved.length === 0) {
      summary.skipped += 1;
      continue;
    }

    // We send only for the newly-reserved slots so the email matches the log.
    const reservedSet = new Set(reserved.map((r) => r.slotId));
    const fresh = group.slots.filter((s) => reservedSet.has(s.slotId));
    if (fresh.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const built = buildReminderEmail({
      recipientName: group.name,
      recipientEmail: group.email,
      slots: fresh,
      appUrl,
    });
    const send = await sendReminderEmail({
      to: group.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
    });
    if (send.ok) {
      summary.sent += 1;
    } else {
      summary.errors.push({ email: group.email, message: send.message });
      // Roll back the log rows we just reserved so a retry can resend.
      // (Best-effort — if this fails the user just won't get the reminder.)
      for (const id of reserved.map((r) => r.slotId)) {
        try {
          await db.delete(reminderLog).where(eq(reminderLog.slotId, id));
        } catch {
          /* swallow */
        }
      }
    }
  }

  return NextResponse.json({ tomorrow: tomorrowDate, ...summary });
}
