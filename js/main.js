const topbar = document.getElementById("topbar");
const progress = document.getElementById("progress");
const dots = Array.from(document.querySelectorAll(".rail-dot"));
const sections = Array.from(document.querySelectorAll(".section"));
const railNumber = document.getElementById("railNumber");
const reveals = Array.from(document.querySelectorAll(".reveal"));
const parallaxTargets = Array.from(document.querySelectorAll(".hero-bg, .media-cover"));
const trackedIds = new Set(dots.map((dot) => dot.dataset.target));
const loader = document.getElementById("loader");
const videos = Array.from(document.querySelectorAll("video.media-video"));
const stravaStats = {
  totalMileage: document.querySelector('[data-strava-stat="totalMileage"]'),
  yearDistance: document.querySelector('[data-strava-stat="yearDistance"]'),
  latestDistance: document.querySelector('[data-strava-stat="latestDistance"]'),
};
const stravaStatus = document.querySelector("[data-strava-status]");
const stravaActivities = document.querySelector("[data-strava-activities]");
const stravaEndpoint = window.STRAVA_STATS_ENDPOINT || "assets/data/strava-stats.json";

window.addEventListener("load", () => {
  const minLoaderMs = 1300;
  setTimeout(() => {
    if (loader) loader.classList.add("hidden");
    document.body.classList.remove("is-loading");
    document.body.classList.add("ready");
  }, minLoaderMs);
});

window.addEventListener("scroll", () => {
  const y = window.scrollY;
  topbar.classList.toggle("scrolled", y > 30);

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const pct = maxScroll > 0 ? (y / maxScroll) * 100 : 0;
  progress.style.width = `${pct}%`;
});

dots.forEach((dot) => {
  dot.addEventListener("click", () => {
    const target = document.getElementById(dot.dataset.target);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      if (!trackedIds.has(id)) return;
      const idx = dots.findIndex((d) => d.dataset.target === id);
      if (idx >= 0) {
        dots.forEach((d, i) => d.classList.toggle("active", i === idx));
        railNumber.textContent = String(idx + 1).padStart(2, "0");
      }
    });
  },
  { threshold: 0.45 }
);

sections.forEach((section) => sectionObserver.observe(section));

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.15 }
);

reveals.forEach((item) => revealObserver.observe(item));

function animateParallax() {
  const y = window.scrollY;
  parallaxTargets.forEach((target) => {
    const speed = target.classList.contains("hero-bg") ? 0.14 : 0.09;
    target.style.transform = `translate3d(0, ${y * speed}px, 0) scale(1.06)`;
  });
  requestAnimationFrame(animateParallax);
}

requestAnimationFrame(animateParallax);

videos.forEach((video) => {
  video.addEventListener("error", () => {
    const poster = video.getAttribute("poster");
    if (!poster) return;
    const img = document.createElement("img");
    img.className = "media-asset";
    img.alt = "Video placeholder";
    img.src = poster;
    video.replaceWith(img);
  });
});

function formatDistance(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance)) return "-- km";
  return `${distance.toFixed(distance >= 10 ? 0 : 1)} km`;
}

function formatActivityDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderStravaActivities(activities = []) {
  if (!stravaActivities) return;

  stravaActivities.innerHTML = "";
  activities.slice(0, 4).forEach((activity) => {
    const item = document.createElement("a");
    item.href = activity.url || "#";
    item.target = "_blank";
    item.rel = "noopener";
    item.className = "strava-activity";

    const title = document.createElement("span");
    title.textContent = activity.name || "Strava activity";

    const meta = document.createElement("small");
    const details = [
      activity.type,
      formatDistance(activity.distanceKm),
      formatActivityDate(activity.startDate),
    ].filter(Boolean);
    meta.textContent = details.join(" • ");

    item.append(title, meta);
    stravaActivities.append(item);
  });
}

function updateStravaStats(stats) {
  if (stravaStats.totalMileage && stats.totalMileageKm !== undefined) {
    stravaStats.totalMileage.textContent = formatDistance(stats.totalMileageKm);
  }

  if (stravaStats.yearDistance && stats.yearDistanceKm !== undefined) {
    stravaStats.yearDistance.textContent = formatDistance(stats.yearDistanceKm);
  }

  const latestActivity = stats.recentActivities && stats.recentActivities[0];
  if (stravaStats.latestDistance && latestActivity) {
    stravaStats.latestDistance.textContent = formatDistance(latestActivity.distanceKm);
  }

  renderStravaActivities(stats.recentActivities);

  if (stravaStatus) {
    const updatedAt = stats.updatedAt ? new Date(stats.updatedAt) : null;
    stravaStatus.textContent =
      updatedAt && !Number.isNaN(updatedAt.getTime())
        ? `Updated ${updatedAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} from Strava.`
        : "Training stats loaded from Strava.";
  }
}

async function loadStravaStats() {
  if (!Object.values(stravaStats).some(Boolean)) return;

  try {
    const response = await fetch(`${stravaEndpoint}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Strava stats unavailable: ${response.status}`);
    const stats = await response.json();
    updateStravaStats(stats);
  } catch (error) {
    if (stravaStatus) {
      stravaStatus.textContent = window.location.protocol === "file:"
        ? "Open this page through http://localhost:8000 to load live stats."
        : "Live Strava stats are temporarily unavailable.";
    }
  }
}

loadStravaStats();
setInterval(loadStravaStats, 5 * 60 * 1000);
