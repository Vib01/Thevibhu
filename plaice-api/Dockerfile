FROM rocker/r-ver:4.5.1

WORKDIR /app

RUN R -e "install.packages('plumber', repos='https://cloud.r-project.org')"

# Only the baked prediction grid and metadata are needed at runtime -- no
# TMB, no C++ toolchain, no raw survey data ship in the image. See
# model/precompute.R for how the grid is produced.
COPY api.R run.R ./
COPY model/prediction_grid.rds model/model_meta.rds ./model/

EXPOSE 8000
ENV PORT=8000

CMD ["Rscript", "run.R"]
