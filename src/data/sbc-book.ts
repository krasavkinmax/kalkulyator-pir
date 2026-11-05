import sbcBook from "../../knowledge-base/sbc-book.json" with { type: "json" };
import type { Stage } from "../engine/types.ts";

export const SBC_INDEX = sbcBook.index.value;

export const SBC_STAGE: Record<Stage, number> = {
  p: sbcBook.stageCoefficients.P,
  r: sbcBook.stageCoefficients.R,
  pr: sbcBook.stageCoefficients.PR,
};

/** Пункты 2.3.4 и 2.4.11 СБЦП 81-2001-07: проектная и рабочая документация по 50%. */
export const SBC_STAGE_SITE: Record<Stage, number> = {
  p: 0.5,
  r: 0.5,
  pr: 1,
};

export const SBC_INDEX_LABEL = sbcBook.index.quarter;
