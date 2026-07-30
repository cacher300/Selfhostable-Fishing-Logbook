const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = { console, fishCount: () => 1 };
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/js/leaderboard.js", "utf8"), context);

const gear = {
  lures: [
    { id: "silver-lure", name: "Silver Streak" },
    { id: "green-lure", name: "Green Machine" }
  ],
  flashers: [{ id: "chrome-flasher", name: "Chrome Spin Doctor" }],
  rods: [{ id: "trolling-rod", brand: "Okuma", name: "Classic Pro" }],
  reels: [{ id: "line-counter", brand: "Daiwa", name: "SealLine" }],
  rodReelCombos: [{
    id: "main-combo",
    shortName: "Main trolling combo",
    rodId: "trolling-rod",
    reelId: "line-counter"
  }]
};

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
      {
        id: "line-1",
        boatItemId: "port-rigger",
        lureId: "silver-lure",
        flasherId: "chrome-flasher",
        rodId: "trolling-rod",
        reelId: "line-counter",
        comboId: "main-combo"
      },
      {
        id: "line-2",
        boatItemId: "starboard-rigger",
        lureId: "green-lure",
        flasherId: "chrome-flasher",
        rodId: "trolling-rod",
        reelId: "line-counter",
        comboId: "main-combo"
      }
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
    gearUsed: [{
      id: "line-3",
      boatItemId: "starboard-rigger",
      lureId: "green-lure",
      flasherId: "chrome-flasher",
      rodId: "trolling-rod",
      reelId: "line-counter",
      comboId: "main-combo"
    }],
    catches: [{ id: "catch-4", setupLineId: "line-3", personId: "sam" }],
    lostFish: []
  }
];

context.resolveTripLineRecord = (record) => {
  const line = (record.trip.gearUsed || []).find((item) => item.id === record.setupLineId);
  return line ? { ...record, ...line, setupLine: line } : record;
};

const gearRows = vm.runInContext(
  `fishingGearLeaderboardRows(${JSON.stringify(trips)}, ${JSON.stringify(gear)})`,
  context
);
const gearResult = JSON.parse(JSON.stringify(gearRows));

assert.equal(gearResult.length, 6);
assert.deepEqual(
  [...new Set(gearResult.map((row) => row.gearType))].sort(),
  ["combo", "flasher", "lure", "reel", "rod"]
);
assert.equal(gearResult.some((row) => row.id === "port-rigger"), false);
assert.equal(gearResult.some((row) => row.name === "Cisco Holder"), false);

const silverLure = gearResult.find((row) => row.id === "silver-lure");
assert.equal(silverLure.landed, 2);
assert.equal(silverLure.lost, 1);
assert.equal(silverLure.trips, 1);
assert.equal(Math.round(silverLure.landingRate), 67);
assert.equal(Math.round(silverLure.catchShare), 50);
assert.equal(silverLure.catchesPerTrip, 2);

const greenLure = gearResult.find((row) => row.id === "green-lure");
assert.equal(greenLure.landed, 2);
assert.equal(greenLure.lost, 1);
assert.equal(greenLure.trips, 2);
assert.equal(Math.round(greenLure.catchShare), 50);

const combo = gearResult.find((row) => row.id === "main-combo");
assert.equal(combo.name, "Main trolling combo");
assert.equal(combo.landed, 4);
assert.equal(combo.lost, 2);
assert.equal(combo.trips, 2);
assert.equal(Math.round(combo.catchShare), 100);

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
  ...gear,
  lures: [...gear.lures, { id: "photo-lure", name: "Photo Spoon" }]
};
context.normalizeBoatLayout = (value) => value;
context.fishCount = () => 1;
context.escapeHtml = (value) => String(value);

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
assert.match(lureTooltip, /equipment-stats-tooltip-name">Photo Spoon</);
assert.match(lureTooltip, /Lure performance/);

const filteredGearRows = vm.runInContext(
  `fishingGearLeaderboardRows(${JSON.stringify(trips)}, ${JSON.stringify(gear)}, {
    recordFilter: (record) => record.personId === "alex"
  })`,
  context
);
const filteredResult = JSON.parse(JSON.stringify(filteredGearRows));
assert.equal(filteredResult.find((row) => row.id === "silver-lure").landed, 2);
assert.equal(filteredResult.find((row) => row.id === "green-lure").landed, 0);

const indexMarkup = fs.readFileSync("index.html", "utf8");
assert.doesNotMatch(indexMarkup, /Boat leaderboard|Deck performance|statsEquipmentLeaderboard/);
assert.match(indexMarkup, /Fishing leaderboard/);
assert.match(indexMarkup, /Fishing gear/);

console.log("leaderboard tests passed");
