/**
 * One-off: confirm the course_title column exists in coverage_slots, and add
 * it directly if missing. Run with `npx tsx scripts/check-column.ts`.
 */
import postgres from "postgres";

process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const sql = postgres(url!, { prepare: false });
  const cols = await sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'coverage_slots'
    order by ordinal_position
  `;
  console.log(
    "coverage_slots columns:",
    cols.map((c) => c.column_name).join(", "),
  );
  const hasCourseTitle = cols.some((c) => c.column_name === "course_title");
  if (!hasCourseTitle) {
    console.log("course_title missing — adding now...");
    await sql`ALTER TABLE coverage_slots ADD COLUMN course_title text`;
    console.log("added.");
  } else {
    console.log("course_title present.");
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
