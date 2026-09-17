"use client";

import { useState } from "react";
import type { MaturityPoint } from "../api/maturity-curve/route";
import type { ModelInfo } from "../types";

// Points with a 95% CI wider than this are flagged even when the backend
// still called them "reliable" (ciReliable only covers the non-identifiable
// cases -- this catches ordinary-but-wide uncertainty too).
const CI_WIDTH_THRESHOLD = 0.3;

export default function ModelCard({ modelInfo, points }: { modelInfo: ModelInfo | null; points: MaturityPoint[] }) {
  const [open, setOpen] = useState(true);

  const wideCiPoints = points.filter((p) => p.upper - p.lower > CI_WIDTH_THRESHOLD);
  const unreliablePoints = points.filter((p) => !p.ciReliable);
  const flaggedAges = Array.from(new Set([...wideCiPoints, ...unreliablePoints].map((p) => p.age))).sort(
    (a, b) => a - b
  );

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">Model card &amp; limitations</span>
        <span className="text-xs text-zinc-500">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-4 text-sm">
          <section>
            <h3 className="font-medium text-zinc-700 dark:text-zinc-300">Training data</h3>
            {modelInfo ? (
              <p className="text-zinc-600 dark:text-zinc-400 mt-1">
                {modelInfo.species}, sex: {modelInfo.sex}. {modelInfo.stock_area}. Birth cohorts{" "}
                {modelInfo.cohort_min}–{modelInfo.cohort_max} ({modelInfo.n_cohorts} cohorts,{" "}
                {modelInfo.n_training_records.toLocaleString()} records, train + validation + test combined).
              </p>
            ) : (
              <p className="text-zinc-500 mt-1">Loading…</p>
            )}
          </section>

          <section>
            <h3 className="font-medium text-zinc-700 dark:text-zinc-300">Limitations &amp; extrapolation risk</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">
              The model does not extrapolate outside {modelInfo?.cohort_min}–{modelInfo?.cohort_max} or age{" "}
              {modelInfo?.age_min}–{modelInfo?.age_max} — the API rejects requests outside that window rather
              than guessing. Within the window, the earliest cohorts (roughly 1958–1964, before the survey
              observed those fish at young ages) and a scatter of the most recent cohorts have a
              non-identifiable delta-method confidence interval, because the data needed to pin down that
              specific cohort&apos;s deviation doesn&apos;t exist. Those cells are served with an honest [0%, 100%]
              interval rather than a falsely precise one.
            </p>
          </section>

          <section>
            <h3 className="font-medium text-zinc-700 dark:text-zinc-300">Uncertainty flag (current view)</h3>
            {points.length === 0 ? (
              <p className="text-zinc-500 mt-1">Run a prediction to see uncertainty for the selected range.</p>
            ) : flaggedAges.length === 0 ? (
              <p className="text-emerald-700 dark:text-emerald-400 mt-1">
                All {points.length} displayed points have a 95% CI narrower than{" "}
                {Math.round(CI_WIDTH_THRESHOLD * 100)} percentage points.
              </p>
            ) : (
              <p className="text-red-700 dark:text-red-400 mt-1">
                {flaggedAges.length} of {points.length} displayed points exceed a{" "}
                {Math.round(CI_WIDTH_THRESHOLD * 100)}-point CI width or have a non-identifiable interval —
                ages {flaggedAges.join(", ")}. Treat those predictions as directional, not precise.
              </p>
            )}
          </section>

          <section>
            <h3 className="font-medium text-zinc-700 dark:text-zinc-300">Data provenance</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">
              Fitted model and training data: {modelInfo?.reference ?? "arXiv:2608.31133"} (Zheng, Cheung,
              Sharma, Thorson &amp; Cadigan, 2026). Predictions served from a static grid baked from the
              fitted TMB model (see <code>plaice-api/model/precompute.R</code>) — this app performs lookups
              against that grid, not live re-fitting.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
