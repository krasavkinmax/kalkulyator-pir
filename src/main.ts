import { EXTRAS } from "./data/extras.ts";
import { SBC_ROWS } from "./data/sbc-rows.ts";
import { SBC2_ROWS } from "./data/sbc2-rows.ts";
import { COUNTS, SHEETS } from "./data/sheets.ts";
import { normalizeCatalog, seedCatalog } from "./data/seed.ts";
import { emptyBuckets, phaseHasCalc } from "./engine/phases.ts";
import type { PhaseDraft, WorkDraft } from "./engine/phases.ts";
import { quoteCard, scaleMoney, workRate } from "./engine/quote.ts";
import { quoteSbc } from "./engine/sbc.ts";
import type {
  CardInput,
  ObjectKind,
  Position,
  Quote,
  WorkLine,
  SbcFactor,
  SbcLineInput,
  SbcQuote,
  SbcSourceRow,
  Stage,
} from "./engine/types.ts";
import { SBC_INDEX } from "./data/sbc-book.ts";
import { money, pct, sbcNum } from "./format.ts";

type View = "desk" | "book" | "sbc" | "kp";

const BOOK_KEY = "pir-structure-book-v2";
const SBC_KEY = "pir-sbc-sheet-v2";
const SBC_KEY_V1 = "pir-sbc-sheet-v1";
const PHASES_KEY = "pir-phases-v1";
const PHASE_MAX = 12;

const FACTOR_LABEL: Record<SbcFactor, string> = {
  pressure: "Напорная канализация, ×0,7",
  parallel: "Параллельная линия, ×0,15",
  rehab: "Санация, ×0,8",
  builtIn: "Встроен в здание, ×0,4",
  typical: "Типовой альбом, ×0,2",
};

const LINEAR_TITLE = "СБЦП 81-2001-17 «Объекты водоснабжения и канализации».";
const SITE_TITLE = "СБЦП 81-2001-07 «Коммунальные инженерные сети и сооружения».";
const LINEAR_EMPTY = "Добавьте строку. В списке таблицы 3, 8, 18 и часть таблиц 16 и 17. Остальные пункты вводятся как своя строка: цена в тыс. руб. равна a + b × показатель, а если b пустое — a × показатель.";
const SITE_EMPTY = "Добавьте строку. В списке таблицы 4–7. Для труб длина короче 100 м считается как 100 м. Колодцы открытой канализации уже входят в пункты 1–9 таблицы 5.";
const LINEAR_ROW_TIP = "Пункт СБЦП 81-2001-17. Он задаёт a, b и единицу показателя. Кольцевой водопровод — таблица 16, самотечная канализация — 17, водовод — 3, коллектор и закрытый переход — 8, дренаж — 18. Расход в названии строки выбирает пункт. В колонку «Показатель» он не пишется.";
const SITE_ROW_TIP = "Пункт СБЦП 81-2001-07, таблицы 4–7. Диаметр и способ прокладки выбирают строку. В колонку «Показатель» пишется длина в метрах или число сооружений. Закрытый водопровод считается по ГНБ и прессошнеку таблицы 5.";
const LINEAR_X_TIP = "Величина X из проекта, в единицах выбранной строки. Единица показана рядом с полем. Для таблиц 3, 16 и 17 это длина сети в километрах. Для ГНБ, прессошнека и кольцевого дренажа — длина в метрах. Для пластового дренажа — площадь в квадратных метрах. Для камеры — число штук. Цена строки в тысячах рублей 2001 года равна a + b × показатель: длиннее сеть — выше цена. Если число выходит за интервал строки, под таблицей появится предупреждение.";
const SITE_X_TIP = "Величина X из проекта. Для труб это длина в метрах: короче 100 м в формулу идёт 100 м. Если длина выше закрытого интервала строки, сумма этой строки в итог не входит. Для узла, камеры и водомерного узла это число штук. Цена в тысячах рублей 2001 года равна a + b × показатель, а если b пустое — a × показатель.";

const form = must<HTMLFormElement>("#card");
const kpButton = must<HTMLButtonElement>("#tab-kp");
const openKpButton = must<HTMLButtonElement>("#open-kp");

const tabs: { view: View; button: HTMLButtonElement }[] = [
  { view: "desk", button: must("#tab-desk") },
  { view: "sbc", button: must("#tab-sbc") },
  { view: "kp", button: kpButton },
];

type Bucket = { k: number; lines: SbcLineInput[] };
type Snapshot = { phase: PhaseDraft; quote: Quote; sbc: SbcQuote | null };

let catalog = loadBook();
let sbcIndex = SBC_INDEX;
let kind: ObjectKind | null = null;
let buckets: Record<ObjectKind, Bucket> = { linear: emptyBucket(), site: emptyBucket() };
let sbcLines: SbcLineInput[] = [];
let phases: PhaseDraft[] = [];
let activePhase = 0;
let adjustPercent = 0;
let letterEdits: Record<string, string> = {};
let mute = false;
let currentView: View = "desk";
let proposalStructure = "";
let proposalMoney = "";
let forceProposal = false;

