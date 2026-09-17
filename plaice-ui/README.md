# Plaice Maturity Explorer (plaice-ui)

Next.js frontend + API routes for the plaice maturity model ([arXiv:2608.31133](https://arxiv.org/abs/2608.31133)): chart with confidence intervals, an Azure AI Foundry-backed chat panel with retrieval over the paper's own walkthrough, and a Model Card panel.

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

## Chat panel: numeric grounding + RAG over the paper

The chat panel (`app/api/chat/route.ts`) combines two independent, additive
grounding sources — neither replaces the other:

1. **Numeric grounding** (unchanged from before): the currently plotted
   chart data (cohort/age/probability/CI), passed as JSON on every request.
   All numeric claims must come from here; this is what drives the
   uncertainty-citation rules in `app/api/chat/systemPrompt.ts`.
2. **Conceptual grounding via RAG**: `../NN_TMB.html` (the interactive
   walkthrough of this exact paper, arXiv:2608.31133) is chunked by section
   (`data/paper-chunks.json`, extracted verbatim from the page's DOM) and
   embedded offline with Azure AI Foundry's `text-embedding-3-small`
   (`data/paper-rag-index.json`, via `scripts/build-rag-index.mjs`). At
   request time, only the user's question is embedded (one small live call);
   `app/lib/paperRag.ts` does cosine-similarity retrieval over the baked
   index (top 3 chunks) and injects them into context. Used for
   "explain this in simple words" / "why does the model do X" questions, not
   for citing predictions. Same "bake once, look up live" pattern as
   `predictionGrid.ts`.

Re-run `node --env-file=.env.local scripts/build-rag-index.mjs` after editing
`data/paper-chunks.json` (e.g. if `NN_TMB.html`'s walkthrough content
changes).

## Environment variables

See `.env.local.example`. Only Azure AI Foundry config is needed — the
prediction API has no external dependency. `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`
defaults to `text-embedding-3-small`.

## Deploy

```bash
vercel
```

No other services required.
