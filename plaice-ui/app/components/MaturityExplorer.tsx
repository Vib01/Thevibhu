"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MaturityPoint } from "../api/maturity-curve/route";
import type { ModelInfo } from "../types";
import ChatPanel from "./ChatPanel";
import ModelCard from "./ModelCard";

function unwrap<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

type ChartPoint = MaturityPoint & { range: [number, number] };

export default function MaturityExplorer() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [cohort, setCohort] = useState(1990);
  const [ageMin, setAgeMin] = useState(0);
  const [ageMax, setAgeMax] = useState(15);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/model-info")
      .then((r) => r.json())
      .then((raw) => {
        const info: ModelInfo = {
          cohort_min: unwrap(raw.cohort_min),
          cohort_max: unwrap(raw.cohort_max),
          age_min: unwrap(raw.age_min),
          age_max: unwrap(raw.age_max),
          n_training_records: unwrap(raw.n_training_records),
          n_cohorts: unwrap(raw.n_cohorts),
          sex: unwrap(raw.sex),
          species: unwrap(raw.species),
          stock_area: unwrap(raw.stock_area),
          reference: unwrap(raw.reference),
        };
        setModelInfo(info);
        setCohort((c) => Math.min(Math.max(c, info.cohort_min), info.cohort_max));
        setAgeMax((a) => Math.min(a, info.age_max));
      })
      .catch(() => setError("Could not reach the plaice-api backend. Is it running?"));
  }, []);

  async function runQuery() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maturity-curve?cohort=${cohort}&ageMin=${ageMin}&ageMax=${ageMax}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const chartPoints: ChartPoint[] = data.points.map((p: MaturityPoint) => ({
        ...p,
        range: [p.lower, p.upper] as [number, number],
      }));
      setPoints(chartPoints);
      if (data.errors?.length) {
        setError(`${data.errors.length} age(s) could not be predicted: ${data.errors.map((e: { age: number }) => e.age).join(", ")}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (modelInfo) runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelInfo]);

  const hasUnreliable = points.some((p) => !p.ciReliable);

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-12 flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plaice Maturity-at-Age Explorer</h1>
        <p className="text-zinc-600 dark:text-zinc-400 mt-1">
          Female American plaice, NAFO Divisions 3L, 3N, 3O — from the neural network
          mixed-effects model in{" "}
          {modelInfo ? (
            <a href="https://arxiv.org/abs/2608.31133" className="underline">
              {modelInfo.reference}
            </a>
          ) : (
            "arXiv:2608.31133"
          )}
          .
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runQuery();
        }}
        className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
      >
        <label className="flex flex-col text-sm gap-1">
          Cohort (birth year)
          <input
            type="number"
            value={cohort}
            min={modelInfo?.cohort_min}
            max={modelInfo?.cohort_max}
            onChange={(e) => setCohort(Number(e.target.value))}
            className="w-32 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          />
        </label>
        <label className="flex flex-col text-sm gap-1">
          Age min
          <input
            type="number"
            value={ageMin}
            min={modelInfo?.age_min}
            max={ageMax}
            onChange={(e) => setAgeMin(Number(e.target.value))}
            className="w-24 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          />
        </label>
        <label className="flex flex-col text-sm gap-1">
          Age max
          <input
            type="number"
            value={ageMax}
            min={ageMin}
            max={modelInfo?.age_max}
            onChange={(e) => setAgeMax(Number(e.target.value))}
            className="w-24 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Loading..." : "Predict"}
        </button>
        {modelInfo && (
          <p className="text-xs text-zinc-500 basis-full">
            Valid ranges: cohort {modelInfo.cohort_min}–{modelInfo.cohort_max}, age{" "}
            {modelInfo.age_min}–{modelInfo.age_max}. Fit on {modelInfo.n_training_records.toLocaleString()}{" "}
            records across {modelInfo.n_cohorts} cohorts.
          </p>
        )}
      </form>

      {error && (
        <p className="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-4 py-2 text-sm">
          {error}
        </p>
      )}

      {hasUnreliable && (
        <p className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-4 py-2 text-sm">
          Some ages in this cohort fall where the model&apos;s confidence interval isn&apos;t reliably
          estimable (sparse or edge-of-training-window data). Those points are widened to [0, 1] and
          marked on the chart rather than shown with false precision.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 items-start">
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="age" label={{ value: "Age (years)", position: "insideBottom", offset: -4 }} />
              <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={48} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "range" && Array.isArray(value)) {
                    const [lo, hi] = value as [number, number];
                    return [`${(lo * 100).toFixed(1)}% – ${(hi * 100).toFixed(1)}%`, "95% CI"];
                  }
                  return [`${(Number(value) * 100).toFixed(1)}%`, "P(mature)"];
                }}
                labelFormatter={(age) => `Age ${age}`}
              />
              <Area type="monotone" dataKey="range" stroke="none" fill="#6366f1" fillOpacity={0.15} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="probability"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
                  const { cx, cy, payload } = props;
                  if (cx === undefined || cy === undefined || !payload) return <g key={`dot-${payload?.age}`} />;
                  return (
                    <circle
                      key={`dot-${payload.age}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={payload.ciReliable ? "#4f46e5" : "#dc2626"}
                    />
                  );
                }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="h-96">
          <ChatPanel cohort={cohort} points={points} />
        </div>
      </div>

      <ModelCard modelInfo={modelInfo} points={points} />
    </div>
  );
}
