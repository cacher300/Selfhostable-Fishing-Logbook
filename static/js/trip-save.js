function collectTripFromForm() {
  const trolling = isTrollingTrip();
  const people = collectPeople();
  const gearUsed = [...els.tripGearRows.querySelectorAll(".gear-used-row")]
    .map((row) => ({
      id: row.dataset.gearId || createId(),
      defaultTrollingSpread: row.dataset.defaultTrollingSpread === "true",
      defaultTrollingSpreadTarget: row.dataset.defaultTrollingSpreadTarget || "",
      personId: "",
      boatItemId: trolling ? row.querySelector(".trip-gear-boat-item").value : "",
      startTime: row.querySelector(".trip-gear-start-time").value,
      endTime: row.querySelector(".trip-gear-end-time").value,
      changeNote: row.querySelector(".trip-gear-change-note").value.trim(),
      side: trolling ? row.querySelector(".trip-gear-side").value : "",
      lineLabel: trolling ? row.querySelector(".trip-gear-line-label").value.trim() : "",
      hasLeadcore: trolling && isLeadcoreCapablePresentation(row.querySelector(".catch-presentation").value)
        ? row.querySelector(".trip-gear-leadcore").checked
        : false,
      comboId: row.querySelector(".trip-gear-combo").value,
      rodId: selectedComboForRow(row)?.rodId || "",
      reelId: selectedComboForRow(row)?.reelId || "",
      lureId: row.querySelector(".trip-gear-lure").value,
      rigging: isSoftPlasticLureRow(row) ? row.querySelector(".trip-gear-rigging").value : "",
      riggingDetails: isSoftPlasticLureRow(row) ? row.querySelector(".trip-gear-rigging-details").value.trim() : "",
      flasherId: trolling ? row.querySelector(".trip-gear-flasher").value : "",
      presentation: trolling ? row.querySelector(".catch-presentation").value : "",
      distanceBehind: trolling ? row.querySelector(".trip-gear-distance-behind").value.trim() : "",
      deepestRigger: false,
      hasCheater: trolling && ["downrigger", "Downrigger"].includes(row.querySelector(".catch-presentation").value)
        ? row.querySelector(".trip-gear-cheater").checked
        : false,
      cheaterLureId: trolling
        && ["downrigger", "Downrigger"].includes(row.querySelector(".catch-presentation").value)
        && row.querySelector(".trip-gear-cheater").checked
        ? row.querySelector(".trip-gear-cheater-lure").value
        : "",
      lureMinutes: row.querySelector(".trip-gear-lure").value ? setupMinutesFromRow(row) : 0,
      flasherMinutes: trolling && row.querySelector(".trip-gear-flasher").value ? setupMinutesFromRow(row) : 0
    }))
    .filter((item) => (
      item.startTime
      || item.endTime
      || item.changeNote
      || item.lineLabel
      || item.boatItemId
      || item.hasLeadcore
      || item.comboId
      || item.rodId
      || item.reelId
      || item.lureId
      || item.rigging
      || item.riggingDetails
      || item.flasherId
      || item.lureMinutes
      || item.flasherMinutes
      || item.presentation
      || item.distanceBehind
      || item.deepestRigger
      || item.hasCheater
      || item.cheaterLureId
    ));

  const collectFishRows = (container, lost = false) => [...container.querySelectorAll(".catch-row")]
    .map((row) => {
      const casting = isCastingTrip();
      const detailsUnknown = !lost && Boolean(row.querySelector(".catch-details-unknown")?.checked);
      const spotSelection = row.querySelector(".catch-spot")?.value || "__automatic__";
      const base = {
        id: row.dataset.catchId || createId(),
        detailsUnknown,
        personId: detailsUnknown ? "" : row.querySelector(".catch-person").value,
        species: lost ? "" : row.querySelector(".catch-species").value.trim(),
        possibleSpecies: lost ? row.querySelector(".catch-possible-species").value.trim() : "",
        released: detailsUnknown || lost ? false : !row.querySelector(".catch-released").checked,
        length: lost ? "" : row.querySelector(".catch-length").value.trim(),
        weight: lost ? "" : row.querySelector(".catch-weight").value.trim(),
        spotAssignmentMode: lost ? "automatic" : (spotSelection === "__automatic__" ? "automatic" : "manual"),
        spotId: lost || spotSelection.startsWith("__") ? "" : spotSelection,
        structureType: detailsUnknown ? "" : row.querySelector(".catch-structure").value,
        time: detailsUnknown ? "" : row.querySelector(".catch-time").value,
        timeUnknown: detailsUnknown ? false : row.querySelector(".catch-time-unknown").checked,
        waterDepth: detailsUnknown ? "" : row.querySelector(".catch-water-depth").value.trim(),
        depthDown: detailsUnknown ? "" : row.querySelector(".catch-depth-down").value.trim(),
        presentation: !detailsUnknown && trolling ? row.querySelector(".catch-presentation").value : "",
        direction: !detailsUnknown && trolling ? row.querySelector(".catch-direction").value : "",
        fowCaught: !detailsUnknown && (trolling || lost) ? row.querySelector(".catch-fow").value.trim() : "",
        gpsSpeed: !detailsUnknown && trolling ? row.querySelector(".catch-gps-speed").value.trim() : "",
        ballSpeed: !detailsUnknown && trolling ? row.querySelector(".catch-ball-speed").value.trim() : "",
        shaker: !detailsUnknown && trolling ? row.querySelector(".catch-shaker").checked : false,
        retrieve: !detailsUnknown && casting ? row.querySelector(".catch-retrieve").value.trim() : "",
        rigging: !detailsUnknown && !trolling && isSoftPlasticLureRow(row) ? row.querySelector(".catch-rigging").value : "",
        riggingDetails: !detailsUnknown && !trolling && isSoftPlasticLureRow(row) ? row.querySelector(".catch-rigging-details").value.trim() : "",
        ballDepth: !detailsUnknown && trolling ? row.querySelector(".catch-ball-depth").value.trim() : "",
        deepestRigger: !detailsUnknown && trolling && ["downrigger", "Downrigger"].includes(row.querySelector(".catch-presentation").value)
          ? row.querySelector(".catch-deepest-rigger").checked
          : false,
        flatlineWeightOz: !detailsUnknown && trolling ? row.querySelector(".catch-flatline-weight-oz").value.trim() : "",
        lineBehindBoard: !detailsUnknown && trolling ? row.querySelector(".catch-line-behind-board").value.trim() : "",
        leadcoreColors: !detailsUnknown && trolling ? row.querySelector(".catch-leadcore-colors").value.trim() : "",
        estimatedLureDepth: !detailsUnknown && trolling ? row.querySelector(".catch-estimated-lure-depth").value.trim() : "",
        dipseySetting: !detailsUnknown && trolling ? row.querySelector(".catch-dipsey-setting").value.trim() : "",
        lineOut: !detailsUnknown && trolling ? row.querySelector(".catch-line-out").value.trim() : "",
        estimatedDepth: !detailsUnknown && trolling ? row.querySelector(".catch-estimated-depth").value.trim() : "",
        notes: detailsUnknown ? "" : row.querySelector(".catch-notes").value.trim(),
        metadataLocks: detailsUnknown || lost ? { time: false, location: false, fow: false } : catchMetadataLocksPayload(row),
        lockedLocationCoordinates: detailsUnknown || lost ? null : lockedPhotoCoordinatesFromRow(row),
        manualCoordinates: detailsUnknown ? null : manualCoordinatesFromRow(row),
        coordinates: detailsUnknown ? null : fishCoordinatesFromRow(row),
        photoLocationId: detailsUnknown || lost ? "" : (catchPhotoLocationById(row)?.id || ""),
        heroPhotoId: detailsUnknown || lost ? "" : (selectedCatchHeroPhoto(row)?.id || ""),
        photos: detailsUnknown || lost ? [] : collectCatchPhotos(row)
      };
      const selectedRodId = row.querySelector(".catch-rod")?.selectedOptions?.[0]?.dataset.rodId || "";
      if (!detailsUnknown && !lost && row.catchWeatherData) base.weatherData = row.catchWeatherData;
      if (!detailsUnknown && hasCatchDepthData(row.catchDepthData)) {
        Object.assign(base, row.catchDepthData);
      }
      return !detailsUnknown && trolling
        ? {
            ...base,
            setupLineId: row.querySelector(".catch-setup-line").value.split("::")[0],
            setupLineTarget: row.querySelector(".catch-setup-line").value.endsWith("::cheater") ? "cheater" : "",
            lureId: row.querySelector(".catch-lure").value,
            flasherId: ""
          }
        : {
            ...base,
            setupLineId: row.querySelector(".catch-rod").value || "",
            setupLineTarget: "",
            rodId: selectedRodId,
            lureId: row.querySelector(".catch-lure").value,
            flasherId: "",
            presentation: ""
          };
    })
    .filter((item) => (
      item.species
      || item.possibleSpecies
      || item.length
      || item.weight
      || item.detailsUnknown
      || item.timeUnknown
      || item.waterDepth
      || item.structureType
      || item.depthDown
      || item.rodId
      || item.setupLineId
      || item.lureId
      || item.flasherId
      || item.presentation
      || item.direction
      || item.fowCaught
      || item.gpsSpeed
      || item.ballSpeed
      || item.shaker
      || item.retrieve
      || item.rigging
      || item.riggingDetails
      || item.ballDepth
      || item.deepestRigger
      || item.flatlineWeightOz
      || item.lineBehindBoard
      || item.leadcoreColors
      || item.estimatedLureDepth
      || item.dipseySetting
      || item.lineOut
      || item.estimatedDepth
      || isUsableCoordinates(item.manualCoordinates)
      || item.notes
      || item.photos.length
    ));

  const catches = collectFishRows(els.catchRows);
  const lostFish = collectFishRows(els.lostFishRows, true);

  const location = state.locations.find((item) => item.id === getValue("tripLocation"));
  const launch = findLaunchByIdOrName(location, getValue("tripLaunch"), "");
  const weatherData = activeTripWeatherData || null;
  const waveHeight = getValue("waveHeight");
  const waveChop = chopLabelForWaveHeight(waveHeight);

  return {
    id: getValue("tripId") || createId(),
    title: getValue("tripTitle"),
    date: getValue("tripDate"),
    expeditionId: getValue("tripExpedition"),
    location: location?.name || "",
    locationId: location?.id || "",
    launch: launch?.name || "",
    launchId: launch?.id || "",
    launchTime: getValue("launchTime"),
    linesSetTime: getValue("linesSetTime"),
    linesPulledTime: getValue("linesPulledTime"),
    startTime: getValue("linesSetTime"),
    endTime: getValue("linesPulledTime"),
    idleHours: idleHoursFromForm(),
    hours: Math.max(0, calculateHours(getValue("linesSetTime") || getValue("launchTime"), getValue("linesPulledTime")) - idleHoursFromForm()),
    targetSpecies: getValue("targetSpecies"),
    method: getValue("method"),
    intent: getTripIntent(),
    tripRating: tripRatingValue({ tripRating: els.tripRating.value }),
    waterTemp: getValue("waterTemp"),
    probeTemperatureProfile: collectProbeTemperatureProfile(),
    waterClarity: getValue("waterClarity"),
    weather: getValue("weather"),
    waveHeight,
    waveChop,
    wind: weatherWindText(weatherData),
    weatherData,
    structure: getValue("structure"),
    notes: getValue("tripNotes"),
    notePhotos: collectNotePhotos(),
    people,
    gearUsed,
    catches,
    lostFish
  };
}

