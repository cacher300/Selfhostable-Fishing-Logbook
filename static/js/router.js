const routeViews = {
  "/": "trips",
  "/trips": "trips",
  "/expeditions": "expeditions",
  "/bests": "bests",
  "/stats": "stats",
  "/experiments": "experiments",
  "/leaderboard": "leaderboard",
  "/map": "map",
  "/gear": "gear",
  "/gallery": "gallery",
  "/checklists": "checklists",
  "/wiki": "wiki",
  "/settings": "settings"
};

const viewRoutes = Object.fromEntries(
  Object.entries(routeViews).map(([path, view]) => [view, path])
);
viewRoutes.trips = "/trips";

let renderView = () => {};
let initialized = false;
let statsSearch = "";

export function replaceStatsSearch(query) {
  if (viewFromCurrentRoute() !== "stats") return;
  statsSearch = query ? `?${query}` : "";
  const url = `/stats${statsSearch}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", url);
}

function viewFromPath(pathname = window.location.pathname) {
  const path = String(pathname || "/").replace(/\/$/, "") || "/";
  return routeViews[path.toLowerCase()] || "trips";
}

function viewFromCurrentRoute() {
  return viewFromPath(window.location.pathname);
}

function routeForView(view) {
  return viewRoutes[view] || "/trips";
}

function canUseHistoryRoutes() {
  return window.location.protocol !== "file:";
}

export function replaceInitialRoute() {
  const view = viewFromCurrentRoute();
  if (view === "stats") statsSearch = window.location.search;
  if (canUseHistoryRoutes()) {
    window.history.replaceState({ view }, "", `${window.location.pathname}${window.location.search}${window.location.hash}`);
  } else {
    window.history.replaceState({ view }, "", window.location.href);
  }
  return view;
}

export function navigate(view, { replace = false } = {}) {
  const nextView = routeViews[routeForView(view)] ? view : "trips";
  if (!canUseHistoryRoutes()) {
    renderView(nextView);
    return;
  }
  const nextPath = routeForView(nextView);
  const currentView = viewFromCurrentRoute();
  const sameView = currentView === nextView;
  if (sameView && window.location.pathname === nextPath) {
    renderView(nextView);
    return;
  }
  const url = sameView
    ? `${nextPath}${window.location.search}${window.location.hash}`
    : nextView === "stats" ? `${nextPath}${statsSearch}` : nextPath;
  const state = { view: nextView };
  if (replace) window.history.replaceState(state, "", url);
  else window.history.pushState(state, "", url);
  renderView(nextView);
}

export function initRouter(onRenderView) {
  renderView = onRenderView;
  if (initialized) return;
  initialized = true;
  window.addEventListener("popstate", () => {
    const view = viewFromCurrentRoute();
    if (view === "stats") statsSearch = window.location.search;
    renderView(view);
  });
}
