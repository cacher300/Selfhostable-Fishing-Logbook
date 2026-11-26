import { catchQuantity } from "./stats-workbench-model.js";

export function assignedExperimentIds(trip) {
  return new Set((trip?.gearUsed || []).flatMap(line =>
    (line.experimentAssignments || []).map(assignment => assignment.experimentId)
  ));
}

export function tripExperimentIds(trip) {
  return [...new Set([...(trip?.experimentIds || []), ...assignedExperimentIds(trip)])];
}

export function experimentValidationError(book) {
  function unique(records, path) {
    for (const key of ["id", "name"]) {
      const seen = new Set();
      for (const [index, item] of records.entries()) {
        const value = key === "name" ? item.name.trim().toLowerCase() : item.id;
        if (seen.has(value)) return `${path}[${index}].${key}: must be unique`;
        seen.add(value);
      }
    }
    return null;
  }
  const experiments = book.experiments || [];
  const duplicate = unique(experiments, "experiments");
  if (duplicate) return duplicate;
  const definitions = new Map();
  for (const [index, experiment] of experiments.entries()) {
    const path = `experiments[${index}]`;
    const error = unique(experiment.variants, `${path}.variants`);
    if (error) return error;
    definitions.set(experiment.id, new Set(experiment.variants.map(variant => variant.id)));
  }
  for (const [tripIndex, trip] of book.trips.entries()) {
    const tripIds = new Set();
    for (const [index, id] of (trip.experimentIds || []).entries()) {
      const path = `trips[${tripIndex}].experimentIds[${index}]`;
      if (!definitions.has(id)) return `${path}: must reference an experiment`;
      if (tripIds.has(id)) return `${path}: must be unique`;
      tripIds.add(id);
    }
    for (const [lineIndex, line] of (trip.gearUsed || []).entries()) {
      const seen = new Set();
      for (const [index, assignment] of (line.experimentAssignments || []).entries()) {
        const path = `trips[${tripIndex}].gearUsed[${lineIndex}].experimentAssignments[${index}]`;
        const definition = definitions.get(assignment.experimentId);
        if (!definition || seen.has(assignment.experimentId)) return `${path}.experimentId: must reference a unique experiment on this setup`;
        seen.add(assignment.experimentId);
        if (!definition.has(assignment.variantId)) return `${path}.variantId: must reference a variant in the experiment`;
      }
    }
  }
  return null;
}

export function assignmentLabels(experiments, assignments = []) {
  return assignments.flatMap(assignment => {
    const experiment = experiments.find(item => item.id === assignment.experimentId);
    const variant = experiment?.variants.find(item => item.id === assignment.variantId);
    return variant ? [`${experiment.name} · ${variant.name}`] : [];
  }).join(", ");
}

function durationHours(start, stop) {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(start) || !clock.test(stop)) return null;
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const difference = (minutes(stop) - minutes(start) + 1440) % 1440;
  return difference ? difference / 60 : null;
}

export function experimentResults(book, experiment) {
  const deployments = new Map(experiment.variants.map(variant => [variant.id, []]));
  for (const trip of book.trips) {
    const selected = (trip.gearUsed || []).flatMap(line => {
      const assignment = line.experimentAssignments?.find(item => item.experimentId === experiment.id);
      return assignment && deployments.has(assignment.variantId) ? [{ line, assignment }] : [];
    });
    if (!selected.length) continue;
    const eventsByLine = new Map(selected.map(({ line }) => [line.id, []]));
    for (const [records, missed] of [[trip.catches, false], [trip.lostFish, true]]) {
      for (const fish of records || []) {
        if (!fish.setupLineId) continue;
        eventsByLine.get(fish.setupLineId)?.push({
          id: fish.id, missed, quantity: catchQuantity(fish), time: fish.timeUnknown ? "" : fish.time,
          species: missed ? fish.possibleSpecies : fish.species
        });
      }
    }
    for (const { line, assignment } of selected) {
      const events = eventsByLine.get(line.id);
      deployments.get(assignment.variantId).push({
        tripId: trip.id, date: trip.date, tripTitle: trip.title || "Untitled trip", lineId: line.id,
        label: line.lineLabel || line.presentation || `Rod ${trip.gearUsed.indexOf(line) + 1}`,
        startTime: line.startTime, endTime: line.endTime, hours: durationHours(line.startTime, line.endTime),
        events
      });
    }
  }
  return experiment.variants.map(variant => {
    const rows = deployments.get(variant.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    let hours = 0, landed = 0, missed = 0, timedLanded = 0, timedStrikes = 0, untimed = 0;
    for (const row of rows) {
      if (row.hours === null) untimed++;
      hours += row.hours || 0;
      for (const fish of row.events) {
        if (fish.missed) missed += fish.quantity;
        else landed += fish.quantity;
        if (row.hours === null) continue;
        timedStrikes += fish.quantity;
        if (!fish.missed) timedLanded += fish.quantity;
      }
    }
    return {
      variant, rows, hours, landed, missed, untimed,
      landedRate: hours ? timedLanded / hours : null,
      strikeRate: hours ? timedStrikes / hours : null,
      percentLanded: landed + missed ? (100 * landed) / (landed + missed) : null
    };
  });
}

export function setExperimentVariant(assignments, experimentId, variantId) {
  const previous = assignments.find(item => item.experimentId === experimentId);
  if (!variantId) return assignments.filter(item => item.experimentId !== experimentId);
  if (!previous) return [...assignments, { experimentId, variantId }];
  return assignments.map(item => item === previous ? { ...item, variantId } : item);
}

export function withoutExperimentAssignments(line) {
  const copy = { ...line };
  delete copy.experimentAssignments;
  return copy;
}
