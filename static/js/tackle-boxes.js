const TACKLE_BOX_COLORS = [
  { value: "#118753", label: "Forest green" },
  { value: "#2763a7", label: "Lake blue" },
  { value: "#d88418", label: "Safety orange" },
  { value: "#b84848", label: "Brick red" },
  { value: "#7c4db2", label: "Deep purple" },
  { value: "#4b5563", label: "Graphite" }
];

const TACKLE_BOX_COMPARTMENT_COUNT = 15;
const DEFAULT_TACKLE_BOX_LAYERS = 3;
const TACKLE_BOX_STYLES = {
  organizer: { label: "Tray organizer", compartmentCount: 15 },
  cantilever: { label: "Cantilever gear box", compartmentCount: 6 }
};

const TACKLE_ITEM_TYPE_LABELS = {
  lure: "Lures",
  flasher: "Flashers",
  rod: "Rods",
  reel: "Reels",
  combo: "Rod and reel combos"
};

const openTackleBoxIds = new Set();
const activeTackleBoxLayers = new Map();
const tackleBoxLayerDirections = new Map();
let activeTackleBoxEditorLayer = 0;
let renderedTackleBoxEditorLayer = null;
let renderedTackleBoxEditorStyle = "";

function tackleBoxes() {
  state.settings.tackleBoxes = normalizeTackleBoxes(state.settings.tackleBoxes);
  return state.settings.tackleBoxes;
}

