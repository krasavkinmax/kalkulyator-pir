export type SheetId =
  | "common"
  | "plan-nv"
  | "scheme-nv"
  | "wells-nv"
  | "spec-nv"
  | "plan-nk1"
  | "plan-nk2"
  | "scheme-nk1"
  | "scheme-nk2"
  | "wells-nk1"
  | "wells-nk2"
  | "spec-nk1"
  | "spec-nk2"
  | "plan-d"
  | "scheme-d";

export type CountId = "profile" | "profile-hard" | "well-nv" | "well-nk";

export interface SheetRate {
  id: SheetId;
  group: string;
  name: string;
  price: number;
}

export interface CountRate {
  id: CountId;
  name: string;
  price: number;
}

/** Ставки листов, названные явно 4 ноября 2026. */
export const SHEETS: SheetRate[] = [
  { id: "common", group: "Комплект", name: "Общие данные", price: 15000 },
  { id: "plan-nv", group: "НВ", name: "План НВ", price: 15000 },
  { id: "scheme-nv", group: "НВ", name: "Схема НВ", price: 15000 },
  { id: "wells-nv", group: "НВ", name: "Таблица колодцев НВ", price: 10000 },
  { id: "spec-nv", group: "НВ", name: "Спецификация НВ", price: 20000 },
  { id: "plan-nk1", group: "НК", name: "План НК1", price: 15000 },
  { id: "plan-nk2", group: "НК", name: "План НК2", price: 15000 },
  { id: "scheme-nk1", group: "НК", name: "Схема НК1", price: 15000 },
  { id: "scheme-nk2", group: "НК", name: "Схема НК2", price: 15000 },
  { id: "wells-nk1", group: "НК", name: "Таблица колодцев НК1", price: 10000 },
  { id: "wells-nk2", group: "НК", name: "Таблица колодцев НК2", price: 10000 },
  { id: "spec-nk1", group: "НК", name: "Спецификация НК1", price: 20000 },
  { id: "spec-nk2", group: "НК", name: "Спецификация НК2", price: 20000 },
  { id: "plan-d", group: "Дренаж", name: "План Д", price: 15000 },
  { id: "scheme-d", group: "Дренаж", name: "Схема Д", price: 15000 },
];

export const COUNTS: CountRate[] = [
  { id: "profile", name: "Профиль простой", price: 2000 },
  { id: "profile-hard", name: "Профиль сложный", price: 20000 },
  { id: "well-nv", name: "Колодец НВ", price: 2500 },
  { id: "well-nk", name: "Колодец НК", price: 500 },
];
