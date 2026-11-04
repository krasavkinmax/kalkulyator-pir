import { EXTRAS } from "./data/extras.ts";
import { SBC_ROWS } from "./data/sbc-rows.ts";
import { COUNTS, SHEETS } from "./data/sheets.ts";
import { normalizeCatalog, seedCatalog } from "./data/seed.ts";
import { quoteCard, workRate } from "./engine/quote.ts";
import { quoteSbc } from "./engine/sbc.ts";
import type {
  CardInput,
  Position,
  Quote,
  SbcLineInput,
  Stage,
} from "./engine/types.ts";
import { money, sbcNum } from "./format.ts";

type View = "desk" | "book" | "sbc" | "kp";

const BOOK_KEY = "pir-structure-book-v2";
const SBC_KEY = "pir-sbc-sheet-v1";

const form = must<HTMLFormElement>("#card");
const kpButton = must<HTMLButtonElement>("#tab-kp");
const openKpButton = must<HTMLButtonElement>("#open-kp");

const tabs: { view: View; button: HTMLButtonElement }[] = [
  { view: "desk", button: must("#tab-desk") },
  { view: "book", button: must("#tab-book") },
  { view: "sbc", button: must("#tab-sbc") },
  { view: "kp", button: kpButton },
];

let catalog = loadBook();
let sbcLines = loadSbc();

form.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === "stage") {
    applyStage(target.value);
    persistSbc();
  }
  paint();
});
form.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.name === "work") {
    const row = target.closest("tr");
    const price = row?.querySelector<HTMLInputElement>('input[name="price"]');
    if (price) price.value = String(workRate(target.value, catalog));
  }
  paint();
});
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.classList.contains("remove-work")) {
    button.closest("tr")?.remove();
    paint();
  }
});

must("#add-work").addEventListener("click", () => addWork());

tabs.forEach((tab) => tab.button.addEventListener("click", () => {
  if (tab.view === "kp") openKp();
  else show(tab.view);
}));

must<HTMLElement>(".tabs").addEventListener("keydown", (event) => {
  if (!(event instanceof KeyboardEvent)) return;
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
  const enabled = tabs.filter((tab) => !tab.button.disabled);
  const index = enabled.findIndex((tab) => tab.button === document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % enabled.length;
  if (event.key === "ArrowLeft") next = (index - 1 + enabled.length) % enabled.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = enabled.length - 1;
  const target = enabled[next];
  if (!target) return;
  target.button.focus();
  if (target.view === "kp") openKp();
  else show(target.view);
});

must("#back-desk").addEventListener("click", () => show("desk"));
openKpButton.addEventListener("click", openKp);
must("#print-kp").addEventListener("click", () => window.print());
must("#save-card").addEventListener("click", () => {
  const quote = currentQuote();
  download("raschet.json", {
    object: field("object"),
    customer: field("customer"),
    region: field("region"),
    stage: field("stage"),
    works: quote.lines.filter((item) => item.sum > 0).map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      sum: item.sum,
    })),
    price: quote.price,
    extras: quote.extras.map((item) => ({
      name: item.name,
      rate: item.rate,
      sum: item.sum,
    })),
    total: quote.total,
    sbcCurrent: quote.sbcNow,
  });
});

must<HTMLFormElement>("#book-position").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!(event.currentTarget instanceof HTMLFormElement)) return;
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  const unit = String(data.get("unit") || "").trim();
  const price = Number(data.get("price"));
  const warn = must<HTMLElement>("#book-position-warn");
  if (!name || !unit || !Number.isFinite(price) || price < 0) {
    warn.hidden = false;
    warn.textContent = "Заполните название, единицу и цену.";
    return;
  }
  warn.hidden = true;
  catalog.push({ id: uid("pos"), name, unit, variants: [{ id: uid("var"), parameter: "", price }] });
  persistBook();
  renderBook();
  refreshWorkSelects();
  event.currentTarget.reset();
  const unitInput = event.currentTarget.elements.namedItem("unit");
  const priceInput = event.currentTarget.elements.namedItem("price");
  if (unitInput instanceof HTMLInputElement) unitInput.value = "шт.";
  if (priceInput instanceof HTMLInputElement) priceInput.value = "50000";
  paint();
});

