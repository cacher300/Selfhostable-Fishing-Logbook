const BOAT_SLOT_COLUMNS = BOAT_LAYOUT_COLUMNS;
const BOAT_SLOT_POINTS = BOAT_LAYOUT_POINTS;
const BOAT_SLOT_COUNT = BOAT_LAYOUT_SLOT_LIMIT;

const BOAT_GEAR_TYPES = [
  { type: "rod-holder", label: "Rod holder", icon: '<path d="M6 18 17 5M8 5h9v9M5 19l4-4" />' },
  { type: "downrigger", label: "Downrigger", icon: '<circle cx="9" cy="12" r="4" /><path d="M9 8V4h8M17 4v5M9 16v4" />' },
  { type: "fish-finder", label: "Fish finder", icon: '<rect x="4" y="4" width="16" height="13" rx="2" /><path d="M7 13c2-4 4-4 6 0s4 4 5 0M12 17v3" />' },
  { type: "live-well", label: "Live well", icon: '<path d="M3 7h18v12H3zM3 11h18M8 15c1.5-2 3-2 4.5 0s3 2 4.5 0" />' },
  { type: "trolling-motor", label: "Trolling motor", icon: '<path d="M7 4h8l3 3-3 3H7zM11 10v9M7 19h8M18 7h3" />' },
  { type: "chartplotter", label: "Chartplotter", icon: '<rect x="3" y="4" width="18" height="15" rx="2" /><path d="m7 15 3-5 3 3 4-6M9 21h6" />' },
  { type: "marine-radio", label: "Marine radio", icon: '<rect x="4" y="6" width="16" height="14" rx="2" /><path d="M7 10h6M7 14h4M17 10v5M8 6l8-3" />' },
  { type: "battery", label: "Battery", icon: '<rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 6V3h3v3M14 6V3h3v3M8 13h4M10 11v4M15 13h3" />' },
  { type: "tackle", label: "Tackle storage", icon: '<rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18M12 12v8" />' },
  { type: "cooler", label: "Cooler", icon: '<rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 10h18M8 5h8M17 14v2" />' },
  { type: "landing-net", label: "Landing net", icon: '<circle cx="14" cy="8" r="5" /><path d="m10.5 11.5-7 8M10 5l8 6M10 11l8-6" />' },
  { type: "seat", label: "Seat", icon: '<path d="M6 4h12v8H6zM8 12v8M16 12v8M5 16h14" />' },
  { type: "anchor", label: "Anchor", icon: '<circle cx="12" cy="5" r="2" /><path d="M12 7v12M5 13c0 4 3 7 7 7s7-3 7-7M5 13l-2 2M19 13l2 2" />' },
  { type: "custom", label: "Custom item", icon: '<path d="M12 5v14M5 12h14" />' }
];

let activeBoatItemId = "";
let draggedBoatItemId = "";
let draggedBoatEquipmentId = "";
let boatSaveTimer = null;
let boatSaveRevision = 0;
let boatEquipmentPreviewUrl = "";

function boatType(type) {
  return BOAT_GEAR_TYPES.find((item) => item.type === type) || BOAT_GEAR_TYPES[BOAT_GEAR_TYPES.length - 1];
}

function boatIconMarkup(type) {
  return `<span class="boat-equipment-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${boatType(type).icon}</svg></span>`;
}

function boatLayout() {
  state.settings.boatLayout = normalizeBoatLayout(state.settings.boatLayout);
  return state.settings.boatLayout;
}

function boatEquipmentById(id) {
  return boatLayout().equipment.find((item) => item.id === id) || null;
}

function boatPlacementEquipment(placement) {
  return boatEquipmentById(placement?.equipmentId);
}

