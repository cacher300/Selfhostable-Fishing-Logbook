const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { normalizeLogbook, tripDurationHours } = require('../src/domain/logbook.ts');
const { tripHours } = require('../src/domain/services/duration.ts');
const { assignCatchSpot } = require('../src/domain/services/spots.ts');

test('fishing duration subtracts idle hours once, including overnight and fully idle trips', () => {
  const trip = { linesSetTime: '23:00', linesPulledTime: '02:00', idleHours: '0.5', hours: 2.5 };
  assert.equal(tripHours(trip), 2.5);
  assert.equal(tripDurationHours(trip), 2.5);
  assert.equal(normalizeLogbook({ trips: [{ ...trip, id: 'timed', date: '2026-09-01', title: 'Timed' }] }).trips[0].hours, 2.5);
  assert.equal(tripHours({ ...trip, idleHours: 5 }), 0);
  assert.equal(tripHours({ hours: 2.5, idleHours: 0.5 }), 2.5);
  assert.equal(tripHours({ launchTime: '08:00', linesPulledTime: '10:00', idleHours: 1 }), 1);
});

test('spot matching selects nearest in-range spot and respects manual none', () => {
  const spots = [{ id: 'b', name: 'B', coordinates: { latitude: 44, longitude: -79 }, radiusMeters: 100 }, { id: 'a', name: 'A', coordinates: { latitude: 44, longitude: -79 }, radiusMeters: 100 }];
  const fish = { id: 'fish', coordinates: { latitude: 44, longitude: -79 } };
  assert.equal(assignCatchSpot(fish, spots).spotId, 'a');
  assert.equal(assignCatchSpot({ ...fish, spotAssignmentMode: 'manual', spotId: '' }, spots).spotId, '');
  assert.equal(assignCatchSpot({ ...fish, spotAssignmentMode: 'manual', spotId: 'b' }, spots).spotId, 'b');
  assert.equal(assignCatchSpot({ ...fish, manualCoordinates: { latitude: 45, longitude: -79 } }, spots).spotId, '');
  assert.equal(assignCatchSpot({ id: 'no-gps' }, spots).spotId, '');
});

test('new desktop fields survive normalization and JSON round trip', () => {
  const input = { riggings: ['Custom rig'], structureOptions: ['Custom structure'], expeditions: [{ id: 'exp', name: 'Vacation', startDate: '2026-09-01', endDate: '2026-09-04' }], lures: [{ id: 'lure', name: 'Lure', model: 'Model', divingDepth: 0, glow: false, quantityAvailable: 0 }], trips: [{ id: 'trip', title: 'Trip', date: '2026-09-01', expeditionId: 'exp', idleHours: 0.5, structureType: 'Custom structure', gearUsed: [{ id: 'line', rigging: 'Custom rig', riggingDetails: '1/8 oz' }], catches: [{ id: 'fish', rigging: 'Custom rig', riggingDetails: 'Leader', structureType: 'Custom structure', spotAssignmentMode: 'manual', spotId: '' }], lostFish: [] }] };
  const result = normalizeLogbook(JSON.parse(JSON.stringify(normalizeLogbook(input))));
  assert.deepEqual(result.expeditions, input.expeditions);
  assert.deepEqual(result.lures, input.lures);
  assert.equal(result.trips[0].idleHours, 0.5);
  assert.equal(result.trips[0].expeditionId, 'exp');
  assert.equal(result.trips[0].gearUsed[0].riggingDetails, '1/8 oz');
  assert.equal(result.trips[0].catches[0].structureType, 'Custom structure');
  assert.deepEqual(result.riggings, ['Custom rig']);
});

test('older archives receive usable defaults for new collections', () => {
  const result = normalizeLogbook({ spots: null, expeditions: null, riggings: null, structureOptions: null });
  assert.deepEqual(result.spots, []);
  assert.deepEqual(result.expeditions, []);
  assert.ok(result.riggings.includes('Texas'));
  assert.ok(result.structureOptions.includes('Weedline'));
});
