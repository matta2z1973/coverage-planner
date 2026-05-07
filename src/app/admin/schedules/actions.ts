"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockTemplates, cohorts, divisions } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { extractTokens } from "@/lib/schedule/extract";
import { parseUsSchedule } from "@/lib/schedule/parse-us";
import { parseMsSchedule } from "@/lib/schedule/parse-ms";
import type { ExtractedBlock } from "@/lib/schedule/types";

const dayTypeEnum = z.enum(["green", "gold", "a_day", "b_day", "c_day"]);

const blockSchema = z.object({
  cohortCode: z.string().min(1),
  dayType: dayTypeEnum,
  label: z.string().min(1).max(60),
  startTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  sortOrder: z.number().int().min(0),
  isCoverable: z.boolean(),
});

export type ParseState =
  | { phase: "idle"; message?: string }
  | {
      phase: "parsed";
      parsedAt: number;
      divisionCode: "US" | "MS";
      blocks: ExtractedBlock[];
      warnings: string[];
    }
  | { phase: "error"; message: string };

export async function parseSchedule(
  _prev: ParseState | undefined,
  formData: FormData,
): Promise<ParseState> {
  await requireAdmin();

  const division = formData.get("division");
  const file = formData.get("file");

  if (division !== "US" && division !== "MS") {
    return { phase: "error", message: "Pick US or MS." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { phase: "error", message: "Please choose a PDF file." };
  }
  if (file.type && !file.type.includes("pdf")) {
    return { phase: "error", message: "File must be a PDF." };
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const tokens = await extractTokens(buf);
  const result = division === "US" ? parseUsSchedule(tokens) : parseMsSchedule(tokens);

  console.log(
    `[parseSchedule] division=${division} bytes=${buf.byteLength} tokens=${tokens.length} blocks=${result.blocks.length} warnings=${result.warnings.length}`,
  );
  if (division === "MS") {
    const gradeTokens = tokens.filter((t) => t.str === "Grade:");
    console.log(
      `[parseSchedule MS] Grade: tokens found at y=`,
      gradeTokens.map((g) => g.y),
    );
    const cohortCounts = result.blocks.reduce<Record<string, number>>(
      (acc, b) => {
        acc[b.cohortCode] = (acc[b.cohortCode] ?? 0) + 1;
        return acc;
      },
      {},
    );
    console.log("[parseSchedule MS] blocks per cohort:", cohortCounts);
  }

  if (result.blocks.length === 0) {
    return {
      phase: "error",
      message:
        result.warnings.join("; ") ||
        "Couldn't extract any blocks from this PDF.",
    };
  }

  return {
    phase: "parsed",
    parsedAt: Date.now(),
    divisionCode: division as "US" | "MS",
    blocks: result.blocks,
    warnings: result.warnings,
  };
}

export type SaveState =
  | { phase: "idle" }
  | { phase: "saved"; cohorts: string[]; total: number }
  | { phase: "error"; message: string };

export async function saveSchedule(
  _prev: SaveState | undefined,
  formData: FormData,
): Promise<SaveState> {
  await requireAdmin();

  const divisionCode = formData.get("divisionCode");
  const payload = formData.get("blocks");
  if (typeof payload !== "string") {
    return { phase: "error", message: "Missing block data." };
  }
  if (divisionCode !== "US" && divisionCode !== "MS") {
    return { phase: "error", message: "Invalid division." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { phase: "error", message: "Block data was not valid JSON." };
  }

  const blocks = z.array(blockSchema).safeParse(parsed);
  if (!blocks.success) {
    return {
      phase: "error",
      message: "Some block rows failed validation. Check time formats (HH:MM:SS) and labels.",
    };
  }
  if (blocks.data.length === 0) {
    return { phase: "error", message: "Save at least one block." };
  }

  const [division] = await db
    .select()
    .from(divisions)
    .where(eq(divisions.code, divisionCode))
    .limit(1);
  if (!division) {
    return { phase: "error", message: `Division ${divisionCode} not found.` };
  }

  const divCohorts = await db
    .select()
    .from(cohorts)
    .where(eq(cohorts.divisionId, division.id));
  const codeToId = new Map(divCohorts.map((c) => [c.code, c.id]));

  const rows = blocks.data.map((b) => {
    const cohortId = codeToId.get(b.cohortCode);
    if (!cohortId) {
      throw new Error(
        `Cohort '${b.cohortCode}' not found for division ${divisionCode}.`,
      );
    }
    return {
      cohortId,
      dayType: b.dayType,
      label: b.label,
      startTime: b.startTime,
      endTime: b.endTime,
      sortOrder: b.sortOrder,
      isCoverable: b.isCoverable,
    };
  });

  // Replace strategy: drop the existing block_templates for these cohorts, then
  // insert the new set. Safe because no academic_days/coverage_slots reference
  // block_templates directly.
  const cohortIds = [...new Set(rows.map((r) => r.cohortId))];

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(blockTemplates)
        .where(inArray(blockTemplates.cohortId, cohortIds));
      await tx.insert(blockTemplates).values(rows);
    });
  } catch (err) {
    return {
      phase: "error",
      message: err instanceof Error ? err.message : "Save failed.",
    };
  }

  revalidatePath("/admin/schedules");

  const labels = divCohorts
    .filter((c) => cohortIds.includes(c.id))
    .map((c) => c.label);
  return { phase: "saved", cohorts: labels, total: rows.length };
}
