# Plumber API for the American plaice maturity-at-age model (arXiv:2608.31133).
#
# Serves lookups against a static prediction grid baked by model/precompute.R
# from the fitted TMB neural-network mixed-effects model. See that script's
# header comment for why baking (rather than calling TMB live per-request) is
# both correct and preferable here: the model's inputs are a discrete age and
# a discrete birth cohort, so its whole prediction surface is already a
# finite grid, and baking it means this container needs no C++ toolchain.
#
# Run locally:      Rscript run.R
# Run in container:  see Dockerfile

library(plumber)

grid <- readRDS("model/prediction_grid.rds")
meta <- readRDS("model/model_meta.rds")

#* @apiTitle Plaice Maturity API
#* @apiDescription Maturity-at-age predictions (with confidence intervals) for
#*   female American plaice in NAFO Divisions 3L, 3N, 3O, from the neural
#*   network mixed-effects model in arXiv:2608.31133.

#* Health check
#* @get /health
function() {
  list(status = "ok")
}

#* Model metadata (training data range, limitations) for a model-card UI
#* @get /model-info
function() {
  meta
}

#* Predict probability of maturity at a given age and birth cohort
#* @param age:int Age in years (integer)
#* @param cohort:int Birth year of the cohort
#* @post /predict
function(res, age = NA, cohort = NA) {
  age <- suppressWarnings(as.integer(age))
  cohort <- suppressWarnings(as.integer(cohort))

  if (is.na(age) || is.na(cohort)) {
    res$status <- 400
    return(list(error = "Both 'age' and 'cohort' are required integers."))
  }

  if (age < meta$age_min || age > meta$age_max) {
    res$status <- 422
    return(list(
      error = sprintf("age %d is outside the model's supported range [%d, %d].",
                       age, meta$age_min, meta$age_max)
    ))
  }
  if (cohort < meta$cohort_min || cohort > meta$cohort_max) {
    res$status <- 422
    return(list(
      error = sprintf("cohort %d is outside the training range [%d, %d]; the model does not extrapolate to cohorts outside this window.",
                       cohort, meta$cohort_min, meta$cohort_max)
    ))
  }

  row <- grid[grid$cohort == cohort & grid$age == age, ]
  if (nrow(row) != 1) {
    res$status <- 500
    return(list(error = "Internal lookup error: no unique grid cell for this age/cohort."))
  }

  list(
    age = age,
    cohort = cohort,
    cohort_seg = row$cohort_seg,
    probability = row$probability,
    ci_lower = row$lower,
    ci_upper = row$upper,
    ci_width = row$upper - row$lower,
    ci_reliable = row$ci_reliable,
    note = if (!row$ci_reliable) {
      "Confidence interval is not reliably estimable for this cohort/age cell (sparse or edge-of-range training data) and has been widened to [0, 1] as an honest 'we don't know' signal."
    } else {
      NULL
    }
  )
}
