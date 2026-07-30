const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { console, fishCount: () => 1 };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/leaderboard.js", "utf8"), context);

const layout = {
  equipment: [
    { id: "downrigger-template", name: "Cannon Optimum", type: "downrigger" },
    { id: "holder-template", name: "Cisco Holder", type: "rod-holder" }
  ],
  items: [
    { id: "port-rigger", equipmentId: "downrigger-template", slot: 4 },
    { id: "starboard-rigger", equipmentId: "downrigger-template", slot: 7 },
    { id: "center-holder", equipmentId: "holder-template", slot: 9 }
  ]
};

const people = [
  { id: "alex", name: "Alex" },
  { id: "sam", name: "Sam" },
  { id: "no-trips", name: "New Angler" }
];

const trips = [
  {
    id: "trip-1",
    people: [people[0], people[1]],
    gearUsed: [
      { id: "line-1", boatItemId: "port-rigger" },
      { id: "line-2", boatItemId: "starboard-rigger" }
    ],
    catches: [
      { id: "catch-1", setupLineId: "line-1", personId: "alex" },
      { id: "catch-2", setupLineId: "line-1", personId: "alex" },
      { id: "catch-3", setupLineId: "line-2", personId: "sam" },
      { id: "unattributed", setupLineId: "", personId: "" }
    ],
    lostFish: [
      { id: "lost-1", setupLineId: "line-1", personId: "alex" },
      { id: "lost-2", setupLineId: "line-2", personId: "sam" }
    ]
  },
  {
    id: "trip-2",
    people: [people[1]],
    gearUsed: [{ id: "line-3", boatItemId: "starboard-rigger" }],
    catches: [{ id: "catch-4", setupLineId: "line-3", personId: "sam" }],
    lostFish: []
  }
];

const equipmentRows = vm.runInContext(
  `equipmentLeaderboardRows(${JSON.stringify(trips)}, ${JSON.stringify(layout)})`,
  context
);
const equipmentResult = JSON.parse(JSON.stringify(equipmentRows));

assert.equal(equipmentResult.length, 3);
assert.equal(equipmentResult[0].id, "port-rigger");
assert.equal(equipmentResult[0].landed, 2);
assert.equal(equipmentResult[0].lost, 1);
assert.equal(equipmentResult[0].trips, 1);
assert.equal(Math.round(equipmentResult[0].landingRate), 67);
assert.equal(Math.round(equipmentResult[0].catchShare), 50);
assert.equal(equipmentResult[0].catchesPerTrip, 2);

const portRigger = equipmentResult.find((row) => row.id === "port-rigger");
assert.equal(portRigger.landed, 2);
assert.equal(portRigger.lost, 1);
assert.equal(portRigger.trips, 1);
assert.equal(portRigger.catchesPerTrip, 2);

const unusedHolder = equipmentResult.find((row) => row.id === "center-holder");
assert.equal(unusedHolder.landed, 0);
assert.equal(unusedHolder.landingRate, 0);

const anglerRows = vm.runInContext(
  `anglerLeaderboardRows(${JSON.stringify(trips)}, ${JSON.stringify(people)})`,
  context
);
const anglerResult = JSON.parse(JSON.stringify(anglerRows));

assert.equal(anglerResult.length, 3);
assert.equal(anglerResult[0].id, "alex");
assert.equal(anglerResult[0].landed, 2);
assert.equal(anglerResult[0].lost, 1);
assert.equal(anglerResult[0].trips, 1);
assert.equal(anglerResult[0].catchesPerTrip, 2);
assert.equal(Math.round(anglerResult[0].catchShare), 50);

const sam = anglerResult.find((row) => row.id === "sam");
assert.equal(sam.landed, 2);
assert.equal(sam.lost, 1);
assert.equal(sam.trips, 2);
assert.equal(sam.catchesPerTrip, 1);

context.state = {
  trips,
  settings: { boatLayout: layout },
  lures: [{ id: "photo-lure", name: "Silver Streak" }],
  flashers: [],
  rods: [],
  reels: [],
  rodReelCombos: []
};
context.normalizeBoatLayout = (value) => value;
context.fishCount = () => 1;
context.escapeHtml = (value) => String(value);
context.resolveTripLineRecord = (record) => {
  const line = (record.trip.gearUsed || []).find((item) => item.id === record.setupLineId);
  return line ? { ...record, ...line, setupLine: line } : record;
};

const boatTemplateStats = vm.runInContext(
  `gearPerformanceStats("boat-equipment", "downrigger-template")`,
  context
);
assert.equal(boatTemplateStats.landed, 4);
assert.equal(boatTemplateStats.lost, 2);
assert.equal(boatTemplateStats.trips, 2);
assert.equal(Math.round(boatTemplateStats.landingRate), 67);

const lureTooltip = vm.runInContext(
  `gearStatsTooltipMarkup("lure", "photo-lure")`,
  context
);
assert.match(lureTooltip, /equipment-stats-tooltip-name">Silver Streak</);
assert.match(lureTooltip, /Lure performance/);

const filteredEquipmentRows = vm.runInContext(
  `equipmentLeaderboardRows(${JSON.stringify(trips)}, ${JSON.stringify(layout)}, {
    recordFilter: (record) => record.personId === "alex"
  })`,
  context
);
const filteredResult = JSON.parse(JSON.stringify(filteredEquipmentRows));
assert.equal(filteredResult.find((row) => row.id === "port-rigger").landed, 2);
assert.equal(filteredResult.find((row) => row.id === "starboard-rigger").landed, 0);

console.log("leaderboard tests passed");