must("#download-book").addEventListener("click", () => {
  download("structures.json", { status: "база макета", positions: catalog });
});

must("#add-sbc").addEventListener("click", () => {
  sbcLines.push({ id: uid("sbc"), rowId: "t3-1", x: 1, a: 64.94, b: 34.77, customName: "" });
  persistSbc();
  renderSbc();
  paint();
});

const sbcForm = must<HTMLFormElement>("#sbc-form");
sbcForm.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === "sbc-stage") applyStage(target.value);
  persistSbc();
  paint();
  renderSbcTotals();
});
sbcForm.addEventListener("submit", (event) => event.preventDefault());

restoreSbcFactors();
bindColumnTips();
renderBook();
renderSbc();
renderExtras();
paint();

function bindColumnTips() {
  const nativeInterest = Object.prototype.hasOwnProperty.call(HTMLButtonElement.prototype, "interestForElement");
  document.querySelectorAll<HTMLButtonElement>(".col-help[interestfor]").forEach((button) => {
    const tip = document.getElementById(button.getAttribute("interestfor") || "");
    if (!(tip instanceof HTMLElement)) return;
    if (!nativeInterest) button.setAttribute("aria-describedby", tip.id);
    let hideTimer = 0;
    const open = () => {
      window.clearTimeout(hideTimer);
      try {
        if (typeof tip.showPopover === "function" && !tip.matches(":popover-open")) tip.showPopover();
      } catch {
        /* подсказка уже открыта */
      }
      const rect = button.getBoundingClientRect();
      const width = tip.offsetWidth;
      tip.style.position = "fixed";
      tip.style.margin = "0";
      tip.style.inset = "auto";
      tip.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - tip.offsetHeight - 8)}px`;
      tip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    };
    const scheduleHide = () => {
      hideTimer = window.setTimeout(() => {
        if (tip.matches(":hover") || button.matches(":hover") || button === document.activeElement) {
          open();
          return;
        }
        if (typeof tip.hidePopover === "function" && tip.matches(":popover-open")) tip.hidePopover();
      }, 150);
    };
    button.addEventListener("pointerenter", open);
    button.addEventListener("focus", open);
    button.addEventListener("pointerleave", scheduleHide);
    button.addEventListener("blur", scheduleHide);
    tip.addEventListener("pointerenter", () => window.clearTimeout(hideTimer));
    tip.addEventListener("pointerleave", scheduleHide);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll<HTMLElement>(".col-tip:popover-open").forEach((tip) => tip.hidePopover());
  });
}

function paint() {
  const quote = currentQuote();
  const rows = [...document.querySelectorAll<HTMLTableRowElement>("#works tbody tr")];
  rows.forEach((row, index) => {
    const number = index + 1;
    const no = row.querySelector(".row-no");
    if (no) no.textContent = String(number);
    const line = quote.lines[index];
    const sum = row.querySelector(".line-sum");
    if (sum) sum.textContent = line && line.sum > 0 ? money.format(line.sum) : "—";
    row.querySelector("select")?.setAttribute("aria-label", `Наименование работы, строка ${number}`);
    row.querySelector('input[name="qty"]')?.setAttribute("aria-label", `Количество, строка ${number}`);
    row.querySelector('input[name="price"]')?.setAttribute("aria-label", `Цена, строка ${number}`);
    row.querySelector("button")?.setAttribute("aria-label", `Удалить строку ${number}`);
  });
  must<HTMLElement>("#works-empty").hidden = rows.length > 0;
  text("#sum-price", quote.price > 0 ? money.format(quote.price) : "—");
  document.querySelectorAll<HTMLElement>(".extra-amount").forEach((el) => {
    const line = quote.extras.find((item) => item.id === el.dataset.extra);
    el.textContent = line && line.sum > 0 ? money.format(line.sum) : "";
  });
  text("#extra-sum", quote.price > 0 ? money.format(quote.total) : "—");
  text("#sum-sbc", quote.sbcNow > 0 ? money.format(quote.sbcNow) : "нет расчёта");
  document.querySelectorAll<HTMLElement>("#signal span").forEach((el) => {
    el.dataset.on = el.dataset.tone === quote.tone ? "true" : "false";
  });
  must("#signal").setAttribute("aria-label", `${quote.short}. ${quote.note}`);
  const blocked = quote.empty;
  kpButton.disabled = blocked;
  kpButton.title = blocked ? quote.note : "";
  openKpButton.disabled = blocked;
  openKpButton.title = blocked ? quote.note : "";
  text("#object-title", field("object") || "Без названия");
  paintProposal(quote);
}

function currentQuote(): Quote {
  const sheet = readSbcSheet();
  const input: CardInput = {
    works: readWorks(),
    extras: readExtras(),
    sbcNow: quoteSbc(sheet).now,
  };
  return quoteCard(input, catalog);
}

function paintProposal(quote: Quote) {
  const until = new Date();
  until.setDate(until.getDate() + 30);
  text("#kp-date", `Цена действует до ${until.toLocaleDateString("ru-RU")}`);
  text("#kp-intro", `${field("customer")}. ${field("object")}, ${field("region")}.`);
  const lines: [string, string, number][] = [];
  quote.lines.filter((item) => item.qty > 0 && item.sum > 0).forEach((item) => {
    lines.push([item.missing ? "Позиция не найдена в базе" : item.name, `${item.qty} ${item.unit}`, item.sum]);
  });
  quote.extras.filter((item) => item.sum > 0).forEach((item) => {
    lines.push([`${item.name}, +${Math.round(item.rate * 100)}%`, "", item.sum]);
  });
  const body = must("#kp-lines");
  body.replaceChildren();
  if (lines.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "В предложении пока нет строк. Вернитесь к расчёту и добавьте работу.";
    tr.append(td);
    body.append(tr);
  }
  lines.forEach(([name, qty, sum]) => body.append(lineRow(name, qty, money.format(sum))));
  const total = document.createElement("tr");
  total.className = "sum-row";
  const name = document.createElement("td");
  const qty = document.createElement("td");
  const sum = document.createElement("td");
  name.textContent = "Итого";
  sum.textContent = money.format(quote.total);
  sum.className = "num";
  total.append(name, qty, sum);
  body.append(total);
  text("#kp-foot", "В стоимость входят перечисленные работы. Срок действия цены указан выше.");
}

function show(view: View) {
  const panels: Record<View, HTMLElement> = {
    desk: must("#desk"),
    book: must("#book"),
    sbc: must("#sbc"),
    kp: must("#proposal"),
  };
  (Object.keys(panels) as View[]).forEach((name) => {
    panels[name].hidden = name !== view;
  });
  tabs.forEach((tab) => {
    const on = tab.view === view;
    tab.button.setAttribute("aria-selected", on ? "true" : "false");
    if (!tab.button.disabled) tab.button.tabIndex = on ? 0 : -1;
  });
  if (view !== "desk") panels[view].focus();
}

function openKp() {
  if (kpButton.disabled) return;
  show("kp");
}

function addWork() {
  const body = must("#works tbody");
  const row = document.createElement("tr");
  const no = document.createElement("th");
  no.scope = "row";
  no.className = "num row-no";
  const nameCell = document.createElement("td");
  nameCell.dataset.label = "Наименование работы";
  const select = document.createElement("select");
  select.name = "work";
  fillWorkSelect(select, "");
  nameCell.append(select);
  const qtyCell = document.createElement("td");
  qtyCell.className = "num";
  qtyCell.dataset.label = "Количество";
  const measure = document.createElement("span");
  measure.className = "measure";
  const qty = document.createElement("input");
  qty.type = "number";
  qty.name = "qty";
  qty.min = "0";
  qty.step = "1";
  qty.inputMode = "numeric";
  qty.value = "1";
  qty.autocomplete = "off";
  measure.append(qty);
  qtyCell.append(measure);
  const priceCell = document.createElement("td");
  priceCell.className = "num";
  priceCell.dataset.label = "Цена";
  const priceMeasure = document.createElement("span");
  priceMeasure.className = "measure";
  const price = document.createElement("input");
  price.type = "number";
  price.name = "price";
  price.min = "0";
  price.step = "1";
  price.inputMode = "numeric";
  price.value = "0";
  price.autocomplete = "off";
  priceMeasure.append(price);
  priceCell.append(priceMeasure);
  const sum = document.createElement("td");
  sum.className = "num line-sum";
  sum.dataset.label = "Общая сумма";
  sum.textContent = "—";
  const action = document.createElement("td");
  action.dataset.label = "Действие";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-btn remove-work";
  remove.textContent = "Удалить";
  action.append(remove);
  row.append(no, nameCell, qtyCell, priceCell, sum, action);
  body.append(row);
  select.focus();
  paint();
}

function workGroups() {
  const sheets = SHEETS.filter((item) => !item.id.startsWith("wells-") && !item.id.startsWith("spec-"));
  const tables = SHEETS.filter((item) => item.id.startsWith("wells-"));
  const specs = SHEETS.filter((item) => item.id.startsWith("spec-"));
  const base = catalog.flatMap((position) => position.variants.map((variant) => {
    const note = variant.parameter.trim();
    return {
      value: `base|${position.id}|${variant.id}`,
      label: note ? `${position.name}, ${note}` : position.name,
    };
  }));
  return [
    { label: "Листы", items: sheets.map((item) => ({ value: `sheet|${item.id}`, label: item.name })) },
    { label: "Профили и колодцы", items: COUNTS.map((item) => ({ value: `count|${item.id}`, label: item.name })) },
    { label: "Таблицы колодцев", items: tables.map((item) => ({ value: `sheet|${item.id}`, label: item.name })) },
    { label: "Спецификации", items: specs.map((item) => ({ value: `sheet|${item.id}`, label: item.name })) },
    { label: "Базовая стоимость", items: base },
  ];
}

function fillWorkSelect(select: HTMLSelectElement, selected: string) {
  const current = selected || select.value;
  select.replaceChildren();
  select.append(option("", "Выберите работу"));
  workGroups().forEach((group) => {
    if (!group.items.length) return;
    const box = document.createElement("optgroup");
    box.label = group.label;
    group.items.forEach((item) => box.append(option(item.value, item.label)));
    select.append(box);
  });
  if ([...select.options].some((item) => item.value === current)) select.value = current;
}

function refreshWorkSelects() {
  document.querySelectorAll<HTMLSelectElement>('#works select[name="work"]').forEach((select) => {
    fillWorkSelect(select, select.value);
  });
}

function renderExtras() {
  const list = must("#extra-list");
  EXTRAS.forEach((item) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "extra";
    input.value = item.id;
    const text = document.createElement("span");
    text.textContent = `${item.name}, +${Math.round(item.rate * 100)}%`;
    const amount = document.createElement("span");
    amount.className = "extra-amount";
    amount.dataset.extra = item.id;
    label.append(input, text, amount);
    list.append(label);
  });
}

function readExtras() {
  return [...form.querySelectorAll<HTMLInputElement>('input[name="extra"]:checked')].map((item) => item.value);
}

function readWorks() {
  return [...document.querySelectorAll<HTMLTableRowElement>("#works tbody tr")].map((row) => ({
    ref: row.querySelector("select")?.value || "",
    qty: Number(row.querySelector<HTMLInputElement>('input[name="qty"]')?.value) || 0,
    price: Number(row.querySelector<HTMLInputElement>('input[name="price"]')?.value) || 0,
  }));
}

function readSbcSheet() {
  const selected = document.querySelector<HTMLInputElement>('input[name="sbc-stage"]:checked');
  const raw = Number(must<HTMLInputElement>("[name=sbc-k]").value);
  return { stage: asStage(selected?.value || "pr"), k: raw, lines: sbcLines };
}

function renderBook() {
  const body = must("#book-table tbody");
  body.replaceChildren();
  catalog.forEach((position) => {
    position.variants.forEach((variant) => {
      const tr = document.createElement("tr");
      const name = cell(position.name);
      const noteCell = document.createElement("td");
      const note = document.createElement("input");
      note.type = "text";
      note.value = variant.parameter;
      note.autocomplete = "off";
      note.setAttribute("aria-label", `Примечание, ${position.name}`);
      note.addEventListener("input", () => {
        variant.parameter = note.value;
        persistBook();
        refreshWorkSelects();
        paint();
      });
      noteCell.append(note);
      const unit = cell(position.unit);
      const priceCell = document.createElement("td");
      priceCell.className = "num";
      const price = document.createElement("input");
      price.type = "number";
      price.min = "0";
      price.step = "1";
      price.value = String(variant.price);
      price.setAttribute("aria-label", `Цена за единицу, ${position.name}`);
      price.addEventListener("input", () => {
        variant.price = Number(price.value) || 0;
        persistBook();
        paint();
      });
      priceCell.append(price);
      const action = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn";
      remove.textContent = "Удалить";
      remove.addEventListener("click", () => {
        position.variants = position.variants.filter((item) => item.id !== variant.id);
        if (!position.variants.length) catalog = catalog.filter((item) => item.id !== position.id);
        persistBook();
        renderBook();
        refreshWorkSelects();
        paint();
      });
      action.append(remove);
      tr.append(name, noteCell, unit, priceCell, action);
      body.append(tr);
    });
  });
  must<HTMLElement>("#book-empty").hidden = catalog.some((item) => item.variants.length);
}

function renderSbc() {
  const body = must("#sbc-table tbody");
  body.replaceChildren();
  const sheet = quoteSbc(readSbcSheet());
  sheet.lines.forEach((item) => {
    const tr = document.createElement("tr");
    const choice = document.createElement("td");
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Строка справочника");
    let group: string | null = null;
    let container: HTMLSelectElement | HTMLOptGroupElement = select;
    SBC_ROWS.forEach((source) => {
      if (source.group !== group) {
        group = source.group;
        container = document.createElement("optgroup");
        container.label = group;
        select.append(container);
      }
      container.append(option(source.id, source.name));
    });
    select.value = item.line.rowId;
    select.addEventListener("change", () => {
      item.line.rowId = select.value;
      const source = SBC_ROWS.find((entry) => entry.id === select.value);
      if (source && source.id !== "custom") {
        item.line.a = source.a;
        item.line.b = source.b;
      }
      persistSbc();
      renderSbc();
      paint();
    });
    choice.append(select);
    if (item.custom) {
      const name = document.createElement("input");
      name.type = "text";
      name.value = item.line.customName || "";
      name.placeholder = "Название строки";
      name.setAttribute("aria-label", "Название своей строки");
      name.addEventListener("input", () => {
        item.line.customName = name.value;
        persistSbc();
        paint();
      });
      choice.append(name);
    }
    const x = numberInput(String(item.line.x), "0.01", `Натуральный показатель, ${item.custom ? "показатель" : item.source.unit}`, "0");
    x.addEventListener("input", () => {
      item.line.x = Number(x.value) || 0;
      persistSbc();
      paint();
      renderSbcTotals();
    });
    const xCell = document.createElement("td");
    xCell.className = "num";
    const measure = document.createElement("span");
    measure.className = "measure";
    measure.append(x);
    if (!item.custom) {
      const unit = document.createElement("span");
      unit.className = "measure-unit";
      unit.textContent = item.source.unit;
      measure.append(unit);
    }
    xCell.append(measure);
    const aCell = document.createElement("td");
    const bCell = document.createElement("td");
    aCell.className = "num";
    bCell.className = "num";
    if (item.custom) {
      const a = numberInput(item.line.a ?? "", "0.01", "a, тыс. руб.");
      const b = numberInput(item.line.b ?? "", "0.01", "b, тыс. руб.");
      a.addEventListener("input", () => {
        item.line.a = Number(a.value) || 0;
        persistSbc();
        paint();
        renderSbcTotals();
      });
      b.addEventListener("input", () => {
        item.line.b = b.value === "" ? null : Number(b.value);
        persistSbc();
        paint();
        renderSbcTotals();
      });
      aCell.append(a);
      bCell.append(b);
    } else {
      aCell.textContent = String(item.a).replace(".", ",");
      bCell.textContent = item.b === null ? "—" : String(item.b).replace(".", ",");
    }
    const sum = document.createElement("td");
    sum.className = "num line-sum";
    sum.textContent = money.format(item.current);
    const action = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.textContent = "Удалить";
    remove.addEventListener("click", () => {
      sbcLines = sbcLines.filter((entry) => entry.id !== item.line.id);
      persistSbc();
      renderSbc();
      paint();
    });
    action.append(remove);
    tr.append(choice, xCell, aCell, bCell, sum, action);
    body.append(tr);
  });
  must<HTMLElement>("#sbc-empty").hidden = sbcLines.length > 0;
  renderSbcTotals();
}

function renderSbcTotals() {
  const sheet = quoteSbc(readSbcSheet());
  text("#sbc-base", sbcLines.length ? sbcNum.format(sheet.base) : "—");
  text("#sbc-factored", sbcLines.length ? sbcNum.format(sheet.factored) : "—");
  text("#sbc-now", sbcLines.length ? money.format(sheet.now) : "—");
  const warn = must<HTMLElement>("#sbc-warn");
  warn.hidden = sheet.warnings.length === 0;
  warn.textContent = sheet.warnings.join(" ");
  document.querySelectorAll("#sbc-table tbody tr").forEach((tr, index) => {
    const cell = tr.querySelector(".line-sum");
    const line = sheet.lines[index];
    if (cell && line) cell.textContent = money.format(line.current);
  });
}

function loadBook(): Position[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BOOK_KEY) || "null");
    if (Array.isArray(parsed) && parsed.every(isPosition)) return normalizeCatalog(parsed);
  } catch {
    /* учебный набор */
  }
  return seedCatalog();
}

function persistBook() {
  localStorage.setItem(BOOK_KEY, JSON.stringify(catalog));
}

function loadSbc(): SbcLineInput[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SBC_KEY) || "null");
    if (isStoredSbc(parsed)) return parsed.lines;
  } catch {
    /* пустой лист */
  }
  return [];
}

function persistSbc() {
  const sheet = readSbcSheet();
  localStorage.setItem(SBC_KEY, JSON.stringify({ stage: sheet.stage, k: String(sheet.k), lines: sbcLines }));
}

function restoreSbcFactors() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SBC_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return;
    const saved = parsed as { stage?: unknown; k?: unknown };
    if (typeof saved.stage === "string") applyStage(saved.stage);
    if (saved.k !== undefined) must<HTMLInputElement>("[name=sbc-k]").value = String(saved.k);
  } catch {
    /* остаются значения формы */
  }
}

function isPosition(value: unknown): value is Position {
  if (!value || typeof value !== "object") return false;
  const item = value as Position;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.unit === "string" && Array.isArray(item.variants);
}

function isStoredSbc(value: unknown): value is { lines: SbcLineInput[] } {
  return !!value && typeof value === "object" && Array.isArray((value as { lines?: unknown }).lines);
}

function field(name: string): string {
  const el = form.elements.namedItem(name);
  if (el instanceof RadioNodeList || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return el.value;
  return "";
}

function option(value: string, label: string) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = label;
  return el;
}

function cell(value: string) {
  const el = document.createElement("td");
  el.textContent = value;
  return el;
}

function lineRow(name: string, qty: string, sum: string) {
  const tr = document.createElement("tr");
  const a = document.createElement("td");
  const b = document.createElement("td");
  const c = document.createElement("td");
  a.textContent = name;
  b.textContent = qty;
  b.className = "num";
  c.textContent = sum;
  c.className = "num";
  tr.append(a, b, c);
  return tr;
}

function numberInput(value: string | number, step: string, label: string, min?: string) {
  const input = document.createElement("input");
  input.type = "number";
  if (min !== undefined) input.min = min;
  input.step = step;
  input.value = String(value);
  input.setAttribute("aria-label", label);
  return input;
}

function text(selector: string, value: string) {
  must(selector).textContent = value;
}

function must<T extends Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) throw new Error(selector);
  return el as T;
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function applyStage(stage: string) {
  const value = asStage(stage);
  const card = document.querySelector<HTMLInputElement>(`#card input[name="stage"][value="${value}"]`);
  const sbc = document.querySelector<HTMLInputElement>(`#sbc-form input[name="sbc-stage"][value="${value}"]`);
  if (card) card.checked = true;
  if (sbc) sbc.checked = true;
}

function asStage(value: string): Stage {
  if (value === "p" || value === "r" || value === "pr") return value;
  return "pr";
}
