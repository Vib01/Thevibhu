import modelMetaJson from "../../data/model-meta.json";
import predictionGridJson from "../../data/prediction-grid.json";
import type { ModelInfo } from "../types";

// The full prediction surface for this model is a finite grid (an integer
// age x an integer birth cohort) baked offline by plaice-api/model/precompute.R
// from the fitted TMB model. Bundling that static grid here means the app
// needs no R runtime, no separate API host, and no live re-fitting at
// request time -- see plaice-api/model/precompute.R and
// plaice-api/README.md for why baking is exact here, not an approximation.
// This file is the Vercel-native equivalent of plaice-api/api.R's /predict
// and /model-info endpoints -- same validation, same response shape.

export interface GridRow {
  cohort: number;
  age: number;
  cohort_seg: number;
  probability: number;
  lower: number;
  upper: number;
  se_logit: number;
  ci_reliable: boolean;
}

export const modelMeta = modelMetaJson as ModelInfo;
const grid = predictionGridJson as GridRow[];

const gridByKey = new Map<string, GridRow>(grid.map((row) => [`${row.cohort}:${row.age}`, row]));

export interface PredictionResult {
  age: number;
  cohort: number;
  cohortSeg: number;
  probability: number;
  ciLower: number;
  ciUpper: number;
  ciWidth: number;
  ciReliable: boolean;
  note: string | null;
}

export type PredictionError = { error: string };

export function predict(age: number, cohort: number): PredictionResult | PredictionError {
  if (!Number.isInteger(age) || !Number.isInteger(cohort)) {
    return { error: "Both 'age' and 'cohort' are required integers." };
  }
  if (age < modelMeta.age_min || age > modelMeta.age_max) {
    return { error: `age ${age} is outside the model's supported range [${modelMeta.age_min}, ${modelMeta.age_max}].` };
  }
  if (cohort < modelMeta.cohort_min || cohort > modelMeta.cohort_max) {
    return {
      error: `cohort ${cohort} is outside the training range [${modelMeta.cohort_min}, ${modelMeta.cohort_max}]; the model does not extrapolate to cohorts outside this window.`,
    };
  }

  const row = gridByKey.get(`${cohort}:${age}`);
  if (!row) {
    return { error: "Internal lookup error: no grid cell for this age/cohort." };
  }

  return {
    age,
    cohort,
    cohortSeg: row.cohort_seg,
    probability: row.probability,
    ciLower: row.lower,
    ciUpper: row.upper,
    ciWidth: row.upper - row.lower,
    ciReliable: row.ci_reliable,
    note: row.ci_reliable
      ? null
      : "Confidence interval is not reliably estimable for this cohort/age cell (sparse or edge-of-range training data) and has been widened to [0, 1] as an honest 'we don't know' signal.",
  };
}