function upsertListValue(listName, value) {
  if (value && !state[listName].includes(value)) state[listName].push(value);
}

async function saveTrip(event) {
  event.preventDefault();
  if (!validateTripForm()) return;
  if (!confirmTripSaveWarnings()) return;
  setTripSaveLoading(true);

  try {
    let trip = collectTripFromForm();
    trip.title = trip.title || generatedTripTitle(trip);
    state.people = mergePeople(state.people, trip.people);
    state.locations = mergeLocations(state.locations, [trip.location]);
    upsertListValue("species", trip.targetSpecies);
    upsertListValue("methods", trip.method);
    upsertListValue("waterClarities", trip.waterClarity);
    upsertListValue("weatherTypes", trip.weather);
    trip.catches.forEach((catchItem) => upsertListValue("species", catchItem.species));
    trip.lostFish.forEach((fish) => upsertListValue("species", fish.possibleSpecies));
    trip = await enrichTripWithWeather(trip);
    trip = resolveTripWaveSnapshot(trip);
    trip.wind = weatherWindText(trip.weatherData);
    activeTripWeatherData = trip.weatherData || null;

    const index = state.trips.findIndex((item) => item.id === trip.id);
    if (index >= 0) state.trips[index] = trip;
    else state.trips.push(trip);

    await saveState();
    closeTripDialog({ force: true });
    renderAll();
  } catch (error) {
    console.error("Could not save trip.", error);
    setTripSaveLoading(false);
    showTripFormMessage(error.message || "The trip could not be saved. Check that required fields are filled and try again.");
  }
}

async function deleteActiveTrip() {
  if (!activeTripId) return;
  try {
    await deleteTripById(activeTripId, { closeEditor: true });
  } catch (error) {
    console.error("Could not delete trip.", error);
    showTripFormMessage(error.message || "The trip could not be deleted.");
  }
}
