import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user ? `Welcome, ${user.fullName?.split(" ")[0] ?? "there"}` : "Greenhill Coverage Planner"}
        </h1>
        {user ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            What would you like to do?
          </p>
        ) : null}
      </header>

      {user ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/open"
            className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <h2 className="text-base font-medium">Open coverage</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              See what blocks need cover and sign up.
            </p>
            <span className="mt-3 inline-block text-sm text-zinc-900 group-hover:underline dark:text-zinc-100">
              View open blocks →
            </span>
          </Link>

          <Link
            href="/requests/new"
            className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <h2 className="text-base font-medium">Request coverage</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Post a request when you (or a colleague) need a class covered.
            </p>
            <span className="mt-3 inline-block text-sm text-zinc-900 group-hover:underline dark:text-zinc-100">
              Open form →
            </span>
          </Link>

          <Link
            href="/my-coverage"
            className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <h2 className="text-base font-medium">My coverage</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Blocks you&rsquo;ve signed up to cover.
            </p>
            <span className="mt-3 inline-block text-sm text-zinc-900 group-hover:underline dark:text-zinc-100">
              See my list →
            </span>
          </Link>

          {user.role === "admin" ? (
            <Link
              href="/admin/schedules"
              className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              <h2 className="text-base font-medium">Schedule setup</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Upload, review, and edit the daily schedules for each cohort.
              </p>
              <span className="mt-3 inline-block text-sm text-zinc-900 group-hover:underline dark:text-zinc-100">
                Manage schedules →
              </span>
            </Link>
          ) : null}
        </section>
      ) : (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">
            Coordinate Upper &amp; Middle School class coverage in one place.
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Sign in with your school email to post a coverage request or pick
            up an open block.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Sign in
          </Link>
        </section>
      )}
    </main>
  );
}