form.addEventListener("input", (event) => {
  if (mute) return;
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === "phase-count") {
    resizePhases(Number(target.value));
    return;
  }
  if (target instanceof HTMLInputElement && target.name === "phase-name") {
    const index = Number(target.dataset.phaseName);
    if (phases[index]) phases[index].name = target.value;
    renderPhaseSwitch();
    paint();
    return;
  }
  if (target instanceof HTMLInputElement && target.name === "object-kind" && (target.value === "linear" || target.value === "site")) {
    applyKind(target.value);
  }
  if (target instanceof HTMLInputElement && target.name === "stage") {
    applyStage(target.value);
    persistSbc();
    renderSbcTotals();
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

must("#add-work").addEventListener("click", () => addWork(true));
must("#open-book").addEventListener("click", () => show("book"));

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
must("#kp-reset").addEventListener("click", resetLetter);
must<HTMLInputElement>("#kp-adjust").addEventListener("input", () => {
  adjustPercent = readAdjust();
  paint();
});
must("#save-card").addEventListener("click", () => {
  const snapshots = projectSnapshots();
  download("raschet.json", {
    object: field("object"),
    customer: field("customer"),
    region: field("region"),
    adjustPercent,
    phases: snapshots.map((item) => ({
      name: item.phase.name,
      objectKind: item.phase.kind,
      stage: item.phase.stage,
      works: item.quote.lines.filter((line) => line.sum > 0).map((line) => ({
        name: line.name,
        qty: line.qty,
        price: line.price,
        sum: line.sum,
      })),
      extras: item.quote.extras.map((extra) => ({
        name: extra.name,
        rate: extra.rate,
        sum: extra.sum,
      })),
      total: item.quote.total,
      offer: offerOf(item.quote),
      sbcCurrent: item.sbc?.now ?? 0,
      sbcBaseThousand: item.sbc?.base ?? 0,
      sbcFactoredThousand: item.sbc?.factored ?? 0,
    })),
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
  const source = activeRows().find((row) => row.id !== "custom") ?? activeRows()[0];
  sbcLines.push({
    id: uid("sbc"),
    rowId: source.id,
    x: source.floor100 ? 100 : 1,
    a: source.a,
    b: source.b,
    customName: "",
    factors: {},
  });
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

loadProject();
bindColumnTips();
renderBook();
renderExtras();
hydratePhase();
bindPhaseTabs();
bindLetter();
must<HTMLInputElement>("#kp-adjust").value = String(adjustPercent);
applyStaticEdits();
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
  if (mute) return;
  const snapshots = projectSnapshots();
  const quote = snapshots[activePhase]?.quote ?? currentQuote();
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
  const projectReady = snapshots.some((item) => !item.quote.empty || (item.sbc?.now ?? 0) > 0);
  const blockedNote = projectReady
    ? quote.empty
      ? "В этом этапе пусто. В КП попадут остальные этапы."
      : ""
    : quote.note;
  kpButton.disabled = !projectReady;
  kpButton.title = blockedNote;
  openKpButton.disabled = !projectReady;
  openKpButton.title = blockedNote;
  text("#object-title", field("object") || "Без названия");
  paintProposal(snapshots);
  paintFork(snapshots);
  persistProject();
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

function paintProposal(items: Snapshot[]) {
  const used = items.some((item) => !item.quote.empty) ? items.filter((item) => !item.quote.empty) : items;
  const stages = new Set(used.map((item) => item.phase.stage));
  const stage = stages.size === 1 ? [...stages][0] : "pr";
  fillEditable("#kp-work", workTitle(stage));
  const customer = field("customer").trim();
  const objectName = field("object").trim();
  fillEditable("#kp-intro", [customer, objectName].filter(Boolean).join(" · "));
  const rows = kpRows(items);
  const structure = rows.map((row) => row.marker).join("\n");
  const monies = rows.map((row) => (row.moneyAt >= 0 ? row.cells[row.moneyAt] : "")).join("\n");
  const body = must("#kp-lines");
  if (structure !== proposalStructure || forceProposal) {
    body.replaceChildren();
    rows.forEach((row) => body.append(kpRow(row)));
    proposalStructure = structure;
    proposalMoney = monies;
    return;
  }
  if (monies === proposalMoney) return;
  const lines = [...body.querySelectorAll("tr")];
  rows.forEach((row, index) => {
    if (row.moneyAt < 0) return;
    const cell = lines[index]?.children[row.moneyAt];
    if (!(cell instanceof HTMLElement)) return;
    const key = cell.dataset.editKey || "";
    if (Object.prototype.hasOwnProperty.call(letterEdits, key)) return;
    cell.textContent = row.cells[row.moneyAt] ?? "";
  });
  proposalMoney = monies;
}

function show(view: View) {
  if (view === "sbc" && !kind) return;
  currentView = view;
  const panels: Record<View, HTMLElement> = {
    desk: must("#desk"),
    book: must("#book"),
    sbc: must("#sbc"),
    kp: must("#proposal"),
  };
  (Object.keys(panels) as View[]).forEach((name) => {
    panels[name].hidden = name !== view;
  });
  const selected = tabs.some((tab) => tab.view === view);
  tabs.forEach((tab) => {
    const on = tab.view === view;
    tab.button.setAttribute("aria-selected", on ? "true" : "false");
    if (tab.button.disabled) return;
    const inTabOrder = on || (!selected && tab.view === "desk");
    tab.button.tabIndex = inTabOrder ? 0 : -1;
  });
  if (view !== "desk") panels[view].focus();
}

function openKp() {
  if (kpButton.disabled) return;
  show("kp");
}

function addWork(focus: boolean) {
  const select = appendWork();
  if (focus) select.focus();
  paint();
}

function appendWork(item?: WorkDraft) {
  const body = must("#works tbody");
  const row = document.createElement("tr");
  const no = document.createElement("th");
  no.scope = "row";
  no.className = "num row-no";
  const nameCell = document.createElement("td");
  nameCell.dataset.label = "Наименование работы";
  const select = document.createElement("select");
  select.name = "work";
  fillWorkSelect(select, item?.ref || "");
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
  qty.value = String(item?.qty ?? 1);
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
  price.value = String(item?.price ?? 0);
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
  return select;
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
  return {
    stage: asStage(selected?.value || "r"),
    k: readK(),
    index: readIndex(),
    lines: sbcLines,
    edition: kind === "site" ? "site" as const : "linear" as const,
  };
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
  const rows = activeRows();
  must<HTMLElement>("#sbc-factor-head").hidden = kind !== "site";
  const sheet = quoteSbc(readSbcSheet());
  sheet.lines.forEach((item) => {
    const tr = document.createElement("tr");
    const choice = document.createElement("td");
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Строка справочника");
    let group: string | null = null;
    let container: HTMLSelectElement | HTMLOptGroupElement = select;
    rows.forEach((source) => {
      if (source.group !== group) {
        group = source.group;
        container = document.createElement("optgroup");
        container.label = group;
        select.append(container);
      }
      container.append(option(source.id, source.name));
    });
    if ([...select.options].some((entry) => entry.value === item.line.rowId)) select.value = item.line.rowId;
    select.addEventListener("change", () => {
      item.line.rowId = select.value;
      item.line.factors = {};
      const source = rows.find((entry) => entry.id === select.value);
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
    const factorCell = document.createElement("td");
    if (kind === "site") factorCell.append(factorBox(item.line, item.source, item.custom));
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
    sum.textContent = item.blocked ? "не входит" : money.format(item.current);
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
    if (kind === "site") tr.append(choice, xCell, factorCell, aCell, bCell, sum, action);
    else tr.append(choice, xCell, aCell, bCell, sum, action);
    body.append(tr);
  });
  must<HTMLElement>("#sbc-empty").hidden = sbcLines.length > 0;
  renderSbcTotals();
}

function renderSbcTotals() {
  text("#sbc-index-readout", indexText());
  writeLede(kind === "site" ? siteLede() : linearLede());
  const sheet = quoteSbc(readSbcSheet());
  const priced = sheet.lines.some((line) => !line.blocked);
  text("#sbc-base", sbcLines.length && priced ? sbcNum.format(sheet.base) : "—");
  text("#sbc-factored", sbcLines.length && priced ? sbcNum.format(sheet.factored) : "—");
  text("#sbc-now", sbcLines.length && priced ? money.format(sheet.now) : "—");
  const note = must<HTMLElement>("#sbc-note");
  note.hidden = sheet.notes.length === 0;
  note.textContent = sheet.notes.join(" ");
  const warn = must<HTMLElement>("#sbc-warn");
  warn.hidden = sheet.warnings.length === 0;
  warn.textContent = sheet.warnings.join(" ");
  document.querySelectorAll("#sbc-table tbody tr").forEach((tr, index) => {
    const cell = tr.querySelector(".line-sum");
    const line = sheet.lines[index];
    if (cell && line) cell.textContent = line.blocked ? "не входит" : money.format(line.current);
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

function loadStore() {
  buckets = { linear: emptyBucket(), site: emptyBucket() };
  kind = null;
  const saved = readJson(SBC_KEY);
  if (isV2(saved)) {
    buckets.linear = sanitizeBucket(saved.linear);
    buckets.site = sanitizeBucket(saved.site);
    if (saved.objectKind === "linear" || saved.objectKind === "site") kind = saved.objectKind;
    if (typeof saved.stage === "string") applyStage(saved.stage);
    if (isIndex(saved.index)) sbcIndex = saved.index;
  } else {
    const legacy = readJson(SBC_KEY_V1);
    if (isLegacy(legacy)) {
      kind = "linear";
      buckets.linear = sanitizeBucket({ k: legacy.k, lines: legacy.lines });
      if (typeof legacy.stage === "string") applyStage(legacy.stage);
    }
  }
  sbcLines = kind ? buckets[kind].lines : [];
  must<HTMLInputElement>("[name=sbc-index]").value = String(sbcIndex);
  if (kind) {
    must<HTMLInputElement>("[name=sbc-k]").value = String(buckets[kind].k);
    const radio = document.querySelector<HTMLInputElement>(`input[name="object-kind"][value="${kind}"]`);
    if (radio) radio.checked = true;
  }
}

function persistSbc() {
  persistProject();
}

function persistProject() {
  if (mute || !phases.length) return;
  commitActive();
  sbcIndex = readIndex();
  const phase = phases[activePhase];
  localStorage.setItem(SBC_KEY, JSON.stringify({
    objectKind: phase?.kind ?? null,
    stage: phase?.stage ?? "r",
    index: sbcIndex,
    linear: phase?.buckets.linear ?? emptyBucket(),
    site: phase?.buckets.site ?? emptyBucket(),
  }));
  localStorage.setItem(PHASES_KEY, JSON.stringify({
    customer: field("customer"),
    object: field("object"),
    region: field("region"),
    adjustPercent,
    active: activePhase,
    index: sbcIndex,
    phases,
    letter: letterEdits,
  }));
}

function loadProject() {
  buckets = { linear: emptyBucket(), site: emptyBucket() };
  kind = null;
  const saved = readJson(PHASES_KEY);
  if (isProject(saved) && saved.phases.length > 0) {
    phases = saved.phases.map((item, index) => sanitizePhase(item, index));
    activePhase = Math.min(Math.max(0, Number(saved.active) || 0), phases.length - 1);
    adjustPercent = finiteNumber(saved.adjustPercent);
    if (isIndex(saved.index)) sbcIndex = saved.index;
    letterEdits = sanitizeLetter(saved.letter);
    setNamedField("customer", saved.customer);
    setNamedField("object", saved.object);
    setNamedField("region", saved.region);
    must<HTMLInputElement>("#phase-count").value = String(phases.length);
    return;
  }
  loadStore();
  phases = [blankPhase(0)];
  if (kind === "linear" || kind === "site") phases[0].kind = kind;
  else kind = "site";
  phases[0].stage = asStage(field("stage") || "r");
  phases[0].buckets = cloneBuckets(buckets);
  activePhase = 0;
}

function isPosition(value: unknown): value is Position {
  if (!value || typeof value !== "object") return false;
  const item = value as Position;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.unit === "string" && Array.isArray(item.variants);
}

function isLegacy(value: unknown): value is { lines: unknown; k?: unknown; stage?: unknown } {
  return !!value && typeof value === "object" && Array.isArray((value as { lines?: unknown }).lines);
}

function isV2(value: unknown): value is { objectKind?: unknown; stage?: unknown; index?: unknown; linear?: unknown; site?: unknown } {
  if (!value || typeof value !== "object") return false;
  const item = value as { linear?: unknown; site?: unknown };
  return !!item.linear && !!item.site;
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

type KpRow = { marker: string; cells: string[]; moneyAt: number; className?: string; span?: boolean };
type PricedWork = WorkLine & { scaled: number };
type PricedExtra = { id: string; name: string; rate: number; scaled: number };

const LETTER_EXTRA: Record<string, string> = {
  bim: "BIM",
  tax: "Налог СЗ",
  vor: "ВОР",
  expert: "Экспертиза",
  approval: "Согласования",
  rush: "Срочность",
};

const PACK_AT = 6;

function kpRows(items: Snapshot[]): KpRow[] {
  const visible = items.filter((item) => !item.quote.empty);
  if (!visible.length) {
    return [{
      marker: "empty",
      cells: ["В предложении пока нет строк. Добавьте работу на вкладке себестоимости."],
      moneyAt: -1,
      span: true,
    }];
  }
  const rows: KpRow[] = [];
  const multi = visible.length > 1;
  const mixedStages = new Set(visible.map((item) => item.phase.stage)).size > 1;
  const shared = new Set(visible.map((item) => extraSignature(item.quote))).size <= 1;
  let grand = 0;
  visible.forEach((item) => {
    pushPhaseHead(rows, item, multi, mixedStages);
    const works = pricedWorks(item.quote);
    const worksSum = appendWorks(rows, item.phase.id, works);
    if (shared) {
      grand += worksSum;
      if (multi && extraSignature(item.quote) === "") {
        rows.push(moneyRow(`sub:${item.phase.id}`, "Итого этапа", worksSum, "subtotal"));
      }
      return;
    }
    const extras = pricedExtras(item.quote);
    let phaseTotal = worksSum;
    if (extras.length) {
      rows.push(worksSumRow(`works:${item.phase.id}`, worksSum));
      extras.forEach((extra) => {
        phaseTotal += extra.scaled;
        rows.push(extraRow(`extra:${item.phase.id}:${extra.id}:${extra.rate}`, extra));
      });
    }
    grand += phaseTotal;
    if (multi) rows.push(moneyRow(`sub:${item.phase.id}`, "Итого этапа", phaseTotal, "subtotal"));
  });
  if (shared) {
    const extras = mergeExtras(visible);
    if (extras.length) {
      rows.push(worksSumRow("works:all", grand));
      extras.forEach((extra) => {
        grand += extra.scaled;
        rows.push(extraRow(`extra:all:${extra.id}:${extra.rate}`, extra));
      });
    }
  }
  rows.push(moneyRow("grand", "Итого", grand, "sum-row"));
  return rows;
}

function pushPhaseHead(rows: KpRow[], item: Snapshot, multi: boolean, mixedStages: boolean) {
  const name = item.phase.name.trim() || "Этап";
  const index = phases.indexOf(item.phase);
  const renamed = name !== `Этап ${index + 1}`;
  if (!multi && !renamed) return;
  const title = mixedStages ? `${name} · ${stageLabel(item.phase.stage)}` : name;
  rows.push({
    marker: `phase:${item.phase.id}:${title}`,
    cells: [title],
    moneyAt: -1,
    span: true,
    className: "phase-row",
  });
}

function pricedWorks(quote: Quote): PricedWork[] {
  return quote.lines
    .filter((line) => line.qty > 0 && line.sum > 0)
    .map((line) => ({ ...line, scaled: scaleMoney(line.sum, adjustPercent) }));
}

function pricedExtras(quote: Quote): PricedExtra[] {
  return quote.extras
    .filter((extra) => extra.sum > 0)
    .map((extra) => ({ id: extra.id, name: extra.name, rate: extra.rate, scaled: scaleMoney(extra.sum, adjustPercent) }));
}

function extraSignature(quote: Quote) {
  return quote.extras.filter((extra) => extra.sum > 0).map((extra) => `${extra.id}:${extra.rate}`).join("|");
}

function mergeExtras(items: Snapshot[]): PricedExtra[] {
  const order: string[] = [];
  const sums = new Map<string, PricedExtra>();
  items.forEach((item) => {
    pricedExtras(item.quote).forEach((extra) => {
      const current = sums.get(extra.id);
      if (!current) {
        order.push(extra.id);
        sums.set(extra.id, { ...extra });
        return;
      }
      current.scaled += extra.scaled;
    });
  });
  return order.flatMap((id) => {
    const extra = sums.get(id);
    return extra ? [extra] : [];
  });
}

function appendWorks(rows: KpRow[], phaseId: string, lines: PricedWork[]) {
  const sum = lines.reduce((acc, line) => acc + line.scaled, 0);
  if (lines.length <= PACK_AT) {
    lines.forEach((line, index) => rows.push(workRow(phaseId, line, index)));
    return sum;
  }
  const grouped = groupWorks(lines);
  if (grouped && grouped.length < lines.length) {
    grouped.forEach((group) => {
      rows.push({
        marker: `group:${phaseId}:${group.key}:${group.marker}`,
        cells: [group.label, group.qty, money.format(group.sum)],
        moneyAt: 2,
      });
    });
    return sum;
  }
  rows.push({
    marker: `pack:${phaseId}:${lines.map((line) => `${line.name}:${line.qty}`).join("|")}`,
    cells: [lines.map((line) => `${line.missing ? "Нет в базе" : line.name} — ${line.qty} ${line.unit}`).join("\n"), `${lines.length} поз.`, money.format(sum)],
    moneyAt: 2,
    className: "pack",
  });
  return sum;
}

function groupWorks(lines: PricedWork[]) {
  const buckets = new Map<string, PricedWork[]>();
  lines.forEach((line) => {
    const key = networkOf(line.name) || "Прочее";
    buckets.set(key, [...(buckets.get(key) ?? []), line]);
  });
  const named = [...buckets.keys()].filter((key) => key !== "Прочее");
  const rest = buckets.get("Прочее")?.length ?? 0;
  if (named.length === 0 || (named.length < 2 && rest > 4)) return null;
  const order = [...buckets.keys()];
  return order.map((key) => {
    const group = buckets.get(key) ?? [];
    const bits = group.map((line) => workBit(line, key));
    return {
      key,
      marker: group.map((line) => `${line.name}:${line.qty}`).join(","),
      label: key === "Прочее" ? bits.join(", ") : `${key}: ${bits.join(", ")}`,
      qty: group.length === 1 ? `${group[0].qty} ${group[0].unit}` : `${group.length} поз.`,
      sum: group.reduce((acc, line) => acc + line.scaled, 0),
    };
  });
}

function networkOf(name: string) {
  if (name.includes("НК1")) return "НК1";
  if (name.includes("НК2")) return "НК2";
  if (name.includes("НВ")) return "НВ";
  if (name.includes("НК")) return "НК";
  if (/дренаж/i.test(name) || /(?:^|\s)Д$/.test(name)) return "Дренаж";
  return "";
}

function workBit(line: PricedWork, key: string) {
  const name = line.missing ? "нет в базе" : key === "Прочее" ? line.name : shortWork(line.name, key);
  if (line.qty === 1 && line.unit === "шт.") return name;
  return `${name} ${line.qty} ${line.unit}`;
}

function shortWork(name: string, key: string) {
  const pattern = key === "Дренаж" ? /дренаж|(?:^|\s)Д$/i : key;
  const trimmed = name.replace(pattern, " ").replace(/\s+/g, " ").trim();
  return (trimmed || name).toLocaleLowerCase("ru-RU");
}

function workRow(phaseId: string, line: PricedWork, index: number): KpRow {
  return {
    marker: `line:${phaseId}:${index}:${line.name}:${line.qty}:${line.unit}`,
    cells: [line.missing ? "Нет в базе" : line.name, `${line.qty} ${line.unit}`, money.format(line.scaled)],
    moneyAt: 2,
  };
}

function worksSumRow(marker: string, sum: number): KpRow {
  return moneyRow(marker, "Стоимость работ", sum, "works-sum");
}

function extraRow(marker: string, extra: PricedExtra): KpRow {
  const name = LETTER_EXTRA[extra.id] ?? extra.name;
  return {
    marker,
    cells: [`${name} ${pct.format(extra.rate)}`, "", money.format(extra.scaled)],
    moneyAt: 2,
  };
}

function moneyRow(marker: string, label: string, sum: number, className: string): KpRow {
  return {
    marker,
    cells: [label, "", money.format(sum)],
    moneyAt: 2,
    className,
  };
}

function kpRow(row: KpRow) {
  const tr = document.createElement("tr");
  if (row.className) tr.className = row.className;
  if (row.span) {
    const td = editableCell(row.cells[0] ?? "", false, `${row.marker}#0`);
    td.colSpan = 3;
    tr.append(td);
    return tr;
  }
  row.cells.forEach((value, index) => tr.append(editableCell(value, index > 0, `${row.marker}#${index}`)));
  return tr;
}

function editableCell(value: string, numeric: boolean, key: string) {
  const td = document.createElement("td");
  const stored = Object.prototype.hasOwnProperty.call(letterEdits, key) ? letterEdits[key] : undefined;
  td.textContent = stored ?? value;
  td.setAttribute("contenteditable", "plaintext-only");
  td.spellcheck = !numeric;
  td.dataset.editKey = key;
  if (numeric) td.className = "num";
  return td;
}

function workTitle(stage: Stage) {
  if (stage === "p") return "Разработка проектной документации";
  if (stage === "r") return "Разработка рабочей документации";
  return "Разработка проектной и рабочей документации";
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

function applyKind(next: ObjectKind) {
  if (kind) {
    buckets[kind].k = readK();
    buckets[kind].lines = sbcLines;
  }
  kind = next;
  sbcLines = buckets[next].lines;
  must<HTMLInputElement>("[name=sbc-k]").value = String(buckets[next].k);
  syncKindChrome();
  renderSbc();
  persistSbc();
}

function syncKindChrome() {
  const tab = must<HTMLButtonElement>("#tab-sbc");
  tab.disabled = kind === null;
  tab.title = kind === null ? "Сначала выберите тип объекта" : "";
  const copy = stageCopy(kind);
  text("#card-stage-label", copy.label);
  text("#sbc-stage-label", copy.label);
  for (const key of ["p", "r", "pr"] as const) {
    text(`#card-stage-${key}`, copy[key]);
    text(`#sbc-stage-${key}`, copy[key]);
  }
  must<HTMLElement>("#k-sbc1").hidden = kind === "site";
  must<HTMLElement>("#k-sbc2").hidden = kind !== "site";
  must<HTMLElement>("#k-site-note").hidden = kind !== "site";
  must<HTMLInputElement>("[name=sbc-k]").setAttribute("aria-describedby", kind === "site" ? "k-caption-site" : "k-caption");
  writeLede(kind === "site" ? siteLede() : linearLede());
  text("#sbc-empty", kind === "site" ? SITE_EMPTY : LINEAR_EMPTY);
  text("#tip-sbc-row", kind === "site" ? SITE_ROW_TIP : LINEAR_ROW_TIP);
  text("#tip-sbc-x", kind === "site" ? SITE_X_TIP : LINEAR_X_TIP);
  text("#kind-hint", kindHint(kind));
  must<HTMLElement>("#sbc-factor-head").hidden = kind !== "site";
}

function stageCopy(value: ObjectKind | null) {
  if (value === "site") return { label: "Стадия по пунктам 2.3.4 и 2.4.11", p: "П, 50%", r: "Р, 50%", pr: "П+Р, 100%" };
  if (value === "linear") return { label: "Стадия по пункту 1.7", p: "П, 60%", r: "Р, 40%", pr: "П+Р, 100%" };
  return { label: "Стадия", p: "П", r: "Р", pr: "П+Р" };
}

function kindHint(value: ObjectKind | null) {
  if (value === "linear") return "Справочник СБЦП 81-2001-17. Стадия 60% и 40%. Показатель сетей — расход и километры.";
  if (value === "site") return "Справочник СБЦП 81-2001-07, таблицы 4–7. Стадия 50% и 50%. Показатель сетей — диаметр и метры.";
  return "Выберите тип, и откроется вкладка «Стоимость в СБЦ».";
}

function activeRows(): SbcSourceRow[] {
  return kind === "site" ? SBC2_ROWS : SBC_ROWS;
}

function factorBox(line: SbcLineInput, source: SbcSourceRow, custom: boolean) {
  if (custom || source.factors.length === 0) return document.createTextNode("—");
  const box = document.createElement("div");
  box.className = "line-factors";
  source.factors.forEach((key) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(line.factors?.[key]);
    input.addEventListener("change", () => {
      line.factors = { ...line.factors, [key]: input.checked };
      persistSbc();
      paint();
      renderSbcTotals();
    });
    const caption = document.createElement("span");
    caption.textContent = FACTOR_LABEL[key];
    label.append(input, caption);
    box.append(label);
  });
  return box;
}

function emptyBucket(): Bucket {
  return { k: 1, lines: [] };
}

function readK() {
  const raw = Number(must<HTMLInputElement>("[name=sbc-k]").value);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

function readIndex() {
  const raw = Number(must<HTMLInputElement>("[name=sbc-index]").value);
  return isIndex(raw) ? raw : SBC_INDEX;
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function indexText() {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(readIndex());
}

function siteLede() {
  return editionLede(SITE_TITLE);
}

function linearLede() {
  return editionLede(LINEAR_TITLE);
}

function editionLede(title: string) {
  return `${title}\nИндекс квартала к этой базе — ${indexText()}.`;
}

function writeLede(value: string) {
  const el = must("#sbc-lede");
  const lines = value.split("\n");
  el.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) {
      el.append(" ");
      el.append(document.createElement("br"));
    }
    el.append(line);
  });
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function sanitizeBucket(value: unknown): Bucket {
  if (!value || typeof value !== "object") return emptyBucket();
  const item = value as { k?: unknown; lines?: unknown };
  const lines = Array.isArray(item.lines) ? item.lines.flatMap((line) => {
    const clean = sanitizeLine(line);
    return clean ? [clean] : [];
  }) : [];
  const k = Number(item.k);
  return { k: Number.isFinite(k) && k >= 0 ? k : 1, lines };
}

function sanitizeLine(value: unknown): SbcLineInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as SbcLineInput;
  if (typeof item.id !== "string" || typeof item.rowId !== "string") return null;
  return {
    id: item.id,
    rowId: item.rowId,
    x: Number(item.x) || 0,
    a: item.a === null || item.a === undefined ? null : Number(item.a) || 0,
    b: item.b === null || item.b === undefined ? null : Number(item.b),
    customName: typeof item.customName === "string" ? item.customName : "",
    factors: sanitizeFactors(item.factors),
  };
}

function sanitizeFactors(value: unknown): Partial<Record<SbcFactor, boolean>> {
  if (!value || typeof value !== "object") return {};
  const source = value as Partial<Record<SbcFactor, unknown>>;
  const factors: Partial<Record<SbcFactor, boolean>> = {};
  (Object.keys(FACTOR_LABEL) as SbcFactor[]).forEach((key) => {
    if (source[key]) factors[key] = true;
  });
  return factors;
}

function blankPhase(index: number, like?: PhaseDraft): PhaseDraft {
  const inherited = like?.kind;
  return {
    id: uid("phase"),
    name: `Этап ${index + 1}`,
    kind: inherited === "linear" || inherited === "site" ? inherited : "site",
    stage: like?.stage ?? "r",
    works: [{ ref: "", qty: 1, price: 0 }],
    extras: [],
    buckets: emptyBuckets(),
  };
}

function hydratePhase() {
  const phase = phases[activePhase];
  if (!phase) return;
  mute = true;
  kind = phase.kind;
  buckets = cloneBuckets(phase.buckets);
  sbcLines = kind ? buckets[kind].lines : [];
  applyStage(phase.stage);
  document.querySelectorAll<HTMLInputElement>('input[name="object-kind"]').forEach((input) => {
    input.checked = input.value === kind;
  });
  must<HTMLInputElement>("[name=sbc-k]").value = String(kind ? buckets[kind].k : 1);
  must<HTMLInputElement>("[name=sbc-index]").value = String(sbcIndex);
  must<HTMLInputElement>("#phase-count").value = String(phases.length);
  renderPhaseNames();
  renderPhaseSwitch();
  fillWorks(phase.works);
  document.querySelectorAll<HTMLInputElement>('#card input[name="extra"]').forEach((input) => {
    input.checked = phase.extras.includes(input.value);
  });
  syncKindChrome();
  renderSbc();
  mute = false;
}

function fillWorks(works: WorkDraft[]) {
  must("#works tbody").replaceChildren();
  const rows = works.length ? works : [{ ref: "", qty: 1, price: 0 }];
  rows.forEach((item) => appendWork(item));
}

function renderPhaseNames() {
  const host = must("#phase-names");
  const current = document.activeElement;
  const focusIndex = current instanceof HTMLInputElement ? current.dataset.phaseName ?? "" : "";
  const caret = current instanceof HTMLInputElement ? current.selectionStart : null;
  host.replaceChildren();
  phases.forEach((phase, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "text";
    input.name = "phase-name";
    input.dataset.phaseName = String(index);
    input.value = phase.name;
    input.autocomplete = "off";
    input.setAttribute("aria-label", `Наименование этапа ${index + 1}`);
    label.append(`Наименование этапа ${index + 1}`, input);
    host.append(label);
  });
  if (!focusIndex) return;
  const input = host.querySelector<HTMLInputElement>(`[data-phase-name="${focusIndex}"]`);
  if (!input) return;
  input.focus();
  if (caret !== null) input.setSelectionRange(caret, caret);
}

function renderPhaseSwitch() {
  ["phase-switch", "phase-switch-sbc"].forEach((id) => {
    const host = document.getElementById(id);
    if (!host) return;
    const keepFocus = host.contains(document.activeElement);
    host.replaceChildren();
    phases.forEach((phase, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", index === activePhase ? "true" : "false");
      button.tabIndex = index === activePhase ? 0 : -1;
      button.textContent = phase.name.trim() || `Этап ${index + 1}`;
      button.addEventListener("click", () => activatePhase(index));
      host.append(button);
    });
    if (keepFocus) host.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  });
  const phase = phases[activePhase];
  text("#phase-legend", phase?.name.trim() || "Расчёт этапа");
  text("#phase-hint", phaseHint());
}

function phaseHint() {
  const phase = phases[activePhase];
  const name = phase?.name.trim() || `Этап ${activePhase + 1}`;
  if (phases.length < 2) return `Сейчас один этап «${name}». Число этапов задаётся в карточке объекта.`;
  return `Считаем «${name}». Тип, стадия, работы, опции и СБЦ у каждого этапа свои. Сводка всех этапов — в коммерческом КП.`;
}

function bindPhaseTabs() {
  document.querySelectorAll<HTMLElement>(".phase-tabs").forEach((host) => {
    host.addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const index = buttons.findIndex((button) => button === document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
      if (event.key === "ArrowLeft") next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      const target = buttons[next];
      target?.focus();
      target?.click();
    });
  });
}

function activatePhase(index: number) {
  if (index === activePhase || !phases[index]) return;
  commitActive();
  activePhase = index;
  hydratePhase();
  if (currentView === "sbc" && !kind) show("desk");
  paint();
}

function resizePhases(raw: number) {
  const count = Math.min(PHASE_MAX, Math.max(1, Math.round(raw) || phases.length));
  const input = must<HTMLInputElement>("#phase-count");
  if (count === phases.length) {
    input.value = String(count);
    return;
  }
  commitActive();
  if (count < phases.length) {
    const doomed = phases.slice(count);
    if (doomed.some(phaseHasCalc)) {
      const ok = window.confirm(`Убрать этапы ${count + 1}–${phases.length}? Их расчёт сотрётся.`);
      if (!ok) {
        input.value = String(phases.length);
        return;
      }
    }
    phases = phases.slice(0, count);
    if (activePhase >= count) activePhase = count - 1;
  } else {
    while (phases.length < count) phases.push(blankPhase(phases.length, phases.at(-1)));
  }
  input.value = String(phases.length);
  hydratePhase();
  paint();
}

function commitActive() {
  const phase = phases[activePhase];
  if (!phase || mute) return;
  readPhaseNames();
  phase.kind = kind;
  phase.stage = asStage(field("stage") || phase.stage);
  phase.works = readWorks();
  phase.extras = readExtras();
  if (kind === "linear" || kind === "site") {
    buckets[kind].k = readK();
    buckets[kind].lines = sbcLines;
  }
  phase.buckets = cloneBuckets(buckets);
}

function readPhaseNames() {
  document.querySelectorAll<HTMLInputElement>("[data-phase-name]").forEach((input) => {
    const index = Number(input.dataset.phaseName);
    if (!phases[index]) return;
    phases[index].name = input.value;
  });
}

function cloneBuckets(source: Record<ObjectKind, Bucket>): Record<ObjectKind, Bucket> {
  return {
    linear: { k: source.linear.k, lines: source.linear.lines.map(cloneLine) },
    site: { k: source.site.k, lines: source.site.lines.map(cloneLine) },
  };
}

function cloneLine(line: SbcLineInput): SbcLineInput {
  return { ...line, factors: { ...line.factors } };
}

function projectSnapshots(): Snapshot[] {
  commitActive();
  return phases.map((phase) => {
    const sbc = sbcOf(phase);
    const quote = quoteCard({
      works: phase.works,
      extras: phase.extras,
      sbcNow: sbc?.now ?? 0,
    }, catalog);
    return { phase, quote, sbc };
  });
}

function sbcOf(phase: PhaseDraft) {
  if (phase.kind !== "linear" && phase.kind !== "site") return null;
  const bucket = phase.buckets[phase.kind];
  return quoteSbc({
    stage: phase.stage,
    k: bucket.k,
    index: sbcIndex,
    lines: bucket.lines,
    edition: phase.kind,
  });
}

function offerOf(quote: Quote) {
  const works = quote.lines
    .filter((item) => item.qty > 0 && item.sum > 0)
    .reduce((acc, item) => acc + scaleMoney(item.sum, adjustPercent), 0);
  const extras = quote.extras
    .filter((item) => item.sum > 0)
    .reduce((acc, item) => acc + scaleMoney(item.sum, adjustPercent), 0);
  return works + extras;
}

function paintFork(items: Snapshot[]) {
  const body = must("#fork-lines");
  body.replaceChildren();
  let cost = 0;
  let reference = 0;
  let offer = 0;
  items.forEach((item) => {
    const rowCost = item.quote.total;
    const rowSbc = item.sbc?.now ?? 0;
    const rowOffer = offerOf(item.quote);
    cost += rowCost;
    reference += rowSbc;
    offer += rowOffer;
    body.append(forkRow(item.phase.name.trim() || "Этап", rowCost, rowSbc, rowOffer, false));
  });
  const foot = must<HTMLElement>("#fork-total");
  foot.replaceChildren();
  if (items.length > 1) {
    foot.hidden = false;
    foot.append(forkRow("Все этапы", cost, reference, offer, true));
  } else {
    foot.hidden = true;
  }
}

function forkRow(name: string, cost: number, sbc: number, offer: number, head: boolean) {
  const tr = document.createElement("tr");
  const title = document.createElement(head ? "th" : "td");
  if (title instanceof HTMLTableCellElement && head) title.scope = "row";
  title.textContent = name;
  tr.append(title, moneyCell(cost), moneyCell(sbc), moneyCell(offer), plainCell(gapText(cost, offer)), plainCell(gapText(sbc, offer)));
  return tr;
}

function moneyCell(value: number) {
  const td = document.createElement("td");
  td.className = "num";
  td.textContent = value > 0 ? money.format(value) : "—";
  return td;
}

function plainCell(value: string) {
  const td = document.createElement("td");
  td.className = "num";
  td.textContent = value;
  return td;
}

function gapText(base: number, value: number) {
  if (base <= 0 || value <= 0) return "—";
  const ratio = (value - base) / base;
  const formatted = pct.format(ratio);
  return ratio > 0 ? `+${formatted}` : formatted;
}

function stageLabel(stage: Stage) {
  if (stage === "p") return "П";
  if (stage === "r") return "Р";
  return "П+Р";
}

function fillEditable(selector: string, value: string) {
  const el = must<HTMLElement>(selector);
  const key = el.dataset.editKey || "";
  if (forceProposal && key) delete letterEdits[key];
  const stored = !forceProposal && key && Object.prototype.hasOwnProperty.call(letterEdits, key)
    ? letterEdits[key]
    : value;
  if (el.textContent === stored) return;
  el.textContent = stored;
}

function bindLetter() {
  must("#kp-letter").addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const key = target.dataset.editKey;
    if (!key) return;
    letterEdits[key] = target.textContent ?? "";
    persistProject();
  });
}

function applyStaticEdits() {
  document.querySelectorAll<HTMLElement>("#kp-letter [data-edit-key][data-origin]").forEach((el) => {
    const key = el.dataset.editKey || "";
    if (Object.prototype.hasOwnProperty.call(letterEdits, key)) el.textContent = letterEdits[key];
  });
}

function resetLetter() {
  letterEdits = {};
  document.querySelectorAll<HTMLElement>("#kp-letter [data-origin]").forEach((el) => {
    el.textContent = el.dataset.origin ?? "";
  });
  proposalStructure = "";
  proposalMoney = "";
  forceProposal = true;
  paint();
  forceProposal = false;
}

function readAdjust() {
  return finiteNumber(must<HTMLInputElement>("#kp-adjust").value);
}

function finiteNumber(value: unknown) {
  const raw = Number(value);
  return Number.isFinite(raw) ? raw : 0;
}

function setNamedField(name: string, value: unknown) {
  if (typeof value !== "string") return;
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLSelectElement && ![...el.options].some((option) => option.value === value)) return;
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = value;
}

function isProject(value: unknown): value is {
  phases: unknown[];
  active?: unknown;
  customer?: unknown;
  object?: unknown;
  region?: unknown;
  adjustPercent?: unknown;
  index?: unknown;
  letter?: unknown;
} {
  return !!value && typeof value === "object" && Array.isArray((value as { phases?: unknown }).phases);
}

function sanitizeLetter(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[0] === "string" && entry[0].length < 240 && typeof entry[1] === "string")
      .slice(0, 400)
      .map(([key, text]) => [key, text.slice(0, 2000)]),
  );
}

function sanitizePhase(value: unknown, index: number): PhaseDraft {
  const blank = blankPhase(index);
  if (!value || typeof value !== "object") return blank;
  const item = value as Partial<PhaseDraft>;
  const stored = item.buckets;
  return {
    id: typeof item.id === "string" && item.id ? item.id : blank.id,
    name: typeof item.name === "string" ? item.name : blank.name,
    kind: item.kind === "linear" || item.kind === "site" ? item.kind : "site",
    stage: asStage(typeof item.stage === "string" ? item.stage : "r"),
    works: Array.isArray(item.works) && item.works.length ? item.works.map(sanitizeWork) : blank.works,
    extras: Array.isArray(item.extras) ? item.extras.filter((entry): entry is string => typeof entry === "string") : [],
    buckets: {
      linear: sanitizeBucket(stored && typeof stored === "object" ? stored.linear : null),
      site: sanitizeBucket(stored && typeof stored === "object" ? stored.site : null),
    },
  };
}

function sanitizeWork(value: unknown): WorkDraft {
  if (!value || typeof value !== "object") return { ref: "", qty: 1, price: 0 };
  const item = value as WorkDraft;
  const price = Number(item.price);
  return {
    ref: typeof item.ref === "string" ? item.ref : "",
    qty: Number(item.qty) || 0,
    price: Number.isFinite(price) ? price : 0,
  };
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
  return "r";
}
