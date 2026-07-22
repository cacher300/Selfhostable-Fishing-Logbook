let activeShareTrip = null;

function shareEscape(value = "") { return escapeHtml(String(value)); }
function shareLaunch(trip) { return displayTitleText(trip.launch || "Launch not logged"); }
function sharePhotoUrl(media) { return previewImage(media) || originalMediaUrl(media); }
function shareFow(value) { const numeric = Number.parseFloat(value); return Number.isFinite(numeric) ? String(Math.round(numeric)) : (value || "—"); }

function shareFishPhotoOptions(trip) {
  const tripPhotos = (trip.notePhotos || []).map((photo, index) => ({ label: photo.caption?.trim() || `Trip photo ${index + 1}`, media: photo, kind: "trip" }));
  const catchPhotos = (trip.catches || []).flatMap((fish, fishIndex) => (fish.photos || []).map((photo, index) => ({ label: `${fish.species || "Catch"} ${fishIndex + 1} photo ${index + 1}`, media: photo, kind: "catch", fishIndex, weight: Number(fish.weight) || 0 })));
  return [...catchPhotos, ...tripPhotos];
}

function defaultSharePhotoIndex(trip) {
  const options = shareFishPhotoOptions(trip);
  const biggest = options.filter((item) => item.kind === "catch" && item.weight > 0).sort((a, b) => b.weight - a.weight)[0];
  if (biggest) return options.indexOf(biggest);
  const firstCatch = options.find((item) => item.kind === "catch");
  if (firstCatch) return options.indexOf(firstCatch);
  const firstTrip = options.find((item) => item.kind === "trip");
  return firstTrip ? options.indexOf(firstTrip) : "";
}

function shareEventLine(fish, index, lost = false) {
  const time = fish.time ? formatTimelineDisplayTime(fish.time) : "Time not logged";
  const fow = fish.fowCaught || fish.waterDepth;
  const depth = fish.depthDown || fish.ballDepth || fish.estimatedDepth;
  const gear = [fish.presentation, lureName(fish.lureId), flasherName(fish.flasherId)].filter(Boolean).join(" · ");
  const result = lost ? `Strike / miss${fish.possibleSpecies ? ` · ${fish.possibleSpecies}` : ""}` : [fish.species || "Fish", fish.weight ? `${fish.weight} lb` : "", fish.released ? "released" : ""].filter(Boolean).join(" · ");
  return `${index + 1}. ${time} — ${result}${fow ? `, ${fow} FOW` : ""}${depth ? `, ${depth} down` : ""}${gear ? `, ${gear}` : ""}`;
}

function shareCaption(trip, includeEvents) {
  const caught = totalCaught(trip);
  const attempts = caught + (trip.lostFish || []).length;
  const parts = [`${shareLaunch(trip)} · ${formatDate(trip.date)}`, `${caught} landed${attempts > caught ? ` from ${attempts} strikes` : ""} · ${trimNumber(tripHours(trip))} hours`];
  if (trip.notes) parts.push(displaySentenceText(trip.notes));
  if (includeEvents) {
    const events = [
      ...(trip.catches || []).map((fish, index) => ({ time: fish.time || "", line: shareEventLine(fish, index), order: index })),
      ...(trip.lostFish || []).map((fish, index) => ({ time: fish.time || "", line: shareEventLine(fish, (trip.catches || []).length + index, true), order: (trip.catches || []).length + index }))
    ].sort((a, b) => a.time.localeCompare(b.time) || a.order - b.order).map((item) => item.line);
    if (events.length) parts.push(events.join("\n"));
  }
  return parts.join("\n\n");
}

function sharePattern(trip) {
  const fish = trip.catches || [];
  const common = (values) => values.filter(Boolean).sort((a, b) => values.filter((x) => x === b).length - values.filter((x) => x === a).length)[0];
  return [common(fish.map((item) => item.fowCaught)) && `${common(fish.map((item) => item.fowCaught))} FOW`, common(fish.map((item) => item.depthDown)) && `${common(fish.map((item) => item.depthDown))} down`, common(fish.map((item) => item.presentation))].filter(Boolean).join(" · ") || "Pattern details not logged";
}

