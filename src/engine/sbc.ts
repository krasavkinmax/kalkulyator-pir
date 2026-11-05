import { SBC_INDEX, SBC_STAGE, SBC_STAGE_SITE } from "../data/sbc-book.ts";
import { findSbcRow } from "../data/sbc-rows.ts";
import type { SbcFactor, SbcQuote, SbcSheetInput, SbcSourceRow } from "./types.ts";

const FACTOR_VALUE: Record<SbcFactor, number> = {
  pressure: 0.7,
  parallel: 0.15,
  rehab: 0.8,
  builtIn: 0.4,
  typical: 0.2,
};

export function quoteSbc(input: SbcSheetInput): SbcQuote {
  const extra = Number.isFinite(input.k) && input.k >= 0 ? input.k : 1;
  const index = Number.isFinite(input.index) && input.index !== undefined && input.index >= 0 ? input.index : SBC_INDEX;
  const stageRate = (input.edition === "site" ? SBC_STAGE_SITE : SBC_STAGE)[input.stage];
  const warnings: string[] = [];
  const notes: string[] = [];
  let base = 0;
  let factored = 0;
  let now = 0;
  const lines = input.lines.map((line) => {
    const source = findSbcRow(line.rowId);
    const custom = line.rowId === "custom";
    const a = custom ? Number(line.a) || 0 : source.a ?? 0;
    const b = custom ? (line.b === null ? null : Number(line.b)) : source.b;
    const x = Number(line.x) || 0;
    let xUsed = x;
    let blocked = false;
    const title = custom ? (line.customName || "Своя строка") : source.name;
    if (!custom && source.floor100 && source.min === 100 && x > 0 && x < 100) {
      xUsed = 100;
      notes.push(`«${title}»: длина ${meters(x)} м короче 100 м, в формулу принята 100 м.`);
    }
    if (!custom && source.blockAboveMax && source.max !== null && x > source.max) {
      blocked = true;
      warnings.push(`«${title}»: длина ${meters(x)} м выше интервала строки. В итог не входит.`);
    } else if (!custom && source.max !== null && x > source.max) {
      warnings.push(`«${title}»: показатель выше интервала строки.`);
    }
    if (!blocked && !custom && source.min !== null && source.min > 0 && xUsed < source.min) {
      warnings.push(`«${title}»: показатель ниже интервала строки.`);
    }
    const factor = custom ? 1 : lineFactor(source, line.factors);
    const raw = blocked ? 0 : b === null ? a * xUsed : a + b * xUsed;
    const thousand = raw * stageRate * extra * factor;
    const current = Math.round(thousand * index * 1000);
    if (!blocked) {
      base += raw;
      factored += thousand;
      now += current;
    }
    return { line, source, custom, a, b, x, xUsed, factor, blocked, current };
  });
  return { lines, base, factored, now, warnings, notes };
}

function lineFactor(source: SbcSourceRow, flags: SbcSheetInput["lines"][number]["factors"]): number {
  let product = 1;
  for (const key of source.factors) {
    if (flags?.[key]) product *= FACTOR_VALUE[key];
  }
  return product;
}

function meters(value: number): string {
  return String(value).replace(".", ",");
}
