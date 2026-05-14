const fs = require("node:fs/promises");
const path = require("node:path");

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const outputPath = path.join(process.cwd(), "assets", "data", "strava-stats.json");

const requiredEnv = [
  "STRAVA_CLIENT_ID",
  "STRAVA_CLIENT_SECRET",
  "STRAVA_REFRESH_TOKEN",
  "STRAVA_ATHLETE_ID",
];

async function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env");
  let file;

  try {
    file = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  file.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function metersToKm(meters) {
  const value = Number(meters);
  return Number.isFinite(value) ? Math.round((value / 1000) * 10) / 10 : 0;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function refreshAccessToken() {
  const body = new URLSearchParams({
    client_id: requireEnv("STRAVA_CLIENT_ID"),
    client_secret: requireEnv("STRAVA_CLIENT_SECRET"),
    refresh_token: requireEnv("STRAVA_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });

  const token = await fetchJson(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!token.access_token) throw new Error("Strava did not return an access token.");
  return token.access_token;
}

async function getStats(accessToken, athleteId) {
  return fetchJson(`${STRAVA_API}/athletes/${athleteId}/stats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function getRecentActivities(accessToken) {
  return fetchJson(`${STRAVA_API}/athlete/activities?per_page=8&page=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function buildWidgetData(stats, activities) {
  const runAll = metersToKm(stats.all_run_totals?.distance);
  const rideAll = metersToKm(stats.all_ride_totals?.distance);
  const runYtd = metersToKm(stats.ytd_run_totals?.distance);
  const rideYtd = metersToKm(stats.ytd_ride_totals?.distance);

  return {
    updatedAt: new Date().toISOString(),
    totalMileageKm: Math.round((runAll + rideAll) * 10) / 10,
    totalRunKm: runAll,
    totalRideKm: rideAll,
    yearDistanceKm: Math.round((runYtd + rideYtd) * 10) / 10,
    recentActivities: activities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      type: activity.sport_type || activity.type,
      distanceKm: metersToKm(activity.distance),
      movingTimeSeconds: activity.moving_time,
      elevationGainM: Math.round(Number(activity.total_elevation_gain || 0)),
      startDate: activity.start_date_local || activity.start_date,
      url: `https://www.strava.com/activities/${activity.id}`,
    })),
  };
}

async function main() {
  await loadLocalEnv();
  requiredEnv.forEach(requireEnv);

  const accessToken = await refreshAccessToken();
  const athleteId = requireEnv("STRAVA_ATHLETE_ID");
  const [stats, activities] = await Promise.all([
    getStats(accessToken, athleteId),
    getRecentActivities(accessToken),
  ]);

  const widgetData = buildWidgetData(stats, activities);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(widgetData, null, 2)}\n`);
  console.log(`Updated ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
