/**
 * One-off dev tool: dumps the positional text content of a PDF to stdout
 * as JSON, sorted top-to-bottom, left-to-right. Used to design the
 * schedule parsers against the real fixtures.
 *
 * Usage:  tsx scripts/dump-pdf.ts fixtures/us-schedule.pdf
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

type Token = { page: number; x: number; y: number; w: number; str: string };

async function dump(path: string): Promise<Token[]> {
  const data = new Uint8Array(readFileSync(path));
  const doc = await getDocument({
    data,
    useSystemFonts: true,
  }).promise;

  const tokens: Token[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const transform = item.transform as number[];
      tokens.push({
        page: p,
        x: Math.round(transform[4] * 10) / 10,
        y: Math.round(transform[5] * 10) / 10,
        w: Math.round(item.width * 10) / 10,
        str: item.str,
      });
    }
  }

  // Sort top-to-bottom (PDF y-coord is bottom-up; bigger y = higher on page),
  // then left-to-right.
  tokens.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
    return a.x - b.x;
  });

  return tokens;
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/dump-pdf.ts <path>");
  process.exit(1);
}

dump(resolve(file)).then((tokens) => {
  console.log(JSON.stringify(tokens, null, 2));
});
