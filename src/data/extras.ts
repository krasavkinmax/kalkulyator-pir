export interface ExtraRate {
  id: string;
  name: string;
  rate: number;
}

/** Надбавки к итогу таблицы «Вид работ». Считаются от этой суммы и складываются. */
export const EXTRAS: ExtraRate[] = [
  { id: "bim", name: "Разработка BIM", rate: 0.15 },
  { id: "tax", name: "Налог СЗ", rate: 0.06 },
  { id: "vor", name: "Разработка ВОР", rate: 0.15 },
  { id: "expert", name: "Экспертиза", rate: 0.15 },
  { id: "approval", name: "Согласование с эксплуатирующими организациями", rate: 0.15 },
  { id: "rush", name: "Срочность", rate: 0.1 },
];
