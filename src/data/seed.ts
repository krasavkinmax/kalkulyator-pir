import book from "../../knowledge-base/structures.json" with { type: "json" };
import type { Position } from "../engine/types.ts";

export function seedCatalog(): Position[] {
  return normalizeCatalog(structuredClone(book.positions) as Position[]);
}

/** Убирает ВНС и приводит старое имя очистных к «ЛОС», в том числе в базе браузера. */
export function normalizeCatalog(items: Position[]): Position[] {
  return items
    .filter((item) => item.id !== "vns" && item.name.trim() !== "ВНС")
    .map((item) => (
      item.id === "los" || item.name.trim() === "Локальные очистные"
        ? { ...item, name: "ЛОС" }
        : item
    ));
}
