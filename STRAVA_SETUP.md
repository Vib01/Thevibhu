# Strava Widget Setup

This site reads public widget data from `assets/data/strava-stats.json`.

Do not commit Strava secrets. Put them in GitHub Actions secrets.

This repository's workflow is attached to the `github-pages` environment, so either add these as `github-pages` environment secrets or change the workflow to use repository-level secrets only:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`
- `STRAVA_ATHLETE_ID`

For this site, `STRAVA_ATHLETE_ID` is the numeric athlete id from your Strava profile/embed URL.

## GitHub Refresh

The workflow at `.github/workflows/update-strava-stats.yml` refreshes the JSON cache every 6 hours and can also be run manually from the GitHub Actions tab.

After adding or changing secrets, run **Actions > Update Strava Stats > Run workflow** manually. The website updates only after that workflow commits a new `assets/data/strava-stats.json`.

## Local Refresh

Create a local `.env` file from `.env.example`, then run:

```bash
npm run update:strava
```

The script refreshes the Strava access token with your refresh token, calls the Strava athlete stats and recent activities endpoints, and rewrites `assets/data/strava-stats.json`.

Strava API docs:

- https://developers.strava.com/docs/getting-started/
- https://developers.strava.com/docs/reference/