function tackleAssignableItems() {
  const items = [
    ...state.lures.map((item) => ({ type: "lure", id: item.id, name: item.name || "Unnamed lure", item })),
    ...state.flashers.map((item) => ({ type: "flasher", id: item.id, name: item.name || "Unnamed flasher", item })),
    ...state.rods.map((item) => ({ type: "rod", id: item.id, name: gearDisplayName(item, "Rod"), item })),
    ...state.reels.map((item) => ({ type: "reel", id: item.id, name: gearDisplayName(item, "Reel"), item })),
    ...state.rodReelCombos.map((item) => ({ type: "combo", id: item.id, name: comboName(item.id) || item.shortName || "Rod and reel combo", item }))
  ];
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function tackleItemKey(type, id) {
  return `${type}:${id}`;
}

function tackleStatsTargetAttributes(type, id, options = {}) {
  if (typeof gearStatsTargetAttributes === "function") {
    return gearStatsTargetAttributes(type, id, options);
  }
  return `data-gear-stats-type="${escapeHtml(type)}" data-gear-stats-id="${escapeHtml(id)}"`;
}

function resolveTackleBoxItems(box) {
  const available = new Map(tackleAssignableItems().map((item) => [tackleItemKey(item.type, item.id), item]));
  return box.itemRefs.map((ref) => {
    const item = available.get(tackleItemKey(ref.type, ref.id));
    return item ? { ...item, layer: Number(ref.layer) || 0 } : null;
  }).filter(Boolean);
}

function tackleBoxLayerCount(box) {
  return Math.min(4, Math.max(2, Math.round(Number(box?.layerCount) || DEFAULT_TACKLE_BOX_LAYERS)));
}

function tackleBoxStyle(box) {
  return TACKLE_BOX_STYLES[box?.style] ? box.style : "organizer";
}

function tackleBoxCompartmentCount(box) {
  return TACKLE_BOX_STYLES[tackleBoxStyle(box)].compartmentCount;
}

function tackleBoxStyleLabel(box) {
  return TACKLE_BOX_STYLES[tackleBoxStyle(box)].label;
}

function tackleBoxLayerItems(items, layerIndex) {
  return items.filter((item) => item.layer === layerIndex);
}

function tackleItemPhotoSource(item) {
  const source = previewImage(item?.item);
  return source && !isVideoMedia(item?.item) ? source : "";
}

function tackleItemHasPhoto(item) {
  return Boolean(tackleItemPhotoSource(item));
}

function tackleItemThumb(item, className = "") {
  const source = tackleItemPhotoSource(item);
  if (source) {
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="">`;
  }
  const abbreviations = {
    lure: "L",
    flasher: "F",
    rod: "RD",
    reel: "RL",
    combo: "C"
  };
  return `<span class="tackle-item-placeholder ${escapeHtml(className)}" aria-hidden="true">${abbreviations[item?.type] || "G"}</span>`;
}

function tackleBoxContentsMarkup(items, compartmentCount = TACKLE_BOX_COMPARTMENT_COUNT) {
  const hasOverflow = items.length > compartmentCount;
  const visibleLimit = hasOverflow ? compartmentCount - 1 : compartmentCount;
  const visible = items.slice(0, visibleLimit);
  const overflow = items.length - visible.length;
  const emptyCount = Math.max(0, compartmentCount - visible.length - (hasOverflow ? 1 : 0));
  return `
    ${visible.map((item) => {
      const photoOnlyLure = item.type === "lure" && tackleItemHasPhoto(item);
      return `
      <div
        class="tackle-compartment-item ${photoOnlyLure ? "is-photo-only-lure" : ""}"
        ${tackleStatsTargetAttributes(item.type, item.id)}
        aria-label="${escapeHtml(item.name)}, show performance stats"
      >
        ${tackleItemThumb(item, "tackle-compartment-photo")}
        ${photoOnlyLure ? "" : `<span>${escapeHtml(item.name)}</span>`}
      </div>
    `;
    }).join("")}
    ${hasOverflow ? `<div class="tackle-compartment-more">+${overflow}</div>` : ""}
    ${Array.from({ length: emptyCount }, (_, index) => `
      <div class="tackle-box-empty-compartment" aria-hidden="true">
        ${!items.length && index === Math.floor(emptyCount / 2) ? "<span>Empty</span>" : ""}
      </div>
    `).join("")}
  `;
}

function cantileverTrayMarkup(box, items, layerIndex, activeLayer, { highlightActive = false } = {}) {
  const side = layerIndex % 2 === 0 ? -1 : 1;
  const level = Math.floor(layerIndex / 2);
  const x = side * (52 + level * 3);
  const y = -(18 + level * 104);
  const rotation = side * (1.25 + level * 0.5);
  const layerItems = tackleBoxLayerItems(items, layerIndex);
  return `
    <div
      class="tackle-cantilever-tray ${highlightActive && layerIndex === activeLayer ? "is-active" : ""}"
      data-tackle-tray-index="${layerIndex}"
      data-tackle-tray-side="${side}"
      data-tackle-tray-level="${level}"
      data-tackle-tray-x="${x}"
      data-tackle-tray-y="${y}"
      data-tackle-tray-rotation="${rotation}"
      style="--tray-x:${x}%;--tray-y:${y}px;--tray-rotation:${rotation}deg"
    >
      <div class="tackle-compartment-grid">
        ${tackleBoxContentsMarkup(layerItems, tackleBoxCompartmentCount(box))}
      </div>
      <span class="tackle-layer-badge">Layer ${layerIndex + 1}</span>
    </div>
  `;
}

function tackleBoxObjectMarkup(box, items, { editor = false, activeLayer = 0, direction = "" } = {}) {
  const isOpen = editor || openTackleBoxIds.has(box.id);
  const style = tackleBoxStyle(box);
  const layerCount = tackleBoxLayerCount(box);
  const layerIndex = Math.min(layerCount - 1, Math.max(0, activeLayer));
  const layerItems = tackleBoxLayerItems(items, layerIndex);
  const compartmentCount = tackleBoxCompartmentCount(box);
  return `
    <div class="tackle-box-scene tackle-style-${style} ${editor ? "is-editor-preview" : ""}" style="--tackle-color:${box.color}">
      <div class="tackle-box-object ${isOpen ? "is-open" : ""}">
        <div class="tackle-box-lid">
          <div class="tackle-box-lid-face">
            <span class="tackle-box-handle" aria-hidden="true"></span>
            <strong>${escapeHtml(box.name)}</strong>
          </div>
        </div>
        <div class="tackle-box-base">
          ${style === "cantilever" ? `
            <div class="tackle-cantilever-mechanism" aria-hidden="true">
              <span class="tackle-link tackle-link-left-outer" data-tackle-link-rotation="-29"></span>
              <span class="tackle-link tackle-link-left-inner" data-tackle-link-rotation="-18"></span>
              <span class="tackle-link tackle-link-right-inner" data-tackle-link-rotation="18"></span>
              <span class="tackle-link tackle-link-right-outer" data-tackle-link-rotation="29"></span>
            </div>
            <div class="tackle-cantilever-trays">
              ${Array.from({ length: layerCount }, (_, index) => (
                cantileverTrayMarkup(box, items, index, layerIndex, { highlightActive: editor })
              )).join("")}
            </div>
          ` : `
            <div class="tackle-box-layer-stack" aria-hidden="true">
              ${Array.from({ length: layerCount }, (_, index) => (
                `<span class="${index === layerIndex ? "is-active" : ""}" style="--layer-index:${index};--active-layer:${layerIndex}"></span>`
              )).join("")}
            </div>
            <div class="tackle-box-layer-panel layer-${layerIndex} ${direction ? `is-${direction}` : ""}">
              <div class="tackle-compartment-grid">
                ${tackleBoxContentsMarkup(layerItems, compartmentCount)}
              </div>
              <span class="tackle-layer-badge">Layer ${layerIndex + 1}</span>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function tackleBoxLayerControlsMarkup(box, activeLayer, isOpen) {
  const layerCount = tackleBoxLayerCount(box);
  if (tackleBoxStyle(box) === "cantilever") {
    return `
      <div class="tackle-layer-controls tackle-all-layers-status ${isOpen ? "is-visible" : ""}" ${isOpen ? "" : "hidden"} aria-label="${escapeHtml(box.name)} trays">
        <strong>All ${layerCount} trays visible</strong>
        <span>Hover any item for stats</span>
      </div>
    `;
  }
  return `
    <div class="tackle-layer-controls ${isOpen ? "is-visible" : ""}" ${isOpen ? "" : "hidden"} aria-label="${escapeHtml(box.name)} layers">
      <button class="tackle-layer-arrow" type="button" data-tackle-layer-step="-1" data-tackle-box="${escapeHtml(box.id)}" aria-label="Previous layer" ${activeLayer === 0 ? "disabled" : ""}>←</button>
      <div class="tackle-layer-position">
        <strong>Layer ${activeLayer + 1} of ${layerCount}</strong>
        <div class="tackle-layer-dots">
          ${Array.from({ length: layerCount }, (_, index) => `
            <button
              class="${index === activeLayer ? "is-active" : ""}"
              type="button"
              data-tackle-layer-index="${index}"
              data-tackle-box="${escapeHtml(box.id)}"
              aria-label="Show layer ${index + 1}"
              aria-pressed="${index === activeLayer}"
            ></button>
          `).join("")}
        </div>
      </div>
      <button class="tackle-layer-arrow" type="button" data-tackle-layer-step="1" data-tackle-box="${escapeHtml(box.id)}" aria-label="Next layer" ${activeLayer === layerCount - 1 ? "disabled" : ""}>→</button>
    </div>
  `;
}

function tackleBoxCardMarkup(box) {
  const items = resolveTackleBoxItems(box);
  const isOpen = openTackleBoxIds.has(box.id);
  const style = tackleBoxStyle(box);
  const layerCount = tackleBoxLayerCount(box);
  const activeLayer = Math.min(layerCount - 1, Math.max(0, activeTackleBoxLayers.get(box.id) || 0));
  activeTackleBoxLayers.set(box.id, activeLayer);
  const direction = tackleBoxLayerDirections.get(box.id) || "";
  return `
    <article class="tackle-box-card ${isOpen ? "is-open" : ""}" data-tackle-box-id="${escapeHtml(box.id)}">
      <header class="tackle-box-card-header">
        <div>
          <h4>${escapeHtml(box.name)}</h4>
          <span>${escapeHtml(tackleBoxStyleLabel(box))} · ${items.length} item${items.length === 1 ? "" : "s"} · ${layerCount} layers</span>
        </div>
        <button class="button secondary" type="button" data-edit-tackle-box="${escapeHtml(box.id)}">Edit</button>
      </header>
      ${tackleBoxObjectMarkup(box, items, { activeLayer, direction })}
      <footer class="tackle-box-card-footer">
        <div class="tackle-box-open-controls">
          <button class="button ${isOpen ? "secondary" : "primary"}" type="button" data-toggle-tackle-box="${escapeHtml(box.id)}" aria-expanded="${isOpen}">
            ${isOpen ? "Close box" : "Open box"}
          </button>
          <span>${isOpen ? (style === "cantilever" ? "All trays visible" : "Browse the trays") : "Box closed"}</span>
        </div>
        ${tackleBoxLayerControlsMarkup(box, activeLayer, isOpen)}
      </footer>
    </article>
  `;
}

function renderTackleBoxes() {
  const container = document.querySelector("#tackleBoxGrid");
  if (!container) return;
  const boxes = tackleBoxes();
  if (!boxes.length) {
    const sample = { id: "sample", name: "Your tackle box", color: "#118753", style: "organizer", layerCount: 3, itemRefs: [] };
    container.innerHTML = `
      <div class="tackle-box-empty-state">
        ${tackleBoxObjectMarkup(sample, [], { editor: true })}
        <div>
          <h4>No tackle boxes yet</h4>
          <p>Create a box, choose its color, and pack it with gear from your library.</p>
          <button class="button primary" type="button" data-create-tackle-box>Create your first box</button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = boxes.map(tackleBoxCardMarkup).join("");
}

function tackleBoxColorOptionsMarkup(selectedColor) {
  return TACKLE_BOX_COLORS.map((color) => `
    <label class="tackle-color-option" title="${escapeHtml(color.label)}">
      <input type="radio" name="tackleBoxColor" value="${color.value}" ${color.value === selectedColor ? "checked" : ""}>
      <span style="--swatch:${color.value}" aria-hidden="true"></span>
      <span class="visually-hidden">${escapeHtml(color.label)}</span>
    </label>
  `).join("");
}

function tackleBoxLayerOptionsMarkup(selectedLayer, layerCount) {
  return Array.from({ length: layerCount }, (_, index) => (
    `<option value="${index}" ${index === selectedLayer ? "selected" : ""}>Layer ${index + 1}</option>`
  )).join("");
}

function collectTackleBoxEditorRefs() {
  const layerCount = tackleBoxLayerCount({ layerCount: document.querySelector("#tackleBoxLayerCount").value });
  return [...document.querySelectorAll('input[name="tackleBoxItem"]:checked')].map((input) => {
    const separator = input.value.indexOf(":");
    const layerSelect = [...document.querySelectorAll("[data-tackle-item-layer]")]
      .find((select) => select.dataset.tackleItemLayer === input.value);
    return {
      type: input.value.slice(0, separator),
      id: input.value.slice(separator + 1),
      layer: Math.min(layerCount - 1, Math.max(0, Number(layerSelect?.value) || 0))
    };
  });
}

function renderTackleBoxEditorLayerTabs(layerCount, refs, box) {
  const container = document.querySelector("#tackleBoxEditorLayerTabs");
  const capacity = tackleBoxCompartmentCount(box);
  activeTackleBoxEditorLayer = Math.min(layerCount - 1, Math.max(0, activeTackleBoxEditorLayer));
  container.innerHTML = Array.from({ length: layerCount }, (_, index) => {
    const itemCount = refs.filter((ref) => ref.layer === index).length;
    return `
    <button
      class="${index === activeTackleBoxEditorLayer ? "is-active" : ""} ${itemCount > capacity ? "is-overfull" : ""}"
      type="button"
      data-tackle-editor-layer="${index}"
      aria-pressed="${index === activeTackleBoxEditorLayer}"
    >Layer ${index + 1} · ${itemCount}/${capacity}</button>
  `;
  }).join("");
}

function renderTackleBoxLayerCountOptions(selectedCount = 3) {
  const select = document.querySelector("#tackleBoxLayerCount");
  const style = document.querySelector("#tackleBoxStyle").value;
  const perLayer = TACKLE_BOX_STYLES[style].compartmentCount;
  select.innerHTML = [2, 3, 4].map((count) => (
    `<option value="${count}" ${count === selectedCount ? "selected" : ""}>${count} layers · ${count * perLayer} spaces</option>`
  )).join("");
}

function renderTackleBoxEditorPreview() {
  const name = document.querySelector("#tackleBoxName").value.trim() || "Tackle box";
  const color = document.querySelector('input[name="tackleBoxColor"]:checked')?.value || "#118753";
  const style = document.querySelector("#tackleBoxStyle").value;
  const layerCount = tackleBoxLayerCount({ layerCount: document.querySelector("#tackleBoxLayerCount").value });
  const refs = collectTackleBoxEditorRefs();
  const available = new Map(tackleAssignableItems().map((item) => [tackleItemKey(item.type, item.id), item]));
  const items = refs.map((ref) => {
    const item = available.get(tackleItemKey(ref.type, ref.id));
    return item ? { ...item, layer: ref.layer } : null;
  }).filter(Boolean);
  const previewBox = { id: "editor", name, color, style, layerCount, itemRefs: refs };
  renderTackleBoxEditorLayerTabs(layerCount, refs, previewBox);
  const preview = document.querySelector("#tackleBoxEditorPreview");
  const previewChanged = renderedTackleBoxEditorLayer !== activeTackleBoxEditorLayer
    || renderedTackleBoxEditorStyle !== style;
  const direction = renderedTackleBoxEditorLayer !== null
    && activeTackleBoxEditorLayer < renderedTackleBoxEditorLayer
    ? "backward"
    : "forward";
  preview.innerHTML = tackleBoxObjectMarkup(
    previewBox,
    items,
    { editor: true, activeLayer: activeTackleBoxEditorLayer }
  );
  if (previewChanged) animateTackleBoxLayer(preview, direction);
  renderedTackleBoxEditorLayer = activeTackleBoxEditorLayer;
  renderedTackleBoxEditorStyle = style;
}

function renderTackleBoxItemPicker(selectedRefs = []) {
  const container = document.querySelector("#tackleBoxItemPicker");
  const selected = new Map(selectedRefs.map((ref) => [
    tackleItemKey(ref.type, ref.id),
    Number(ref.layer) || 0
  ]));
  const layerCount = tackleBoxLayerCount({ layerCount: document.querySelector("#tackleBoxLayerCount").value });
  const items = tackleAssignableItems();
  if (!items.length) {
    container.innerHTML = `
      <div class="tackle-picker-empty">
        Add lures or gear to your library first, then return here to pack this box.
      </div>
    `;
    return;
  }

  const groups = Object.keys(TACKLE_ITEM_TYPE_LABELS).map((type) => {
    const groupItems = items.filter((item) => item.type === type);
    if (!groupItems.length) return "";
    return `
      <section class="tackle-picker-group" data-tackle-picker-group>
        <h4>${escapeHtml(TACKLE_ITEM_TYPE_LABELS[type])}</h4>
        <div>
          ${groupItems.map((item) => {
            const key = tackleItemKey(item.type, item.id);
            const isSelected = selected.has(key);
            const selectedLayer = Math.min(layerCount - 1, Math.max(0, selected.get(key) || 0));
            const photoOnlyLure = item.type === "lure" && tackleItemHasPhoto(item);
            return `
              <div
                class="tackle-picker-item ${isSelected ? "is-selected" : ""} ${photoOnlyLure ? "is-photo-only-lure" : ""}"
                data-tackle-search="${escapeHtml(`${item.name} ${TACKLE_ITEM_TYPE_LABELS[type]}`.toLowerCase())}"
              >
                <label class="tackle-picker-main" ${tackleStatsTargetAttributes(item.type, item.id, { focusable: false })}>
                  <input type="checkbox" name="tackleBoxItem" value="${escapeHtml(key)}" ${isSelected ? "checked" : ""}>
                  <span class="tackle-picker-photo">${tackleItemThumb(item, "tackle-picker-image")}</span>
                  ${photoOnlyLure ? "" : `<span class="tackle-picker-copy">
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${escapeHtml(TACKLE_ITEM_TYPE_LABELS[type].replace(/s$/, ""))}</small>
                  </span>`}
                  <span class="tackle-picker-check" aria-hidden="true">✓</span>
                </label>
                <select
                  class="tackle-picker-layer"
                  data-tackle-item-layer="${escapeHtml(key)}"
                  aria-label="Layer for ${escapeHtml(item.name)}"
                  ${isSelected ? "" : "disabled"}
                >${tackleBoxLayerOptionsMarkup(selectedLayer, layerCount)}</select>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }).join("");
  container.innerHTML = groups;
}

function rerenderTackleBoxPickerForStructureChange() {
  const query = document.querySelector("#tackleBoxItemSearch").value;
  const refs = collectTackleBoxEditorRefs();
  renderTackleBoxItemPicker(refs);
  filterTackleBoxItemPicker(query);
  renderTackleBoxEditorPreview();
}

function filterTackleBoxItemPicker(query) {
  const normalized = String(query || "").trim().toLowerCase();
  document.querySelectorAll("[data-tackle-search]").forEach((item) => {
    item.classList.toggle("hidden", Boolean(normalized) && !item.dataset.tackleSearch.includes(normalized));
  });
  document.querySelectorAll("[data-tackle-picker-group]").forEach((group) => {
    const hasVisibleItems = [...group.querySelectorAll("[data-tackle-search]")].some((item) => !item.classList.contains("hidden"));
    group.classList.toggle("hidden", !hasVisibleItems);
  });
}

function openTackleBoxDialog(box = null) {
  const editing = Boolean(box);
  document.querySelector("#tackleBoxForm").reset();
  document.querySelector("#tackleBoxDialogTitle").textContent = editing ? "Edit Tackle Box" : "New Tackle Box";
  document.querySelector("#editingTackleBoxId").value = box?.id || "";
  document.querySelector("#tackleBoxName").value = box?.name || `Tackle Box ${tackleBoxes().length + 1}`;
  document.querySelector("#tackleBoxStyle").value = tackleBoxStyle(box);
  renderTackleBoxLayerCountOptions(tackleBoxLayerCount(box));
  document.querySelector("#tackleBoxColorOptions").innerHTML = tackleBoxColorOptionsMarkup(box?.color || "#118753");
  document.querySelector("#deleteTackleBoxButton").classList.toggle("hidden", !editing);
  document.querySelector("#tackleBoxItemSearch").value = "";
  activeTackleBoxEditorLayer = 0;
  renderedTackleBoxEditorLayer = null;
  renderedTackleBoxEditorStyle = "";
  renderTackleBoxItemPicker(box?.itemRefs || []);
  renderTackleBoxEditorPreview();
  document.querySelector("#tackleBoxDialog").showModal();
  document.querySelector("#tackleBoxName").focus();
}

async function saveTackleBox(event) {
  event.preventDefault();
  const boxes = tackleBoxes();
  const editingId = document.querySelector("#editingTackleBoxId").value;
  const rawRefs = collectTackleBoxEditorRefs();
  const box = {
    id: editingId || createId(),
    name: document.querySelector("#tackleBoxName").value.trim().slice(0, 50),
    color: document.querySelector('input[name="tackleBoxColor"]:checked')?.value || "#118753",
    style: document.querySelector("#tackleBoxStyle").value,
    layerCount: tackleBoxLayerCount({ layerCount: document.querySelector("#tackleBoxLayerCount").value }),
    itemRefs: rawRefs
  };
  if (!box.name) return;
  const capacity = tackleBoxCompartmentCount(box);
  const overfullLayer = Array.from({ length: box.layerCount }, (_, layer) => (
    rawRefs.filter((ref) => ref.layer === layer).length
  )).findIndex((count) => count > capacity);
  if (overfullLayer >= 0) {
    alert(`Layer ${overfullLayer + 1} holds more than ${capacity} items. Move gear to another layer before saving.`);
    activeTackleBoxEditorLayer = overfullLayer;
    renderTackleBoxEditorPreview();
    return;
  }
  const index = boxes.findIndex((item) => item.id === box.id);
  if (index >= 0) boxes[index] = box;
  else boxes.push(box);

  try {
    await saveState();
    document.querySelector("#tackleBoxDialog").close();
    renderTackleBoxes();
  } catch (error) {
    console.error("Could not save tackle box.", error);
    alert(error.message || "The tackle box could not be saved.");
  }
}

async function deleteTackleBox() {
  const id = document.querySelector("#editingTackleBoxId").value;
  const box = tackleBoxes().find((item) => item.id === id);
  if (!box || !window.confirm(`Delete ${box.name}? Your gear will remain in the main library.`)) return;
  state.settings.tackleBoxes = tackleBoxes().filter((item) => item.id !== id);
  openTackleBoxIds.delete(id);
  activeTackleBoxLayers.delete(id);
  tackleBoxLayerDirections.delete(id);
  await saveState();
  document.querySelector("#tackleBoxDialog").close();
  renderTackleBoxes();
}

function tackleMotionEnabled() {
  return typeof window.anime === "function"
    && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function clearTackleMotionStyles(elements) {
  elements.filter(Boolean).forEach((element) => {
    window.anime.remove(element);
    ["opacity", "transform"].forEach((property) => element.style.removeProperty(property));
  });
}

function animateCantileverBox(card, opening, complete) {
  const object = card.querySelector(".tackle-box-object");
  const lid = object.querySelector(".tackle-box-lid");
  const lidLabel = lid.querySelector("strong");
  const base = object.querySelector(".tackle-box-base");
  const links = [...object.querySelectorAll(".tackle-link")];
  const trays = [...object.querySelectorAll(".tackle-cantilever-tray")];
  const trayContents = [...object.querySelectorAll(".tackle-cantilever-tray .tackle-compartment-grid > *")];
  const editorPreview = Boolean(card.querySelector(".is-editor-preview"));
  const animated = [lid, lidLabel, base, ...links, ...trays, ...trayContents];
  const finish = () => {
    complete();
    clearTackleMotionStyles(animated);
  };
  const timeline = window.anime.timeline({
    autoplay: true,
    easing: "easeOutExpo",
    complete: finish
  });

  timeline.add({
    targets: base,
    translateY: opening ? [6, 0] : [0, 6],
    scaleY: opening ? [0.96, 1] : [1, 0.96],
    duration: 420
  }, 0);

  timeline.add({
    targets: lid,
    translateY: opening ? [0, -118] : [-118, 0],
    translateZ: opening ? [18, -14] : [-14, 18],
    rotateX: opening ? [0, -18] : [-18, 0],
    scaleY: opening ? [1, 0.88] : [0.88, 1],
    duration: 620,
    easing: opening ? "easeOutExpo" : "easeInOutQuart"
  }, 20);

  timeline.add({
    targets: lidLabel,
    opacity: opening ? [1, 0] : [0, 1],
    translateY: opening ? [0, -5] : [-5, 0],
    duration: 220,
    easing: "easeOutQuad"
  }, opening ? 30 : 260);

  timeline.add({
    targets: links,
    opacity: opening ? [0, 1] : [1, 0],
    translateY: opening ? [42, 0] : [0, 42],
    rotateZ: (element) => {
      const rotation = Number(element.dataset.tackleLinkRotation) || 0;
      return opening ? [0, rotation] : [rotation, 0];
    },
    scaleY: opening ? [0.22, 1] : [1, 0.22],
    delay: window.anime.stagger(28, { from: "center" }),
    duration: 520
  }, opening ? 150 : 0);

  trays.forEach((tray, index) => {
    const x = Number(tray.dataset.tackleTrayX) || 0;
    const y = Number(tray.dataset.tackleTrayY) || 0;
    const rotation = Number(tray.dataset.tackleTrayRotation) || 0;
    const highlighted = tray.classList.contains("is-active");
    const finalY = y - (highlighted ? 8 : 0);
    const finalOpacity = !editorPreview || highlighted ? 1 : 0.82;
    const finalScale = !editorPreview ? 1 : (highlighted ? 1.015 : 0.985);
    timeline.add({
      targets: tray,
      opacity: opening ? [0, finalOpacity] : [finalOpacity, 0],
      translateX: opening ? ["0%", `${x}%`] : [`${x}%`, "0%"],
      translateY: opening ? [18, finalY] : [finalY, 18],
      rotateZ: opening ? [0, rotation] : [rotation, 0],
      scale: opening ? [0.9, finalScale] : [finalScale, 0.9],
      duration: opening ? 620 : 400,
      easing: opening ? "easeOutBack" : "easeInOutQuart"
    }, opening ? 210 + index * 70 : index * 24);
  });

  if (opening && trayContents.length) {
    timeline.add({
      targets: trayContents,
      opacity: [0, 1],
      translateY: [7, 0],
      scale: [0.9, 1],
      delay: window.anime.stagger(36),
      duration: 330,
      easing: "easeOutQuad"
    }, 410);
  }
}

function animateOrganizerBox(card, opening, complete) {
  const object = card.querySelector(".tackle-box-object");
  const lid = object.querySelector(".tackle-box-lid");
  const base = object.querySelector(".tackle-box-base");
  const panel = object.querySelector(".tackle-box-layer-panel");
  const contents = panel ? [...panel.querySelectorAll(".tackle-compartment-grid > *")] : [];
  const animated = [lid, base, panel, ...contents];
  const finish = () => {
    complete();
    clearTackleMotionStyles(animated);
  };
  const timeline = window.anime.timeline({
    autoplay: true,
    easing: "easeOutExpo",
    complete: finish
  });

  timeline.add({
    targets: base,
    translateY: opening ? [5, 0] : [0, 5],
    scaleY: opening ? [0.97, 1] : [1, 0.97],
    duration: 360
  }, 0);
  timeline.add({
    targets: lid,
    translateY: opening ? [0, -5] : [-5, 0],
    translateZ: opening ? [18, -12] : [-12, 18],
    rotateX: opening ? [0, 112] : [112, 0],
    duration: 560,
    easing: opening ? "easeOutExpo" : "easeInOutQuart"
  }, 10);
  timeline.add({
    targets: panel,
    opacity: opening ? [0, 1] : [1, 0],
    translateY: opening ? [16, 0] : [0, 16],
    scale: opening ? [0.96, 1] : [1, 0.96],
    duration: 380
  }, opening ? 210 : 0);

  if (opening && contents.length) {
    timeline.add({
      targets: contents,
      opacity: [0, 1],
      translateY: [5, 0],
      scale: [0.92, 1],
      delay: window.anime.stagger(22, { grid: [5, 3], from: "center" }),
      duration: 260,
      easing: "easeOutQuad"
    }, 320);
  }
}

function animateTackleBoxState(card, opening, complete) {
  if (!tackleMotionEnabled()) {
    complete();
    return;
  }
  if (card.querySelector(".tackle-style-cantilever")) {
    animateCantileverBox(card, opening, complete);
    return;
  }
  animateOrganizerBox(card, opening, complete);
}

function animateTackleBoxLayer(card, direction = "forward") {
  if (!card || !tackleMotionEnabled()) return;
  const cantilever = card.querySelector(".tackle-style-cantilever");
  const activeTarget = cantilever
    ? card.querySelector(".tackle-cantilever-tray.is-active")
    : card.querySelector(".tackle-box-layer-panel");
  if (!activeTarget) return;
  const contents = [...activeTarget.querySelectorAll(".tackle-compartment-grid > *")];
  const offset = direction === "backward" ? -26 : 26;

  if (cantilever) {
    const x = Number(activeTarget.dataset.tackleTrayX) || 0;
    const y = (Number(activeTarget.dataset.tackleTrayY) || 0) - 8;
    const rotation = Number(activeTarget.dataset.tackleTrayRotation) || 0;
    const startX = x + (direction === "backward" ? -12 : 12);
    window.anime({
      targets: activeTarget,
      opacity: [0.58, 1],
      translateX: [`${startX}%`, `${x}%`],
      translateY: [y + 12, y],
      rotateZ: [rotation + (direction === "backward" ? -2 : 2), rotation],
      scale: [0.96, 1.015],
      duration: 520,
      easing: "easeOutExpo"
    });
  } else {
    window.anime({
      targets: activeTarget,
      opacity: [0, 1],
      translateX: [offset, 0],
      translateY: [8, 0],
      scale: [0.97, 1],
      duration: 430,
      easing: "easeOutExpo"
    });
  }

  window.anime({
    targets: contents,
    opacity: [0, 1],
    translateY: [6, 0],
    scale: [0.92, 1],
    delay: window.anime.stagger(28),
    duration: 280,
    easing: "easeOutQuad"
  });
}

function toggleTackleBox(boxId) {
  const card = [...document.querySelectorAll("[data-tackle-box-id]")]
    .find((item) => item.dataset.tackleBoxId === boxId);
  if (!card) return;
  const object = card.querySelector(".tackle-box-object");
  const toggleButton = card.querySelector("[data-toggle-tackle-box]");
  const status = card.querySelector(".tackle-box-open-controls span");
  const layerControls = card.querySelector(".tackle-layer-controls");
  const box = tackleBoxes().find((item) => item.id === boxId);
  const openStatus = tackleBoxStyle(box) === "cantilever" ? "All trays visible" : "Browse the trays";
  const opening = !openTackleBoxIds.has(boxId);

  if (opening) {
    openTackleBoxIds.add(boxId);
    card.classList.add("is-open");
    object.classList.add("is-open");
    toggleButton.classList.remove("primary");
    toggleButton.classList.add("secondary");
    toggleButton.textContent = "Close box";
    toggleButton.setAttribute("aria-expanded", "true");
    status.textContent = openStatus;
    layerControls.hidden = false;
    layerControls.classList.add("is-visible");
    toggleButton.disabled = true;
    animateTackleBoxState(card, true, () => {
      toggleButton.disabled = false;
    });
    return;
  }

  openTackleBoxIds.delete(boxId);
  toggleButton.classList.remove("secondary");
  toggleButton.classList.add("primary");
  toggleButton.textContent = "Open box";
  toggleButton.setAttribute("aria-expanded", "false");
  status.textContent = "Box closed";
  layerControls.classList.remove("is-visible");
  toggleButton.disabled = true;
  animateTackleBoxState(card, false, () => {
    card.classList.remove("is-open");
    object.classList.remove("is-open");
    layerControls.hidden = true;
    toggleButton.disabled = false;
  });
}

function showTackleBoxLayer(boxId, targetLayer) {
  const box = tackleBoxes().find((item) => item.id === boxId);
  if (!box) return;
  const layerCount = tackleBoxLayerCount(box);
  const currentLayer = activeTackleBoxLayers.get(boxId) || 0;
  const nextLayer = Math.min(layerCount - 1, Math.max(0, targetLayer));
  if (nextLayer === currentLayer) return;
  tackleBoxLayerDirections.set(boxId, nextLayer > currentLayer ? "forward" : "backward");
  activeTackleBoxLayers.set(boxId, nextLayer);
  renderTackleBoxes();
  const card = [...document.querySelectorAll("[data-tackle-box-id]")]
    .find((item) => item.dataset.tackleBoxId === boxId);
  animateTackleBoxLayer(card, tackleBoxLayerDirections.get(boxId));
  tackleBoxLayerDirections.delete(boxId);
}

function bindTackleBoxEvents() {
  if (document.documentElement) {
    document.documentElement.dataset.tackleMotionEngine = typeof window.anime === "function"
      ? `anime-${window.anime.version}`
      : "css-fallback";
  }
  document.querySelector("#newTackleBoxButton")?.addEventListener("click", () => openTackleBoxDialog());
  document.querySelector("#tackleBoxForm")?.addEventListener("submit", saveTackleBox);
  document.querySelector("#deleteTackleBoxButton")?.addEventListener("click", () => {
    deleteTackleBox().catch((error) => alert(error.message || "The tackle box could not be deleted."));
  });
  document.querySelector("#tackleBoxName")?.addEventListener("input", renderTackleBoxEditorPreview);
  document.querySelector("#tackleBoxStyle")?.addEventListener("change", () => {
    const count = tackleBoxLayerCount({ layerCount: document.querySelector("#tackleBoxLayerCount").value });
    renderTackleBoxLayerCountOptions(count);
    rerenderTackleBoxPickerForStructureChange();
  });
  document.querySelector("#tackleBoxLayerCount")?.addEventListener("change", rerenderTackleBoxPickerForStructureChange);
  document.querySelector("#tackleBoxColorOptions")?.addEventListener("change", renderTackleBoxEditorPreview);
  document.querySelector("#tackleBoxEditorLayerTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tackle-editor-layer]");
    if (!button) return;
    activeTackleBoxEditorLayer = Number(button.dataset.tackleEditorLayer);
    renderTackleBoxEditorPreview();
  });
  document.querySelector("#tackleBoxItemPicker")?.addEventListener("change", (event) => {
    const card = event.target.closest(".tackle-picker-item");
    if (!card) return;
    const checkbox = card.querySelector('input[name="tackleBoxItem"]');
    const layerSelect = card.querySelector(".tackle-picker-layer");
    if (event.target === checkbox) {
      layerSelect.disabled = !checkbox.checked;
      card.classList.toggle("is-selected", checkbox.checked);
      if (checkbox.checked) layerSelect.value = String(activeTackleBoxEditorLayer);
    } else if (event.target === layerSelect) {
      checkbox.checked = true;
      card.classList.add("is-selected");
      layerSelect.disabled = false;
      activeTackleBoxEditorLayer = Number(layerSelect.value);
    }
    renderTackleBoxEditorPreview();
  });
  document.querySelector("#tackleBoxItemSearch")?.addEventListener("input", (event) => filterTackleBoxItemPicker(event.target.value));
  document.querySelector("#tackleBoxGrid")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-create-tackle-box]")) {
      openTackleBoxDialog();
      return;
    }
    const editButton = event.target.closest("[data-edit-tackle-box]");
    if (editButton) {
      openTackleBoxDialog(tackleBoxes().find((box) => box.id === editButton.dataset.editTackleBox));
      return;
    }
    const directLayerButton = event.target.closest("[data-tackle-layer-index]");
    if (directLayerButton) {
      showTackleBoxLayer(directLayerButton.dataset.tackleBox, Number(directLayerButton.dataset.tackleLayerIndex));
      return;
    }
    const layerStepButton = event.target.closest("[data-tackle-layer-step]");
    if (layerStepButton) {
      const id = layerStepButton.dataset.tackleBox;
      showTackleBoxLayer(id, (activeTackleBoxLayers.get(id) || 0) + Number(layerStepButton.dataset.tackleLayerStep));
      return;
    }
    const toggleButton = event.target.closest("[data-toggle-tackle-box]");
    if (!toggleButton) return;
    toggleTackleBox(toggleButton.dataset.toggleTackleBox);
  });
}

bindTackleBoxEvents();
