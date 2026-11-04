export type NetType = "v1" | "k1" | "k2" | "drain";
export type Place = "field" | "city" | "tight" | "recon";
export type Depth = "d2" | "d4" | "deep";
export type Method = "open" | "hdd" | "punch";
export type Stage = "p" | "r" | "pr";
export type Pack = "basic" | "standard" | "expert";
export type Tone = "go" | "wait" | "stop";
export type OptionKind = "bim" | "expert" | "data" | "watch";

export interface Variant {
  id: string;
  parameter: string;
  price: number;
}

export interface Position {
  id: string;
  name: string;
  unit: string;
  variants: Variant[];
}

export interface WorkInput {
  ref: string;
  qty: number;
  /** Если не задана, берётся ставка из списка. */
  price?: number;
}

export interface CardInput {
  works: WorkInput[];
  /** Идентификаторы надбавок из списка опций. */
  extras?: string[];
  sbcNow: number;
}

export interface ExtraLine {
  id: string;
  name: string;
  rate: number;
  sum: number;
}

export interface WorkLine {
  name: string;
  qty: number;
  unit: string;
  price: number;
  sum: number;
  missing: boolean;
}

export interface Quote {
  lines: WorkLine[];
  /** Сумма строк таблицы, без опций. */
  price: number;
  extras: ExtraLine[];
  /** Итог таблицы плюс выбранные проценты. */
  total: number;
  sbcNow: number;
  tone: Tone;
  short: string;
  note: string;
  empty: boolean;
}

export interface SbcSourceRow {
  id: string;
  group: string;
  name: string;
  unit: string;
  a: number | null;
  b: number | null;
  min: number | null;
  max: number | null;
}

export interface SbcLineInput {
  id: string;
  rowId: string;
  x: number;
  a: number | null;
  b: number | null;
  customName: string;
}

export interface SbcSheetInput {
  stage: Stage;
  k: number;
  lines: SbcLineInput[];
}

export interface SbcComputedLine {
  line: SbcLineInput;
  source: SbcSourceRow;
  custom: boolean;
  a: number;
  b: number | null;
  x: number;
  current: number;
}

export interface SbcQuote {
  lines: SbcComputedLine[];
  base: number;
  factored: number;
  now: number;
  warnings: string[];
}
