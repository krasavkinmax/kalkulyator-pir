import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SBC_INDEX } from "../data/sbc-book.ts";
import { quoteSbc } from "./sbc.ts";

describe("quoteSbc", () => {
  it("переводит a + b × X в текущие рубли индексом справочника", () => {
    assert.equal(SBC_INDEX, 7.22);
    const sheet = quoteSbc({
      stage: "pr",
      k: 1,
      lines: [{ id: "1", rowId: "t3-1", x: 1, a: 64.94, b: 34.77, customName: "" }],
    });
    assert.equal(Number(sheet.base.toFixed(2)), 99.71);
    assert.equal(sheet.now, Math.round(99.71 * 7.22 * 1000));
    assert.deepEqual(sheet.warnings, []);
  });

  it("для пустого b считает a × показатель и предупреждает о выходе из интервала", () => {
    const custom = quoteSbc({
      stage: "p",
      k: 1.2,
      lines: [{ id: "c", rowId: "custom", x: 2, a: 10, b: null, customName: "Своя" }],
    });
    assert.equal(custom.base, 20);
    assert.equal(custom.factored, 20 * 0.6 * 1.2);
    assert.equal(custom.now, Math.round(14.4 * 7.22 * 1000));

    const over = quoteSbc({
      stage: "pr",
      k: 1,
      lines: [{ id: "2", rowId: "t3-1", x: 11, a: null, b: null, customName: "" }],
    });
    assert.equal(over.warnings.length, 1);
    assert.equal(over.lines[0].blocked, false);
  });

  it("для внутриплощадочных сетей берёт стадию 50/50 и фиксированные коэффициенты строки", () => {
    const sheet = quoteSbc({
      edition: "site",
      stage: "pr",
      k: 1.2,
      lines: [{
        id: "k",
        rowId: "s2-t5-3",
        x: 800,
        a: null,
        b: null,
        customName: "",
        factors: { pressure: true, parallel: true },
      }],
    });
    assert.equal(Number(sheet.base.toFixed(2)), 225.44);
    assert.equal(Number(sheet.factored.toFixed(5)), Number((225.44 * 0.7 * 0.15 * 1.2).toFixed(5)));
    assert.equal(sheet.now, Math.round(225.44 * 0.7 * 0.15 * 1.2 * 7.22 * 1000));
  });

  it("короче 100 м считает как 100, а длину за закрытым интервалом в итог не берёт", () => {
    const short = quoteSbc({
      edition: "site",
      stage: "p",
      k: 1,
      lines: [{ id: "s", rowId: "s2-t4-1", x: 40, a: null, b: null, customName: "" }],
    });
    assert.equal(short.lines[0].xUsed, 100);
    assert.equal(Number(short.base.toFixed(2)), 25.6);
    assert.equal(Number(short.factored.toFixed(2)), 12.8);
    assert.equal(short.notes.length, 1);
    assert.deepEqual(short.warnings, []);

    const blocked = quoteSbc({
      edition: "site",
      stage: "pr",
      k: 1,
      lines: [{ id: "b", rowId: "s2-t5-4", x: 6000, a: null, b: null, customName: "" }],
    });
    assert.equal(blocked.lines[0].blocked, true);
    assert.equal(blocked.now, 0);
    assert.equal(blocked.warnings.length, 1);

    const open = quoteSbc({
      edition: "site",
      stage: "pr",
      k: 1,
      lines: [{ id: "o", rowId: "s2-t4-4", x: 6000, a: null, b: null, customName: "" }],
    });
    assert.equal(open.lines[0].blocked, false);
    assert.equal(open.base, 319);
    assert.deepEqual(open.warnings, []);
  });

  it("умножает итог на индекс квартала с листа", () => {
    const sheet = quoteSbc({
      stage: "pr",
      k: 1,
      index: 8,
      lines: [{ id: "1", rowId: "t3-1", x: 1, a: 64.94, b: 34.77, customName: "" }],
    });
    assert.equal(sheet.now, Math.round(99.71 * 8 * 1000));
  });

  it("не применяет коэффициент, которого нет у выбранной строки", () => {
    const sheet = quoteSbc({
      edition: "site",
      stage: "pr",
      k: 1,
      lines: [{
        id: "w",
        rowId: "s2-t4-1",
        x: 100,
        a: null,
        b: null,
        customName: "",
        factors: { pressure: true, rehab: true },
      }],
    });
    assert.equal(sheet.lines[0].factor, 0.8);
    assert.equal(Number(sheet.base.toFixed(2)), 25.6);
  });
});
