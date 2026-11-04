import { SBC_INDEX, SBC_STAGE } from "../data/sbc-book.ts";
import { findSbcRow } from "../data/sbc-rows.ts";
import type { SbcQuote, SbcSheetInput } from "./types.ts";

export function quoteSbc(input: SbcSheetInput): SbcQuote {
  const extra = Number.isFinite(input.k) && input.k >= 0 ? input.k : 1;
  const warnings: string[] = [];
  let base = 0;
  let factored = 0;
  let now = 0;
  const lines = input.lines.map((line) => {
    const source = findSbcRow(line.rowId);
    const custom = line.rowId === "custom";
    const a = custom ? Number(line.a) || 0 : source.a ?? 0;
    const b = custom ? (line.b === null ? null : Number(line.b)) : source.b;
    const x = Number(line.x) || 0;
    const raw = b === null ? a * x : a + b * x;
    const thousand = raw * SBC_STAGE[input.stage] * extra;
    const current = Math.round(thousand * SBC_INDEX * 1000);
    if (!custom && source.max !== null && x > source.max) warnings.push(`«${source.name}»: показатель выше интервала строки.`);
    if (!custom && source.min !== null && source.min > 0 && x < source.min) warnings.push(`«${source.name}»: показатель ниже интервала строки.`);
    base += raw;
    factored += thousand;
    now += current;
    return { line, source, custom, a, b, x, current };
  });
  return { lines, base, factored, now, warnings };
}
