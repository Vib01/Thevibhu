# Plaice Maturity Explorer (plaice-ui)

Next.js frontend + API routes for the plaice maturity model ([arXiv:2608.31133](https://arxiv.org/abs/2608.31133)): chart with confidence intervals, an Azure AI Foundry-backed chat panel, and a Model Card panel.

Live: https://plaice-ui.vercel.app

## Architecture

Deployed as a single Vercel app — no separate R/Plumber host needed. The
underlying model's prediction surface is a finite (age x cohort) grid, baked
offline by `plaice-api/model/precompute.R` from the fitted TMB model. That
grid is exported to `data/prediction-grid.json` + `data/model-meta.json` and
bundled directly into this app; `app/lib/predictionGrid.ts` does the same
lookup/validation that `plaice-api/api.R` does, just in TypeScript.

`plaice-api/` still exists and still works standalone (Plumber + Docker) —
it's the offline R/TMB fitting and precompute pipeline, and a reference
implementation of the same API. It's just not what's deployed here.

## Regenerating the bundled data (after refitting the model)

1. Re-run `plaice-api/model/precompute.R` to refresh `prediction_grid.csv` / `model_meta.rds`.
2. Regenerate the JSON copies this app reads:

```bash
# model_meta.rds -> data/model-meta.json (needs R + jsonlite)
Rscript -e 'cat(jsonlite::toJSON(readRDS("../plaice-api/model/model_meta.rds"), auto_unbox=TRUE, pretty=TRUE))' > data/model-meta.json

# prediction_grid.csv -> data/prediction-grid.json (needs Node)
node -e '
const fs = require("fs");
const lines = fs.readFileSync("../plaice-api/model/prediction_grid.csv","utf8").replace(/\r/g,"").trim().split("\n");
const header = lines[0].split(",").map(h => h.replace(/"/g,""));
const rows = lines.slice(1).map(line => {
  const vals = line.split(",");
  const obj = {};
  header.forEach((h,i) => {
    const v = vals[i];
    obj[h] = v === "TRUE" ? true : v === "FALSE" ? false : Number(v);
  });
  return obj;
});
fs.writeFileSync("data/prediction-grid.json", JSON.stringify(rows));
'
```

## Environment variables

See `.env.local.example`. Only Azure AI Foundry config is needed — the
prediction API has no external dependency.

## Deploy

```bash
vercel
```

No other services required.
