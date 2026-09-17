# Plaice Maturity API

The offline R/TMB fitting + precompute pipeline for the plaice maturity model
in [arXiv:2608.31133](https://arxiv.org/abs/2608.31133) (female American
plaice, NAFO Divisions 3L, 3N, 3O), plus a standalone Plumber API reference
implementation.

**This is not what's deployed.** The live app (`plaice-ui/`) is deployed
Vercel-only — its API routes read `plaice-ui/data/prediction-grid.json`
(exported from this pipeline's output) directly, with no R runtime involved
at request time. `api.R` below is kept as a working standalone alternative
(e.g. if you want to run the prediction API outside of Next.js), and this
directory is the source of truth for the model itself.

## How it works

`model/precompute.R` loads the fitted model's parameters (from the original
research workspace), recompiles a copy of the TMB model with the pre-sigmoid
neural-net output exposed via `ADREPORT`, and runs `sdreport()` to get a
delta-method standard error on the logit scale for every (cohort, age) cell.
It bakes the result to `model/prediction_grid.rds` — a flat lookup table with
point estimate, 95% CI, and a reliability flag per cell.

`api.R` just loads that table at startup and looks up rows. No TMB, no C++
compiler, and no raw survey data are needed at request time or in the Docker
image — the model's inputs (an integer age, an integer birth year) make its
whole prediction surface a finite grid, so baking it once is exact, not an
approximation.

To regenerate the grid after refitting the model, re-run (on a machine with
R + TMB + a C/C++ toolchain):

```
cd model
Rscript precompute.R
```

## Known limitation: unreliable CIs at the edges of the training window

162 of 1450 (cohort, age) cells have a non-identifiable delta-method
variance — mostly the earliest cohorts (1958–1964), which the survey never
observed at young ages, plus a scatter of the most recent cohorts, which
haven't been followed long enough to reach older ages. These cells are
served with `ci_reliable: false` and a CI widened to `[0, 1]` rather than a
misleadingly narrow (or NaN) interval. This is a genuine feature of the
fitted model, not an API bug, and doubles as the "extrapolation risk"
signal for the model-card/responsible-AI panel.

## Run locally

```
Rscript run.R
```

Then:

```
curl -X POST "http://localhost:8000/predict?age=8&cohort=1990"
curl http://localhost:8000/model-info
```

## Docker

```
docker build -t plaice-api .
docker run -p 8000:8000 plaice-api
```

(Not yet verified on this machine — Docker isn't installed here. Build and
test the image before deploying.)
