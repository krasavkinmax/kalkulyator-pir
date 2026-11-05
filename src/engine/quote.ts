import { EXTRAS } from "../data/extras.ts";
import { COUNTS, SHEETS } from "../data/sheets.ts";
import type { CardInput, ExtraLine, Quote, WorkLine } from "./types.ts";

interface CatalogPosition {
  id: string;
  name: string;
  unit: string;
  variants: { id: string; parameter: string; price: number }[];
}

export function workRate(ref: string, catalog: CatalogPosition[]) {
  return rateOf(ref, catalog).price;
}

function rateOf(ref: string, catalog: CatalogPosition[]) {
  const [kind, id, variantId] = ref.split("|");
  if (kind === "sheet") {
    const sheet = SHEETS.find((item) => item.id === id);
    return sheet
      ? { name: sheet.name, price: sheet.price, unit: "шт.", missing: false }
      : { name: "Нет в списке", price: 0, unit: "шт.", missing: true };
  }
  if (kind === "count") {
    const item = COUNTS.find((entry) => entry.id === id);
    return item
      ? { name: item.name, price: item.price, unit: "шт.", missing: false }
      : { name: "Нет в списке", price: 0, unit: "шт.", missing: true };
  }
  if (kind === "base") {
    const position = catalog.find((entry) => entry.id === id);
    const variant = position?.variants.find((entry) => entry.id === variantId);
    if (!position || !variant) return { name: "Нет в базе", price: 0, unit: "шт.", missing: true };
    const note = variant.parameter.trim();
    return {
      name: note ? `${position.name}, ${note}` : position.name,
      price: variant.price,
      unit: position.unit || "шт.",
      missing: false,
    };
  }
  return { name: "Работа не выбрана", price: 0, unit: "шт.", missing: false };
}

export function quoteCard(input: CardInput, catalog: CatalogPosition[]): Quote {
  const lines: WorkLine[] = input.works.map((item) => {
    const raw = item.qty;
    const qty = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
    const rate = rateOf(item.ref, catalog);
    const asked = item.price;
    const price = asked === undefined || !Number.isFinite(asked) || asked < 0 ? rate.price : asked;
    return {
      name: rate.name,
      qty,
      unit: rate.unit,
      price,
      sum: !item.ref || rate.missing ? 0 : Math.round(qty * price),
      missing: rate.missing,
    };
  });

  const price = lines.reduce((acc, item) => acc + item.sum, 0);
  const picked = new Set(input.extras ?? []);
  const extras: ExtraLine[] = EXTRAS.filter((item) => picked.has(item.id)).map((item) => ({
    id: item.id,
    name: item.name,
    rate: item.rate,
    sum: Math.round(price * item.rate),
  }));
  const total = price + extras.reduce((acc, item) => acc + item.sum, 0);
  const empty = price <= 0;
  const tone: Quote["tone"] = empty ? "wait" : "go";
  const short = empty ? "Проверить" : "Можно в КП";
  const note = empty
    ? "Добавьте строку и выберите работу."
    : "Сумма собрана. Её можно показать в коммерческом КП.";

  return { lines, price, extras, total, sbcNow: input.sbcNow, tone, short, note, empty };
}

/** Процент к сумме письма: 10 → +10%, −10 → −10%. */
export function scaleMoney(amount: number, percent: number) {
  const base = Number.isFinite(amount) ? amount : 0;
  const shift = Number.isFinite(percent) ? percent : 0;
  return Math.round(base * (1 + shift / 100));
}