function sharePreview() {
  if (!activeShareTrip) return;
  const layout = document.querySelector("#shareTripLayout")?.value || "complete";
  const selectedValue = document.querySelector("#shareTripPhoto").value;
  const photo = selectedValue === "" ? null : shareFishPhotoOptions(activeShareTrip)[Number(selectedValue)]?.media;
  const imageUrl = sharePhotoUrl(photo);
  const headline = document.querySelector("#shareTripHeadline").value.trim() || `${shareLaunch(activeShareTrip)} fishing report`;
  const hero = imageUrl ? `<img src="${shareEscape(imageUrl)}" alt="Selected trip photo" onerror="this.remove()" />` : "";
  document.querySelector("#shareTripPreview").innerHTML = shareCompleteReport(activeShareTrip, headline, hero);
  document.querySelector("#shareTripPreview .share-report")?.classList.add(`layout-${layout}`);
  const metrics = document.querySelector("#shareTripPreview .report-metrics");
  metrics?.insertAdjacentHTML("beforeend", `<b>${Object.keys((activeShareTrip.catches || []).reduce((counts, fish) => ({ ...counts, [fish.species || "Unspecified"]: true }), {})).length}<small>species</small></b>`);
}

function shareEventRecords(trip) {
  return [...(trip.catches || []).map((item, index) => ({ ...item, eventType: "Landed", number: index + 1 })), ...(trip.lostFish || []).map((item, index) => ({ ...item, eventType: "Missed", number: (trip.catches || []).length + index + 1 }))].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")) || a.number - b.number);
}
function shareCompleteReport(trip, headline, hero) {
  const events = shareEventRecords(trip); const landed = (trip.catches || []).length; const missed = (trip.lostFish || []).length; const total = landed + missed;
  const best = [...(trip.catches || [])].sort((a,b) => Number(b.weight || 0) - Number(a.weight || 0))[0] || {};
  const species = Object.entries((trip.catches || []).reduce((map, fish) => { const key = fish.species || "Unspecified"; map[key] = (map[key] || 0) + 1; return map; }, {}));
  const weather = trip.weatherData?.tripWindow || {}; const rows = events.map((fish, index) => `<tr class="${fish.eventType === "Missed" ? "missed" : "landed"}"><td>${index+1}</td><td>${shareEscape(fish.time ? formatTimelineDisplayTime(fish.time) : "—")}</td><td>${fish.eventType}</td><td>${shareEscape(fish.species || fish.possibleSpecies || "—")}</td><td>${shareEscape(fish.weight || fish.length || "—")}</td><td>${shareEscape(shareFow(fish.fowCaught || fish.waterDepth))}</td><td>${shareEscape(fish.presentation || "—")}</td><td>${shareEscape(fish.depthDown || fish.lineOut || fish.estimatedDepth || "—")}</td><td>${shareEscape([lureName(fish.lureId), flasherName(fish.flasherId)].filter(Boolean).join(" + ") || "—")}</td></tr>`).join("");
  const pattern = sharePattern(trip); const linesSet = (trip.gearUsed || []).map(x => x.startTime).filter(Boolean).sort()[0];
  const bestLure = [lureName((trip.catches || [])[0]?.lureId), flasherName((trip.catches || [])[0]?.flasherId)].filter(Boolean).join(" + ") || "Not logged";
  const bestMethod = (trip.catches || []).find((fish) => fish.presentation)?.presentation || trip.method || "Not logged";
  return `<article class="share-report"><header><div><p>${shareEscape(formatDate(trip.date))} · ${shareEscape(shareLaunch(trip))}</p><h3>${shareEscape(headline)}</h3></div><div class="report-hero">${hero}</div></header><section class="report-metrics"><b>${landed}<small>landed</small></b><b class="red">${missed}<small>missed/lost</small></b><b>${trimNumber(tripHours(trip))}<small>hours</small></b></section><div class="report-grid"><section><h4>Trip timing & notes</h4><p>Launch ${shareEscape(trip.startTime ? formatTimelineDisplayTime(trip.startTime) : "—")} · Lines set ${shareEscape(linesSet ? formatTimelineDisplayTime(linesSet) : "—")} · Off water ${shareEscape(trip.endTime ? formatTimelineDisplayTime(trip.endTime) : "—")}</p><p>${shareEscape(displaySentenceText(trip.notes) || "No trip notes recorded.")}</p></section><section><h4>Best lure & method</h4><p>Best lure: ${shareEscape(bestLure)}</p><p>Best method: ${shareEscape(bestMethod)}</p></section><section><h4>Biggest fish</h4><p>${shareEscape(best.species || "No landed fish")} ${shareEscape(best.weight ? `· ${best.weight} lb` : "")}</p><p>${shareEscape(best.time ? formatTimelineDisplayTime(best.time) : "")} ${shareEscape(best.fowCaught ? `· ${shareFow(best.fowCaught)} FOW` : "")}</p></section><section><h4>Species breakdown</h4><p>${species.map(([name,count]) => `${shareEscape(name)} ${count}`).join(" · ") || "No landed species"}</p><h4 class="conditions-heading">Conditions</h4><p>${shareEscape(trip.weather || "")}${weather.temperatureC != null ? ` · ${Math.round(weather.temperatureC)}°C air` : ""}${weather.windSpeedMph != null ? ` · ${Math.round(weather.windSpeedMph)} mph wind` : ""}</p><p>${shareEscape(trip.waterTemp ? `Water ${trip.waterTemp}` : "Water temp not logged")}${shareEscape(trip.waveHeight ? ` · Waves ${trip.waveHeight}` : "")}</p></section></div><section class="report-log"><h4>Trip Timeline</h4><table><thead><tr><th>#</th><th>Time</th><th>Result</th><th>Species</th><th>Size</th><th>FOW</th><th>Method</th><th>Depth</th><th>Lure</th></tr></thead><tbody>${rows || `<tr><td colspan="9">No events recorded</td></tr>`}</tbody></table></section></article>`;
}

