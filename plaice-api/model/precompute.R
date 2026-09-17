# Bakes a static (cohort x age) prediction grid with delta-method confidence
# intervals from the fitted plaice maturity TMB model, so the Plumber API
# (api.R) never needs TMB, Rtools, or a C++ compiler at request time or in
# the deployed Docker image -- it just loads a small data frame and looks up
# a row.
#
# This is not an approximation shortcut: the underlying model only takes a
# discrete age (0..age_max-1) and a discrete cohort segment as inputs (one
# fitted a female American plaice maturity-at-age model to NAFO Div. 3LNO
# survey data), so its entire prediction surface is already a finite grid.
# Baking it once and shipping the table is mathematically identical to
# calling the fitted model live for every (age, cohort) combination.
#
# Run this once, from this directory, on a machine with TMB + a working
# C/C++ toolchain (Rtools on Windows). Output: prediction_grid.rds and
# prediction_grid.csv, both used by ../api.R.

library(TMB)

# Run this script from within plaice-api/model/ (working directory matters:
# TMB::compile() and dyn.load() both resolve relative to it).

source_rdata <- "C:/TMB_research/minimize_validation_20/.RData"
stopifnot(file.exists(source_rdata))

# Load the researcher's full fitted workspace into its own environment so we
# only pull out what we need (par_save, birth_years, cohort structure) and
# don't clobber anything in this script's environment.
fit_env <- new.env()
load(source_rdata, envir = fit_env)

required <- c("par_save", "birth_years", "cohort_seg", "cohort_seg_num",
              "birth_length", "maturity_matrix", "age_matrix", "map", "rnames")
missing <- setdiff(required, ls(fit_env))
if (length(missing) > 0) stop("Missing from source .RData: ", paste(missing, collapse = ", "))

compile("nn_maturity_predict.cpp", flags = "-Wno-ignored-attributes -O2 -mfpmath=sse -msse2 -mstackrealign")
dyn.load(dynlib("nn_maturity_predict"))

tmb.data.pred <- list(
  yt = fit_env$maturity_matrix,
  st = fit_env$age_matrix,
  birth_length = fit_env$birth_length,
  age_max = max(fit_env$age_matrix, na.rm = TRUE) + 1,
  cohort_seg = fit_env$cohort_seg,
  cohort_seg_num = fit_env$cohort_seg_num
)

obj_pred <- MakeADFun(
  tmb.data.pred, fit_env$par_save,
  DLL = "nn_maturity_predict",
  random = fit_env$rnames,
  map = fit_env$map,
  inner.control = list(maxit = 50000, trace = FALSE)
)
obj_pred$env$tracemgc <- FALSE

cat("Evaluating fitted model at existing parameter estimates...\n")
obj_pred$fn()

cat("Running sdreport() for delta-method SEs on the logit scale (this can take a minute)...\n")
sdr <- sdreport(obj_pred, getReportCovariance = FALSE)

rep_pred <- obj_pred$report()
p_m <- rep_pred$p_m                     # n_cohort x age_max, point estimate probabilities
logit_hat <- rep_pred$logit_p_m         # same shape, logit scale

ssum <- summary(sdr, "report")
logit_se_vec <- ssum[rownames(ssum) == "logit_p_m", "Std. Error"]
stopifnot(length(logit_se_vec) == length(logit_hat))
# TMB fills ADREPORT matrices column-major, matching R's default matrix() fill order.
logit_se <- matrix(logit_se_vec, nrow = nrow(logit_hat), ncol = ncol(logit_hat))

z <- qnorm(0.975)
logit_lower <- logit_hat - z * logit_se
logit_upper <- logit_hat + z * logit_se

n_cohort <- nrow(p_m)
age_max <- ncol(p_m)
birth_years <- fit_env$birth_years
stopifnot(length(birth_years) == n_cohort)

se_vec <- as.vector(logit_se)
lower_vec <- as.vector(plogis(logit_lower))
upper_vec <- as.vector(plogis(logit_upper))

# A handful of cells (the earliest birth cohorts, which the survey never
# observed at young ages) have a non-identifiable or NaN delta-method
# variance -- the Hessian of the joint likelihood is near-singular there.
# Rather than emit NA/crash the API, flag them explicitly as unreliable and
# fall back to the widest possible (uninformative) interval, which is the
# honest statement of "we don't know" for these cells.
unreliable <- is.na(se_vec) | se_vec > 8
lower_vec[unreliable] <- 0
upper_vec[unreliable] <- 1

grid <- data.frame(
  cohort = rep(birth_years, times = age_max),
  age = rep(0:(age_max - 1), each = n_cohort),
  cohort_seg = rep(fit_env$cohort_seg, times = age_max),
  probability = as.vector(p_m),
  lower = lower_vec,
  upper = upper_vec,
  se_logit = se_vec,
  ci_reliable = !unreliable
)
grid <- grid[order(grid$cohort, grid$age), ]
rownames(grid) <- NULL

cat("\nFlagged", sum(unreliable), "of", nrow(grid),
    "cells as ci_reliable = FALSE (cohorts:",
    paste(sort(unique(grid$cohort[unreliable])), collapse = ", "), ")\n")

cat("\nGrid dimensions:", nrow(grid), "rows (", n_cohort, "cohorts x", age_max, "ages )\n")
cat("Cohort range:", min(grid$cohort), "-", max(grid$cohort), "\n")
print(head(grid, 10))

saveRDS(grid, "prediction_grid.rds")
write.csv(grid, "prediction_grid.csv", row.names = FALSE)

meta <- list(
  cohort_min = min(birth_years),
  cohort_max = max(birth_years),
  age_min = 0L,
  age_max = age_max - 1L,
  n_training_records = sum(fit_env$birth_length),
  n_cohorts = n_cohort,
  sex = "female",
  species = "American plaice (Hippoglossoides platessoides)",
  stock_area = "NAFO Divisions 3L, 3N, 3O",
  reference = "arXiv:2608.31133"
)
saveRDS(meta, "model_meta.rds")

cat("\nWrote prediction_grid.rds, prediction_grid.csv, model_meta.rds\n")
