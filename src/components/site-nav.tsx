import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function SiteNav() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isAdmin = user.role === "admin";

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          Coverage Planner
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Home
          </Link>
          <Link
            href="/open"
            className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Open coverage
          </Link>
          <Link
            href="/requests/new"
            className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Request coverage
          </Link>
          <Link
            href="/my-requests"
            className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            My absences
          </Link>
          <Link
            href="/my-coverage"
            className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            My coverage
          </Link>
          {isAdmin ? (
            <>
              <Link
                href="/reports"
                className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Reports
              </Link>
              <Link
                href="/admin/schedules"
                className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Schedule setup
              </Link>
            </>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="hidden sm:inline">
            {user.fullName ?? user.email}
          </span>
          {isAdmin ? (
            <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              admin
            </span>
          ) : null}
          <form action="/logout" method="post">
            <button
              type="submit"
              className="underline-offset-4 hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
