const { expect } = require("@playwright/test");

async function readLogbookWithRevision(page) {
  const response = await page.request.get("/api/logbook");
  await expect(response, "GET /api/logbook").toBeOK();
  return {
    document: await response.json(),
    etag: response.headers()["etag"] || ""
  };
}

async function readLogbook(page) {
  return (await readLogbookWithRevision(page)).document;
}

async function resetLogbook(page, document) {
  const { etag } = await readLogbookWithRevision(page);
  const csrfResponse = await page.request.get("/api/csrf-token");
  await expect(csrfResponse, "GET /api/csrf-token").toBeOK();
  const csrf = await csrfResponse.json();
  const response = await page.request.put("/api/logbook", {
    headers: {
      "Content-Type": "application/json",
      "If-Match": etag,
      "X-CSRF-Token": csrf.csrfToken || csrf.csrf_token || csrf.token || ""
    },
    data: document
  });
  await expect(response, "PUT /api/logbook").toBeOK();
}

async function freshLogbook(page, overrides = {}) {
  const base = structuredClone(await readLogbook(page));
  return {
    ...base,
    lures: [],
    flashers: [],
    reels: [],
    rods: [],
    rodReelCombos: [],
    people: [],
    locations: [],
    spots: [],
    expeditions: [],
    trips: [],
    settings: {
      ...base.settings,
      theme: "light",
      defaultPeople: [],
      checklists: [],
      trollingSpreads: [],
      defaultTrollingSpreadId: "",
      units: { ...base.settings.units, depth: "ft" }
    },
    ...overrides
  };
}

async function stubExternalApis(page) {
  await page.route("**/api/weather/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, message: "Weather unavailable in e2e" })
  }));
  await page.route("**/api/astronomy**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, message: "Astronomy unavailable in e2e" })
  }));
  await page.route("**/api/marine**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, message: "Marine unavailable in e2e" })
  }));
  await page.route("**/api/v1/**", (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.includes("/images/")) {
      return route.fulfill({ contentType: "image/svg+xml", body: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>" });
    }
    let payload = { available: false, values: [], rasters: [], fields: [], data: [], arrows: [], metadata: { models: [] } };
    if (pathname.endsWith("/manifest")) payload = { version: "e2e", generatedAt: "2026-10-01T00:00:00Z", layers: [] };
    else if (pathname.endsWith("/stations") || pathname.includes("/history/stations")) payload = { stations: [] };
    else if (pathname.includes("/model-points")) payload = { points: [], count: 0, limit: 6000, tooMany: false };
    else if (pathname.endsWith("/history")) payload = { hours: [] };
    else if (pathname.includes("/animation/")) payload = { ready: true, frames: [] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

function seededLocation() {
  return {
    id: "loc-lake-erie",
    name: "Lake Erie",
    coordinates: { latitude: 41.651, longitude: -82.822 },
    launches: [
      {
        id: "launch-port-clinton",
        name: "Port Clinton Launch",
        coordinates: { latitude: 41.512, longitude: -82.938 }
      }
    ]
  };
}

async function fillDate(page, selector, displayValue) {
  await page.locator(selector).fill(displayValue);
  await page.locator(selector).blur();
}

function failOnHtmlEscapedMarkup(page) {
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("html: markup-like string was escaped")) {
      throw new Error(message.text());
    }
  });
}

module.exports = {
  failOnHtmlEscapedMarkup,
  freshLogbook,
  readLogbook,
  resetLogbook,
  seededLocation,
  stubExternalApis,
  fillDate
};
