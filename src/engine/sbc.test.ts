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
  });
});
