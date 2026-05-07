/**
 * Run the US and MS schedule parsers against the fixtures and pretty-print
 * the extracted blocks. Used during parser development; not part of the app.
 *
 * Usage:  npx tsx scripts/test-parsers.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractTokens } from "../src/lib/schedule/extract";
import { parseUsSchedule } from "../src/lib/schedule/parse-us";
import { parseMsSchedule } from "../src/lib/schedule/parse-ms";

async function run(label: string, file: string, parser: typeof parseUsSchedule) {
  const data = new Uint8Array(readFileSync(resolve(file)));
  const tokens = await extractTokens(data);
  const result = parser(tokens);
  console.log(`\n=== ${label} ===`);
  if (result.warnings.length) {
    console.log("warnings:", result.warnings);
  }
  console.log(`extracted ${result.blocks.length} blocks:`);
  for (const b of result.blocks) {
    console.log(
      `  cohort=${b.cohortCode.padEnd(4)} ${b.dayType.padEnd(7)} ${b.label.padEnd(14)} ${b.startTime}-${b.endTime}`,
    );
  }
}

async function main() {
  await run("US", "fixtures/us-schedule.pdf", parseUsSchedule);
  await run("MS", "fixtures/ms-schedule.pdf", parseMsSchedule);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