function boatEquipmentPhotoMarkup(equipment, className = "") {
  const source = previewImage(equipment);
  if (!source) return "";
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="">`;
}

function boatSlotDescription(slot) {
  return boatLayoutPosition(slot);
}

function adjacentBoatSlot(slot, direction) {
  const point = BOAT_SLOT_POINTS[slot];
  if (!point) return -1;
  const offsets = {
    up: { row: -1, column: 0 },
    down: { row: 1, column: 0 },
    left: { row: 0, column: -1 },
    right: { row: 0, column: 1 }
  };
  const offset = offsets[direction];
  if (!offset) return -1;
  return BOAT_SLOT_POINTS.findIndex((candidate) => (
    candidate.row === point.row + offset.row
    && candidate.column === point.column + offset.column
  ));
}

function setBoatSaveStatus(message, className = "") {
  const status = document.querySelector("#boatSaveStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-saving", className === "is-saving");
  status.classList.toggle("is-error", className === "is-error");
}

function queueBoatSave() {
  window.clearTimeout(boatSaveTimer);
  const revision = ++boatSaveRevision;
  setBoatSaveStatus("Saving…", "is-saving");
  boatSaveTimer = window.setTimeout(async () => {
    try {
      await saveState();
      if (revision === boatSaveRevision) setBoatSaveStatus("Saved");
    } catch (error) {
      console.error("Could not save boat layout.", error);
      if (revision === boatSaveRevision) setBoatSaveStatus("Save failed", "is-error");
    }
  }, 220);
}

function renderBoatEquipmentLibrary() {
  const layout = boatLayout();
  const container = document.querySelector("#boatEquipmentLibrary");
  const isFull = layout.items.length >= BOAT_SLOT_COUNT;
  document.querySelector("#boatItemCount").textContent = `${layout.items.length} of ${BOAT_SLOT_COUNT} on deck`;

  if (!layout.equipment.length) {
    container.innerHTML = `
      <div class="boat-library-empty">
        ${boatIconMarkup("fish-finder")}
        <div>
          <strong>No saved equipment yet</strong>
          <span>Add your first item with a name and optional photo.</span>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = layout.equipment.map((equipment) => {
    const placedCount = layout.items.filter((item) => item.equipmentId === equipment.id).length;
    const type = boatType(equipment.type);
    return `
      <article
        class="boat-library-card"
        data-boat-equipment-id="${escapeHtml(equipment.id)}"
        draggable="${isFull ? "false" : "true"}"
        title="Drag ${escapeHtml(equipment.name)} onto an open quick-connect point"
      >
        <div class="boat-library-photo">
          ${boatEquipmentPhotoMarkup(equipment, "boat-library-image") || boatIconMarkup(equipment.type)}
        </div>
        <div class="boat-library-copy">
          <strong title="${escapeHtml(equipment.name)}">${escapeHtml(equipment.name)}</strong>
          <span>${escapeHtml(type.label)}${placedCount ? ` · ${placedCount} on deck` : ""} · Drag to a deck dot</span>
        </div>
        <div class="boat-library-card-actions">
          <button class="button primary" type="button" data-add-boat-equipment="${escapeHtml(equipment.id)}" ${isFull ? "disabled" : ""}>Add to deck</button>
          <button class="button secondary" type="button" data-edit-boat-equipment="${escapeHtml(equipment.id)}" aria-label="Edit ${escapeHtml(equipment.name)}">Edit</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderBoatSlots() {
  const layout = boatLayout();
  const itemsBySlot = new Map(layout.items.map((item) => [item.slot, item]));
  const slots = [];

  for (let slot = 0; slot < BOAT_SLOT_COUNT; slot += 1) {
    const item = itemsBySlot.get(slot);
    const equipment = boatPlacementEquipment(item);
    const selected = item?.id === activeBoatItemId;
    const description = boatSlotDescription(slot);
    const point = BOAT_SLOT_POINTS[slot];
    const name = equipment?.name || "Equipment";
    slots.push(`
      <button
        class="boat-deck-slot ${item ? "is-occupied" : ""} ${selected ? "is-selected" : ""}"
        type="button"
        data-boat-slot="${slot}"
        style="--boat-slot-column:${point.column + 1};--boat-slot-row:${point.row + 1}"
        ${item ? `data-boat-item-id="${escapeHtml(item.id)}" draggable="true"` : ""}
        aria-label="${item ? `${escapeHtml(name)}, ${description}` : `Open quick-connect point, ${description}`}"
        aria-pressed="${selected ? "true" : "false"}"
      >
        ${item ? `
          <span class="boat-gear-item" data-boat-type="${escapeHtml(equipment?.type || "custom")}">
            ${boatEquipmentPhotoMarkup(equipment, "boat-gear-photo") || boatIconMarkup(equipment?.type || "custom")}
            <span class="boat-gear-label">${escapeHtml(name)}</span>
          </span>
        ` : ""}
      </button>
    `);
  }

  document.querySelector("#boatSlotGrid").innerHTML = slots.join("");
  document.querySelector("#boatLayoutEmpty").classList.toggle("hidden", layout.items.length > 0);
}

function renderBoatInspector() {
  const layout = boatLayout();
  const item = layout.items.find((entry) => entry.id === activeBoatItemId);
  const equipment = boatPlacementEquipment(item);
  const empty = document.querySelector("#boatInspectorEmpty");
  const editor = document.querySelector("#boatInspectorEditor");
  const list = document.querySelector("#boatEquipmentList");

  if (!item || !equipment) activeBoatItemId = "";
  empty.classList.toggle("hidden", Boolean(item && equipment));
  editor.classList.toggle("hidden", !item || !equipment);

  if (item && equipment) {
    document.querySelector("#boatSelectedEquipment").innerHTML = `
      <div class="boat-selected-photo">
        ${boatEquipmentPhotoMarkup(equipment, "boat-selected-image") || boatIconMarkup(equipment.type)}
      </div>
      <div>
        <strong>${escapeHtml(equipment.name)}</strong>
        <span>${escapeHtml(boatType(equipment.type).label)} · ${escapeHtml(boatSlotDescription(item.slot))}</span>
      </div>
    `;

    document.querySelectorAll("[data-boat-move]").forEach((button) => {
      button.disabled = adjacentBoatSlot(item.slot, button.dataset.boatMove) < 0;
    });
  }

  const orderedItems = [...layout.items].sort((a, b) => a.slot - b.slot);
  list.innerHTML = orderedItems.length ? orderedItems.map((entry) => {
    const entryEquipment = boatPlacementEquipment(entry);
    if (!entryEquipment) return "";
    return `
      <button
        class="boat-equipment-list-button ${entry.id === activeBoatItemId ? "is-selected" : ""}"
        type="button"
        data-select-boat-item="${escapeHtml(entry.id)}"
      >
        ${boatEquipmentPhotoMarkup(entryEquipment, "boat-equipment-list-image") || boatIconMarkup(entryEquipment.type)}
        <span class="boat-equipment-list-copy">
          <strong>${escapeHtml(entryEquipment.name)}</strong>
          <span>${escapeHtml(boatSlotDescription(entry.slot))}</span>
        </span>
      </button>
    `;
  }).join("") : '<p class="boat-equipment-list-empty">No equipment added yet.</p>';
}

function renderBoatLayout() {
  const layout = boatLayout();
  const nameInput = document.querySelector("#boatNameInput");
  if (document.activeElement !== nameInput) nameInput.value = layout.name;
  renderBoatEquipmentLibrary();
  renderBoatSlots();
  renderBoatInspector();
}

function firstOpenBoatSlot() {
  const occupied = new Set(boatLayout().items.map((item) => item.slot));
  for (let slot = 0; slot < BOAT_SLOT_COUNT; slot += 1) {
    if (!occupied.has(slot)) return slot;
  }
  return -1;
}

function addBoatEquipmentToDeck(equipmentId, { save = true, targetSlot = firstOpenBoatSlot() } = {}) {
  const layout = boatLayout();
  const equipment = boatEquipmentById(equipmentId);
  const slotInUse = layout.items.some((item) => item.slot === targetSlot);
  if (!equipment || targetSlot < 0 || targetSlot >= BOAT_SLOT_COUNT || slotInUse) {
    if (targetSlot < 0 || layout.items.length >= BOAT_SLOT_COUNT) {
      setBoatSaveStatus("Deck is full", "is-error");
    } else if (slotInUse) {
      setBoatSaveStatus("Choose an open quick-connect point", "is-error");
    }
    return false;
  }
  const item = { id: createId(), equipmentId: equipment.id, slot: targetSlot };
  layout.items.push(item);
  activeBoatItemId = item.id;
  renderBoatLayout();
  if (save) queueBoatSave();
  return true;
}

function moveBoatItem(itemId, targetSlot) {
  const layout = boatLayout();
  const item = layout.items.find((entry) => entry.id === itemId);
  if (!item || targetSlot < 0 || targetSlot >= BOAT_SLOT_COUNT || item.slot === targetSlot) return;
  const target = layout.items.find((entry) => entry.slot === targetSlot);
  if (target) target.slot = item.slot;
  item.slot = targetSlot;
  activeBoatItemId = item.id;
  renderBoatLayout();
  queueBoatSave();
}

function moveActiveBoatItem(direction) {
  const item = boatLayout().items.find((entry) => entry.id === activeBoatItemId);
  if (!item) return;
  const targetSlot = adjacentBoatSlot(item.slot, direction);
  if (targetSlot >= 0) moveBoatItem(item.id, targetSlot);
}

function boatItemTripReferenceCount(itemId) {
  return state.trips.reduce((total, trip) => (
    total + (trip.gearUsed || []).filter((line) => line.boatItemId === itemId).length
  ), 0);
}

function removeActiveBoatItem() {
  const layout = boatLayout();
  const index = layout.items.findIndex((item) => item.id === activeBoatItemId);
  if (index < 0) return;
  const referenceCount = boatItemTripReferenceCount(activeBoatItemId);
  if (referenceCount) {
    alert(`This deck item is linked to ${referenceCount} trip setup line${referenceCount === 1 ? "" : "s"}. Unlink it from those trips before removing it.`);
    return;
  }
  layout.items.splice(index, 1);
  activeBoatItemId = "";
  renderBoatLayout();
  queueBoatSave();
}

function clearBoatEquipmentPreviewUrl() {
  if (boatEquipmentPreviewUrl) URL.revokeObjectURL(boatEquipmentPreviewUrl);
  boatEquipmentPreviewUrl = "";
}

function renderBoatEquipmentImagePreview(equipment = null, file = null) {
  clearBoatEquipmentPreviewUrl();
  const container = document.querySelector("#boatEquipmentImagePreview");
  let source = previewImage(equipment);
  if (file) {
    boatEquipmentPreviewUrl = URL.createObjectURL(file);
    source = boatEquipmentPreviewUrl;
  }
  container.classList.toggle("hidden", !source);
  container.innerHTML = source ? `<img src="${escapeHtml(source)}" alt="Equipment preview">` : "";
}

function openBoatEquipmentDialog(equipment = null) {
  const editing = Boolean(equipment);
  const dialog = document.querySelector("#boatEquipmentDialog");
  document.querySelector("#boatEquipmentForm").reset();
  document.querySelector("#boatEquipmentDialogTitle").textContent = editing ? "Edit Boat Equipment" : "Add Boat Equipment";
  document.querySelector("#editingBoatEquipmentId").value = equipment?.id || "";
  document.querySelector("#boatEquipmentName").value = equipment?.name || "";
  document.querySelector("#boatEquipmentType").innerHTML = BOAT_GEAR_TYPES.map((item) => (
    `<option value="${item.type}" ${item.type === equipment?.type ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  )).join("");
  document.querySelector("#boatEquipmentImage").value = "";
  document.querySelector("#addBoatEquipmentToDeckRow").classList.toggle("hidden", editing);
  document.querySelector("#addBoatEquipmentToDeck").checked = !editing;
  document.querySelector("#deleteBoatEquipmentButton").classList.toggle("hidden", !editing);
  renderBoatEquipmentImagePreview(equipment);
  dialog.showModal();
  document.querySelector("#boatEquipmentName").focus();
}

async function saveBoatEquipment(event) {
  event.preventDefault();
  const layout = boatLayout();
  const editingId = document.querySelector("#editingBoatEquipmentId").value;
  const existing = layout.equipment.find((item) => item.id === editingId) || {};
  const name = document.querySelector("#boatEquipmentName").value.trim();
  if (!name) return;

  try {
    const imageFile = document.querySelector("#boatEquipmentImage").files[0];
    const uploadedImage = imageFile
      ? await uploadImageFile(imageFile, "boat-equipment", { caption: name })
      : null;
    const equipment = {
      id: editingId || createId(),
      type: boatType(document.querySelector("#boatEquipmentType").value).type,
      name: name.slice(0, 50),
      ...imageFields(uploadedImage, existing)
    };
    const index = layout.equipment.findIndex((item) => item.id === equipment.id);
    if (index >= 0) layout.equipment[index] = equipment;
    else layout.equipment.push(equipment);

    if (!editingId && document.querySelector("#addBoatEquipmentToDeck").checked) {
      addBoatEquipmentToDeck(equipment.id, { save: false });
    }

    await saveState();
    setBoatSaveStatus("Saved");
    clearBoatEquipmentPreviewUrl();
    document.querySelector("#boatEquipmentDialog").close();
    renderBoatLayout();
  } catch (error) {
    console.error("Could not save boat equipment.", error);
    alert(error.message || "The equipment could not be saved.");
  }
}

async function deleteBoatEquipment() {
  const layout = boatLayout();
  const equipmentId = document.querySelector("#editingBoatEquipmentId").value;
  const equipment = layout.equipment.find((item) => item.id === equipmentId);
  if (!equipment) return;
  const placedItems = layout.items.filter((item) => item.equipmentId === equipmentId);
  const referenceCount = placedItems.reduce((total, item) => total + boatItemTripReferenceCount(item.id), 0);
  if (referenceCount) {
    alert(`${equipment.name} is linked to ${referenceCount} trip setup line${referenceCount === 1 ? "" : "s"}. Unlink it from those trips before deleting it.`);
    return;
  }
  const placedCount = placedItems.length;
  const detail = placedCount ? ` This will also remove ${placedCount} placement${placedCount === 1 ? "" : "s"} from the deck.` : "";
  if (!window.confirm(`Delete ${equipment.name}?${detail}`)) return;

  layout.equipment = layout.equipment.filter((item) => item.id !== equipmentId);
  layout.items = layout.items.filter((item) => item.equipmentId !== equipmentId);
  activeBoatItemId = "";
  await saveState();
  clearBoatEquipmentPreviewUrl();
  document.querySelector("#boatEquipmentDialog").close();
  renderBoatLayout();
}

function bindBoatLayoutEvents() {
  document.querySelector("#newBoatEquipmentButton")?.addEventListener("click", () => openBoatEquipmentDialog());
  document.querySelector("#boatEquipmentForm")?.addEventListener("submit", saveBoatEquipment);
  document.querySelector("#deleteBoatEquipmentButton")?.addEventListener("click", () => {
    deleteBoatEquipment().catch((error) => alert(error.message || "The equipment could not be deleted."));
  });
  document.querySelector("#boatEquipmentDialog")?.addEventListener("close", clearBoatEquipmentPreviewUrl);
  document.querySelector("#boatEquipmentImage")?.addEventListener("change", (event) => {
    const existing = boatEquipmentById(document.querySelector("#editingBoatEquipmentId").value);
    renderBoatEquipmentImagePreview(existing, event.target.files[0]);
  });

  document.querySelector("#boatEquipmentLibrary")?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-boat-equipment]");
    if (editButton) {
      openBoatEquipmentDialog(boatEquipmentById(editButton.dataset.editBoatEquipment));
      return;
    }
    const addButton = event.target.closest("[data-add-boat-equipment]");
    if (addButton) addBoatEquipmentToDeck(addButton.dataset.addBoatEquipment);
  });

  document.querySelector("#boatEquipmentLibrary")?.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-boat-equipment-id]");
    if (!card || event.target.closest("button")) {
      event.preventDefault();
      return;
    }
    draggedBoatEquipmentId = card.dataset.boatEquipmentId;
    draggedBoatItemId = "";
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", draggedBoatEquipmentId);
    card.classList.add("is-dragging");
  });

  document.querySelector("#boatEquipmentLibrary")?.addEventListener("dragend", (event) => {
    event.target.closest("[data-boat-equipment-id]")?.classList.remove("is-dragging");
    draggedBoatEquipmentId = "";
    document.querySelectorAll(".boat-deck-slot.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  });

  document.querySelector("#boatSlotGrid")?.addEventListener("click", (event) => {
    const slot = event.target.closest("[data-boat-slot]");
    if (!slot) return;
    const itemId = slot.dataset.boatItemId;
    if (itemId) {
      activeBoatItemId = itemId;
      renderBoatSlots();
      renderBoatInspector();
      return;
    }
    if (activeBoatItemId) moveBoatItem(activeBoatItemId, Number(slot.dataset.boatSlot));
  });

  document.querySelector("#boatSlotGrid")?.addEventListener("dragstart", (event) => {
    const slot = event.target.closest("[data-boat-item-id]");
    if (!slot) return;
    draggedBoatItemId = slot.dataset.boatItemId;
    draggedBoatEquipmentId = "";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedBoatItemId);
  });

  document.querySelector("#boatSlotGrid")?.addEventListener("dragover", (event) => {
    const slot = event.target.closest("[data-boat-slot]");
    const canMoveItem = Boolean(draggedBoatItemId);
    const canAddEquipment = Boolean(draggedBoatEquipmentId && !slot?.dataset.boatItemId);
    if (!slot || (!canMoveItem && !canAddEquipment)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canMoveItem ? "move" : "copy";
    document.querySelectorAll(".boat-deck-slot.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    slot.classList.add("is-drop-target");
  });

  document.querySelector("#boatSlotGrid")?.addEventListener("dragleave", (event) => {
    event.target.closest("[data-boat-slot]")?.classList.remove("is-drop-target");
  });

  document.querySelector("#boatSlotGrid")?.addEventListener("drop", (event) => {
    const slot = event.target.closest("[data-boat-slot]");
    if (!slot) return;
    event.preventDefault();
    const targetSlot = Number(slot.dataset.boatSlot);
    if (draggedBoatItemId) moveBoatItem(draggedBoatItemId, targetSlot);
    else if (draggedBoatEquipmentId) addBoatEquipmentToDeck(draggedBoatEquipmentId, { targetSlot });
    draggedBoatItemId = "";
    draggedBoatEquipmentId = "";
  });

  document.querySelector("#boatSlotGrid")?.addEventListener("dragend", () => {
    draggedBoatItemId = "";
    draggedBoatEquipmentId = "";
    document.querySelectorAll(".boat-deck-slot.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  });

  document.querySelector("#boatEquipmentList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-boat-item]");
    if (!button) return;
    activeBoatItemId = button.dataset.selectBoatItem;
    renderBoatSlots();
    renderBoatInspector();
  });

  document.querySelector("#boatNameInput")?.addEventListener("input", (event) => {
    boatLayout().name = event.target.value.slice(0, 50);
    queueBoatSave();
  });

  document.querySelector("#editBoatEquipmentButton")?.addEventListener("click", () => {
    const placement = boatLayout().items.find((item) => item.id === activeBoatItemId);
    const equipment = boatPlacementEquipment(placement);
    if (equipment) openBoatEquipmentDialog(equipment);
  });

  document.querySelector(".boat-move-controls")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-boat-move]");
    if (button) moveActiveBoatItem(button.dataset.boatMove);
  });

  document.querySelector("#removeBoatItemButton")?.addEventListener("click", removeActiveBoatItem);

  document.querySelector("#clearBoatLayoutButton")?.addEventListener("click", () => {
    const layout = boatLayout();
    const referenceCount = layout.items.reduce((total, item) => total + boatItemTripReferenceCount(item.id), 0);
    if (referenceCount) {
      alert(`Your deck has ${referenceCount} linked trip setup line${referenceCount === 1 ? "" : "s"}. Unlink those items before clearing the layout.`);
      return;
    }
    if (!layout.items.length || !window.confirm("Remove every item from this boat layout? Your equipment library will be kept.")) return;
    layout.items = [];
    activeBoatItemId = "";
    renderBoatLayout();
    queueBoatSave();
  });
}

bindBoatLayoutEvents();