function openTripShareStudio(trip) {
  activeShareTrip = trip;
  const options = shareFishPhotoOptions(trip);
  document.querySelector("#shareTripPhoto").innerHTML = `<option value="">No photo</option>${options.map((item, index) => `<option value="${index}">${shareEscape(item.label)}</option>`).join("")}`;
  document.querySelector("#shareTripPhoto").value = String(defaultSharePhotoIndex(trip));
  document.querySelector("#shareTripLayout").value = "complete";
  document.querySelector("#shareTripHeadline").value = `${shareLaunch(trip)} fishing report`;
  sharePreview();
  els.shareTripDialog.showModal();
}

function wrapCanvasText(ctx, text, x, y, width, lineHeight, maxLines) {
  const words = text.split(/\s+/); let line = ""; let lineIndex = 0;
  words.forEach((word) => { const next = `${line} ${word}`.trim(); if (ctx.measureText(next).width > width && line && lineIndex < maxLines) { ctx.fillText(line, x, y + lineIndex * lineHeight); line = word; lineIndex += 1; } else line = next; });
  if (lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
}

function shareCanvasDownload() {
  if (!activeShareTrip) return;
  sharePreviewReportDownload(); return;
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630); gradient.addColorStop(0, "#123f37"); gradient.addColorStop(1, "#1c6b5b"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 630);
  const headline = document.querySelector("#shareTripHeadline").value || `${shareLaunch(activeShareTrip)} fishing report`;
  const finish = () => { ctx.fillStyle = "#ffffff"; ctx.font = "700 34px system-ui"; ctx.fillText(`${formatDate(activeShareTrip.date)} · ${shareLaunch(activeShareTrip)}`, 70, 75); ctx.font = "800 70px system-ui"; wrapCanvasText(ctx, headline, 70, 175, 1050, 80, 2); ctx.font = "700 44px system-ui"; ctx.fillText(`${totalCaught(activeShareTrip)} landed · ${totalCaught(activeShareTrip) + (activeShareTrip.lostFish || []).length} strikes · ${trimNumber(tripHours(activeShareTrip))} hours`, 70, 455); ctx.font = "700 24px system-ui"; ctx.fillText("FISH LOG", 70, 570); const link = document.createElement("a"); link.download = `trip-${activeShareTrip.date || "share"}.png`; link.href = canvas.toDataURL("image/png"); link.click(); };
  const selectedValue = document.querySelector("#shareTripPhoto").value;
  const photo = selectedValue === "" ? null : shareFishPhotoOptions(activeShareTrip)[Number(selectedValue)]?.media;
  const imageUrl = sharePhotoUrl(photo);
  if (!imageUrl) { finish(); return; }
  const image = new Image(); image.onload = () => { ctx.drawImage(image, 770, 100, 360, 360); finish(); }; image.onerror = finish; image.src = imageUrl;
}

