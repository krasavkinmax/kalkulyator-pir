import sbcBook from "../../knowledge-base/sbc-book.json" with { type: "json" };
import type { Stage } from "../engine/types.ts";

export const SBC_INDEX = sbcBook.index.value;

export const SBC_STAGE: Record<Stage, number> = {
  p: sbcBook.stageCoefficients.P,
  r: sbcBook.stageCoefficients.R,
  pr: sbcBook.stageCoefficients.PR,
};

export const SBC_INDEX_LABEL = sbcBook.index.quarter;
