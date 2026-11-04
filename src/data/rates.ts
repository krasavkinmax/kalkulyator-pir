import type { Depth, Method, NetType, OptionKind, Pack, Place, Stage } from "../engine/types.ts";

/** Учебные ставки макета. В прайс компании не переносятся, пока нет калибровки. */
export const RATE: Record<NetType, number> = { v1: 4100, k1: 3900, k2: 3400, drain: 2400 };
export const PLACE: Record<Place, number> = { field: 1, city: 1.08, tight: 1.18, recon: 1.22 };
export const DEPTH: Record<Depth, number> = { d2: 1, d4: 1.12, deep: 1.28 };
export const METHOD: Record<Method, number> = { open: 1, hdd: 1.35, punch: 1.5 };
export const STAGE: Record<Stage, number> = { p: 0.4, r: 0.6, pr: 1 };
export const PACK: Record<Pack, number> = { basic: 0.85, standard: 1, expert: 1.12 };
export const OPT: Record<OptionKind, number> = { bim: 220000, expert: 160000, data: 90000, watch: 180000 };
export const OUTSIDE_COST = new Set<OptionKind>(["watch"]);

export const NAME: Record<NetType | OptionKind, string> = {
  v1: "Водоснабжение В1",
  k1: "Канализация К1",
  k2: "Дождевая канализация К2",
  drain: "Дренаж",
  bim: "BIM в Civil 3D",
  expert: "Сопровождение экспертизы",
  data: "Сбор исходных данных",
  watch: "Авторский надзор",
};

export const STAGE_NAME: Record<Stage, string> = { p: "П", r: "Р", pr: "П+Р" };
export const PACK_NAME: Record<Pack, string> = { basic: "Базовый", standard: "Стандарт", expert: "Экспертиза" };

export const ROUTE_SHARE = 0.55;
export const CORRIDOR_KEEP = 0.75;
export const HOURS_PER_100M = 86;
export const HOURS_PER_POINT = 60;
export const RUB_PER_HOUR = 2500;
export const OVERHEAD = 1.25;
export const RUSH_FACTOR = 1.08;
export const TAX_RATE = 0.06;
export const DISCOUNT_CAP = 10;
export const DISCOUNT_HARD_CAP = 40;
export const MARGIN_TARGET = 0.35;
export const MARGIN_FLOOR = 0.2;
