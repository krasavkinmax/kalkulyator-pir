import type { ObjectKind, SbcLineInput, Stage } from "./types.ts";

export interface WorkDraft {
  ref: string;
  qty: number;
  price: number;
}

export interface BucketDraft {
  k: number;
  lines: SbcLineInput[];
}

/** Один этап объекта: свой калькулятор себестоимости и свой лист СБЦ. */
export interface PhaseDraft {
  id: string;
  name: string;
  kind: ObjectKind | null;
  stage: Stage;
  works: WorkDraft[];
  extras: string[];
  buckets: Record<ObjectKind, BucketDraft>;
}

export function emptyBuckets(): Record<ObjectKind, BucketDraft> {
  return {
    linear: { k: 1, lines: [] },
    site: { k: 1, lines: [] },
  };
}

export function phaseHasCalc(phase: PhaseDraft) {
  const works = phase.works.some((item) => item.ref.trim() && item.qty > 0);
  const lines = phase.buckets.linear.lines.length + phase.buckets.site.lines.length > 0;
  return works || phase.extras.length > 0 || lines;
}
