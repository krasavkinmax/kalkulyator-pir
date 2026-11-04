import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedCatalog } from "../data/seed.ts";
import type { CardInput } from "./types.ts";
import { quoteCard } from "./quote.ts";

const mixed: CardInput = {
  works: [
    { ref: "sheet|common", qty: 1 },
    { ref: "sheet|plan-nv", qty: 2 },
    { ref: "count|profile", qty: 4 },
    { ref: "count|well-nv", qty: 3 },
    { ref: "count|well-nk", qty: 10 },
    { ref: "base|kns|kns-24", qty: 1 },
    { ref: "base|cross|cross-road", qty: 1 },
    { ref: "", qty: 1 },
  ],
  sbcNow: 0,
};

describe("quoteCard", () => {
  it("умножает выбранную работу на количество", () => {
    const quote = quoteCard(mixed, seedCatalog());
    assert.deepEqual(quote.lines.map((item) => item.sum), [15000, 30000, 8000, 7500, 5000, 50000, 50000, 0]);
    assert.equal(quote.price, 165500);
    assert.equal(quote.tone, "go");
    assert.equal(quote.lines[5]?.name, "КНС");
  });

  it("берёт примечание позиции в название", () => {
    const catalog = seedCatalog();
    const kns = catalog.find((item) => item.id === "kns");
    if (!kns) throw new Error("нет КНС");
    kns.variants[0].parameter = "24 м3/ч";
    const quote = quoteCard({ works: [{ ref: "base|kns|kns-24", qty: 1 }], sbcNow: 0 }, catalog);
    assert.equal(quote.lines[0]?.name, "КНС, 24 м3/ч");
    assert.equal(quote.price, 50000);
  });

  it("считает общую сумму по изменённой цене строки", () => {
    const quote = quoteCard({
      works: [{ ref: "sheet|plan-nv", qty: 2, price: 18000 }],
      sbcNow: 0,
    }, seedCatalog());
    assert.equal(quote.lines[0]?.price, 18000);
    assert.equal(quote.lines[0]?.sum, 36000);
  });

  it("называет профили и новые листы НК без цены в имени", () => {
    const quote = quoteCard({
      works: [
        { ref: "count|profile", qty: 1 },
        { ref: "count|profile-hard", qty: 1 },
        { ref: "sheet|plan-nk2", qty: 1 },
        { ref: "sheet|scheme-nk1", qty: 1 },
      ],
      sbcNow: 0,
    }, seedCatalog());
    assert.deepEqual(quote.lines.map((item) => item.name), [
      "Профиль простой",
      "Профиль сложный",
      "План НК2",
      "Схема НК1",
    ]);
    assert.deepEqual(quote.lines.map((item) => item.price), [2000, 20000, 15000, 15000]);
  });

  it("в базе нет ВНС, очистные названы ЛОС", () => {
    const names = seedCatalog().map((item) => item.name);
    assert.equal(names.includes("ВНС"), false);
    assert.equal(names.includes("ЛОС"), true);
    assert.equal(names.includes("Локальные очистные"), false);
  });

  it("прибавляет выбранные проценты к итогу таблицы", () => {
    const quote = quoteCard({
      works: [{ ref: "sheet|common", qty: 1 }],
      extras: ["bim", "tax", "rush", "нет-такой"],
      sbcNow: 0,
    }, seedCatalog());
    assert.equal(quote.price, 15000);
    assert.deepEqual(quote.extras.map((item) => [item.name, item.sum]), [
      ["Разработка BIM", 2250],
      ["Налог СЗ", 900],
      ["Срочность", 1500],
    ]);
    assert.equal(quote.total, 19650);
  });

  it("оставляет пустую таблицу без цены", () => {
    const quote = quoteCard({ works: [], sbcNow: 0 }, seedCatalog());
    assert.equal(quote.price, 0);
    assert.equal(quote.empty, true);
    assert.equal(quote.tone, "wait");
  });
});
