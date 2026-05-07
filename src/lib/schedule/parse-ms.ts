import type { ExtractedBlock, ParseResult, Token } from "./types";
import { parseTimeRange } from "./extract";

const COVERABLE = new Set([
  "Green",
  "Yellow",
  "Red",
  "Blue",
  "Purple",
  "Elective",
  "Office Hours",
]);

const DAY_TO_TYPE: Record<string, "a_day" | "b_day" | "c_day"> = {
  Monday: "c_day",
  Tuesday: "a_day",
  Wednesday: "b_day",
  Thursday: "a_day",
  Friday: "b_day",
};

const TIME_RE = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\*?$/;
const DAY_HEADER_RE =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday)\s*[–-]\s*[A-C]\s*Day$/i;

type CohortBand = { code: string; yTop: number; yBottom: number };
type DayHeader = { dayName: string; x: number };

function findCohortBands(tokens: Token[]): CohortBand[] {
  const grades = tokens
    .filter((t) => t.str === "Grade:")
    .sort((a, b) => b.y - a.y);
  if (grades.length === 0) return [];

  const labeled = grades.map((g) => {
    const head = tokens
      .filter((t) => Math.abs(t.y - g.y) < 6 && t.x < g.x && /\d/.test(t.str))
      .sort((a, b) => b.x - a.x)[0]?.str;
    const code = head === "5" ? "5" : head === "6" ? "6" : "7-8";
    return { code, y: g.y };
  });

  return labeled.map((l, i) => ({
    code: l.code,
    yTop: l.y,
    yBottom: i + 1 < labeled.length ? labeled[i + 1].y : 0,
  }));
}

function findDayHeaders(bandTokens: Token[]): DayHeader[] {
  return bandTokens
    .filter((t) => DAY_HEADER_RE.test(t.str))
    .map((t) => ({ dayName: t.str.split(/\s/)[0], x: t.x }))
    .sort((a, b) => a.x - b.x);
}

function nearestDay(x: number, headers: DayHeader[]): DayHeader | null {
  if (headers.length === 0) return null;
  let best = headers[0];
  let bestDist = Math.abs(headers[0].x - x);
  for (let i = 1; i < headers.length; i++) {
    const d = Math.abs(headers[i].x - x);
    if (d < bestDist) {
      best = headers[i];
      bestDist = d;
    }
  }
  return best;
}

export function parseMsSchedule(tokens: Token[]): ParseResult {
  const warnings: string[] = [];
  const bands = findCohortBands(tokens);
  if (bands.length === 0) {
    return { blocks: [], warnings: ["Could not locate cohort headers."] };
  }

  const blocks: ExtractedBlock[] = [];
  const seen = new Set<string>();
  let sortOrder = 0;

  if (bands.length < 3) {
    warnings.push(
      `Only ${bands.length} cohort header(s) found (expected 3): ${bands.map((b) => b.code).join(", ") || "none"}.`,
    );
  }

  for (const band of bands) {
    const bandTokens = tokens.filter(
      (t) => t.y < band.yTop && t.y > band.yBottom,
    );
    const dayHeaders = findDayHeaders(bandTokens);
    if (dayHeaders.length === 0) {
      warnings.push(`Cohort ${band.code}: no day-column headers found.`);
      continue;
    }

    const timeTokens = bandTokens.filter((t) => TIME_RE.test(t.str));

    for (const tt of timeTokens) {
      const time = parseTimeRange(tt.str);
      if (!time) continue;

      const day = nearestDay(tt.x, dayHeaders);
      if (!day) continue;
      const dayType = DAY_TO_TYPE[day.dayName];
      if (!dayType) continue;

      // Activity = closest non-time token to the right at the same y.
      const partner = bandTokens
        .filter(
          (t) =>
            t !== tt &&
            !TIME_RE.test(t.str) &&
            !DAY_HEADER_RE.test(t.str) &&
            Math.abs(t.y - tt.y) < 4 &&
            t.x > tt.x,
        )
        .sort((a, b) => a.x - b.x)[0];
      if (!partner) continue;

      // Make sure the partner is actually in the SAME day column as the time
      // (i.e., its nearest day-header matches). Otherwise we'd accidentally
      // grab the next day's time token.
      const partnerDay = nearestDay(partner.x, dayHeaders);
      if (!partnerDay || partnerDay.dayName !== day.dayName) continue;

      const label = partner.str.trim();
      if (!COVERABLE.has(label)) continue;

      const key = `${band.code}|${dayType}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);

      blocks.push({
        cohortCode: band.code,
        dayType,
        label,
        startTime: time.start,
        endTime: time.end,
        sortOrder: sortOrder++,
        isCoverable: true,
      });
    }
  }

  if (blocks.length === 0) warnings.push("No blocks extracted.");
  return { blocks, warnings };
}
