import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

export type ReminderSlot = {
  slotId: string;
  requestId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  endTime: string;
  courseTitle: string | null;
  blockLabel: string;
  cohortLabel: string;
  divisionLabel: string;
  absentTeacher: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  // Lightweight date formatting without pulling date-fns server-side here.
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function buildReminderEmail(args: {
  recipientName: string | null;
  recipientEmail: string;
  slots: ReminderSlot[];
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, slots, appUrl } = args;
  const greeting = recipientName?.split(" ")[0] ?? "there";

  const subject =
    slots.length === 1
      ? `Reminder: covering ${slots[0].courseTitle ?? slots[0].blockLabel} tomorrow`
      : `Reminder: covering ${slots.length} blocks tomorrow`;

  const slotItems = slots
    .map((s) => {
      const dateStr = formatDate(s.date);
      const time = `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}`;
      const url = `${appUrl}/requests/${s.requestId}`;
      const course = s.courseTitle ?? "(no course title)";
      return `<li style="margin-bottom: 8px;"><strong>${escapeHtml(dateStr)}, ${escapeHtml(time)}</strong> &mdash; ${escapeHtml(course)} (${escapeHtml(s.divisionLabel)} · ${escapeHtml(s.cohortLabel)} · ${escapeHtml(s.blockLabel)}) for ${escapeHtml(s.absentTeacher)} &mdash; <a href="${url}">view details</a></li>`;
    })
    .join("");

  const html = `<div style="font-family: -apple-system, system-ui, sans-serif; color: #18181b; line-height: 1.5;">
    <p>Hi ${escapeHtml(greeting)},</p>
    <p>This is a reminder that you&rsquo;re covering tomorrow:</p>
    <ul>${slotItems}</ul>
    <p>Need to release a slot? Visit <a href="${appUrl}/my-coverage">My coverage</a>.</p>
    <p style="color: #71717a; font-size: 12px;">Greenhill Coverage Planner</p>
  </div>`;

  const text =
    `Hi ${greeting},\n\n` +
    `This is a reminder that you're covering tomorrow:\n\n` +
    slots
      .map((s) => {
        const dateStr = formatDate(s.date);
        const time = `${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`;
        const course = s.courseTitle ?? "(no course title)";
        return `- ${dateStr}, ${time} — ${course} (${s.divisionLabel} · ${s.cohortLabel} · ${s.blockLabel}) for ${s.absentTeacher}\n  ${appUrl}/requests/${s.requestId}`;
      })
      .join("\n") +
    `\n\nMy coverage: ${appUrl}/my-coverage\n`;

  return { subject, html, text };
}

export async function sendReminderEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    return { ok: false, message: "EMAIL_FROM is not set" };
  }
  try {
    const result = await getResend().emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (result.error) {
      return { ok: false, message: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Email send failed",
    };
  }
}