async function sharePreviewReportDownload() {
  const report = document.querySelector("#shareTripPreview .share-report");
  if (!report) return;
  if (!window.html2canvas) { alert("The report exporter is still loading. Please try Download PNG again in a moment."); return; }
  await document.fonts?.ready;
  const canvas = await window.html2canvas(report, { backgroundColor: "#061b2b", scale: 2, useCORS: true, logging: false });
  const link = document.createElement("a");
  link.download = `trip-report-${activeShareTrip.date || "share"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function shareReportDownload() {
  const events = shareEventRecords(activeShareTrip); const height = Math.max(1067, 690 + events.length * 42); const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = height; const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#061b2b"; ctx.fillRect(0,0,1600,height); ctx.fillStyle="#edf7ff"; ctx.font="800 56px system-ui"; ctx.fillText(document.querySelector("#shareTripHeadline").value || `${shareLaunch(activeShareTrip)} fishing report`,60,90); ctx.font="700 24px system-ui"; ctx.fillStyle="#82c8f6"; ctx.fillText(`${formatDate(activeShareTrip.date)} · ${shareLaunch(activeShareTrip)} · ${totalCaught(activeShareTrip)} landed · ${(activeShareTrip.lostFish||[]).length} missed`,60,132);
  ctx.fillStyle="#0c2a3e"; ctx.fillRect(60,165,1480,110); ctx.fillStyle="#edf7ff"; ctx.font="600 24px system-ui"; wrapCanvasText(ctx, displaySentenceText(activeShareTrip.notes)||"No trip notes recorded.",85,210,1400,34,2);
  const headers=["#","Time","Result","Species","Size","FOW","Presentation","Depth / line","Lure / bait"]; const widths=[45,115,120,170,100,90,190,150,420]; let y=325,x=60; ctx.fillStyle="#82c8f6"; ctx.font="700 18px system-ui"; headers.forEach((h,i)=>{ctx.fillText(h,x,y);x+=widths[i];}); y+=24; ctx.strokeStyle="#28536d"; ctx.beginPath();ctx.moveTo(60,y);ctx.lineTo(1540,y);ctx.stroke();
  ctx.font="500 17px system-ui"; events.forEach((fish,index)=>{y+=36;x=60; const values=[index+1,fish.time?formatTimelineDisplayTime(fish.time):"—",fish.eventType,fish.species||fish.possibleSpecies||"—",fish.weight||fish.length||"—",fish.fowCaught||fish.waterDepth||"—",fish.presentation||"—",fish.depthDown||fish.lineOut||fish.estimatedDepth||"—",[lureName(fish.lureId),flasherName(fish.flasherId)].filter(Boolean).join(" + ")||"—"]; values.forEach((value,i)=>{ctx.fillStyle=i===2?(fish.eventType==="Missed"?"#ff7777":"#9add78"):"#edf7ff";ctx.fillText(String(value).slice(0,38),x,y);x+=widths[i];});ctx.strokeStyle="#1f4258";ctx.beginPath();ctx.moveTo(60,y+12);ctx.lineTo(1540,y+12);ctx.stroke();});
  const link=document.createElement("a");link.download=`trip-report-${activeShareTrip.date||"share"}.png`;link.href=canvas.toDataURL("image/png");link.click();
}

document.querySelector("#shareTripForm")?.addEventListener("input", sharePreview);
document.querySelector("#shareTripForm")?.addEventListener("change", sharePreview);
document.querySelector("#shareTripDownload")?.addEventListener("click", shareCanvasDownload);
