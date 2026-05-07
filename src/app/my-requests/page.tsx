import Link from "next/link";
import { format, parseISO } from "date-fns";
import { desc, inArray, sql, or, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { coverageRequests, coverageSlots } from "@/lib/db/schema";

export default async function MyAbsencesPage() {
  const user = await requireUser();

  // "My absences" — every request where the user is the absent teacher.
  // Match by email when set (admin-posted on their behalf or self-posted under
  // the new model); fall back to created_by for legacy rows that pre-date the
  // absent_teacher_email column.
  const requests = await db
    .select()
    .from(coverageRequests)
    .where(
      or(
        eq(coverageRequests.absentTeacherEmail, user.email),
        eq(coverageRequests.createdBy, user.id),
      ),
    )
    .orderBy(desc(coverageRequests.createdAt));

  const requestIds = requests.map((r) => r.id);
  const stats =
    requestIds.length > 0
      ? await db
          .select({
            requestId: coverageSlots.requestId,
            total: sql<number>`count(*)::int`,
            claimed: sql<number>`sum(case when ${coverageSlots.status} = 'claimed' then 1 else 0 end)::int`,
            cancelled: sql<number>`sum(case when ${coverageSlots.status} = 'cancelled' then 1 else 0 end)::int`,
            earliest: sql<string | null>`min(${coverageSlots.date})`,
          })
          .from(coverageSlots)
          .where(inArray(coverageSlots.requestId, requestIds))
          .groupBy(coverageSlots.requestId)
      : [];
  const statsByReq = new Map(stats.map((s) => [s.requestId, s]));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My absences</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Coverage requests where you&rsquo;re the absent teacher.
          </p>
        </div>
        {requests.length > 0 ? (
          <Link
            href="/my-requests/export"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Download CSV
          </Link>
        ) : null}
      </header>

      {requests.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
          You don&rsquo;t have any coverage requests yet.{" "}
          <Link
            href="/requests/new"
            className="text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
          >
            Post one →
          </Link>
        </section>
      ) : (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {requests.map((r) => {
              const s = statsByReq.get(r.id);
              const total = s?.total ?? 0;
              const claimed = s?.claimed ?? 0;
              const cancelled = s?.cancelled ?? 0;
              const open = Math.max(0, total - claimed - cancelled);
              return (
                <li key={r.id} className="px-5 py-3">
                  <Link
                    href={`/requests/${r.id}`}
                    className="flex flex-wrap items-center gap-3 text-sm hover:underline"
                  >
                    <span className="font-medium">{r.absentTeacherName}</span>
                    <span className="text-zinc-500">
                      Posted {format(r.createdAt, "MMM d, yyyy")}
                    </span>
                    {s?.earliest ? (
                      <span className="text-zinc-500">
                        First date: {format(parseISO(s.earliest), "MMM d")}
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-zinc-600 dark:text-zinc-400">
                      {claimed}/{total} claimed
                      {open > 0 ? ` · ${open} open` : ""}
                      {cancelled > 0 ? ` · ${cancelled} cancelled` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
