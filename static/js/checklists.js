let checklistSaveTimer = null;
let activeChecklistPointer = null;

function savedChecklists() {
  const checklists = normalizeChecklists(state.settings?.checklists);
  state.settings.checklists = checklists;
  return checklists;
}

function checklistItemMarkup(item = {}) {
  return `
    <li class="checklist-item" data-checklist-item-id="${escapeHtml(item.id || createId())}">
      <span class="checklist-drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>
      <input class="checklist-item-done" type="checkbox" ${item.done ? "checked" : ""} aria-label="Mark checklist item complete" />
      <input class="checklist-item-label" type="text" maxlength="120" value="${escapeHtml(item.label || "")}" placeholder="Checklist item" aria-label="Checklist item" />
      <button class="icon-button" type="button" data-delete-checklist-item aria-label="Delete checklist item">×</button>
    </li>
  `;
}

function checklistCardMarkup(checklist, index, total) {
  const done = checklist.items.filter((item) => item.done).length;
  const percent = checklist.items.length ? Math.round((done / checklist.items.length) * 100) : 0;
  return `
    <article class="checklist-card" data-checklist-id="${escapeHtml(checklist.id)}">
      <header class="checklist-card-header">
        <span class="checklist-drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>
        <div class="checklist-title-block">
          <input class="checklist-name" type="text" maxlength="60" value="${escapeHtml(checklist.name)}" aria-label="Checklist name" />
          <span class="checklist-progress-label">${done} of ${checklist.items.length} complete</span>
        </div>
        <div class="checklist-card-actions">
          <button class="button secondary" type="button" data-duplicate-checklist>Duplicate</button>
          <button class="button danger" type="button" data-delete-checklist>Delete</button>
        </div>
      </header>
      <div class="checklist-progress" aria-hidden="true"><span style="width: ${percent}%"></span></div>
      <ul class="checklist-items">${checklist.items.map(checklistItemMarkup).join("")}</ul>
      <footer class="checklist-card-footer">
        <button class="button secondary" type="button" data-add-checklist-item>Add Item</button>
        <button class="button secondary" type="button" data-reset-checklist ${done ? "" : "disabled"}>Reset Checklist</button>
        <span class="checklist-save-status" role="status" aria-live="polite">Saved</span>
      </footer>
    </article>
  `;
}

function renderChecklists({ focusChecklistId = "", focusItemId = "" } = {}) {
  if (!els.checklistList) return;
  const checklists = savedChecklists();
  els.checklistList.innerHTML = checklists.map((checklist, index) => checklistCardMarkup(checklist, index, checklists.length)).join("");
  els.checklistsEmpty?.classList.toggle("hidden", checklists.length > 0);
  if (focusItemId) els.checklistList.querySelector(`[data-checklist-item-id="${CSS.escape(focusItemId)}"] .checklist-item-label`)?.focus();
  else if (focusChecklistId) els.checklistList.querySelector(`[data-checklist-id="${CSS.escape(focusChecklistId)}"] .checklist-name`)?.select();
}

function checklistsFromView() {
  return [...els.checklistList?.querySelectorAll(".checklist-card") || []].map((card, checklistIndex) => ({
    id: card.dataset.checklistId || createId(),
    name: card.querySelector(".checklist-name")?.value.trim() || `Checklist ${checklistIndex + 1}`,
    items: [...card.querySelectorAll(".checklist-item")].map((item) => ({
      id: item.dataset.checklistItemId || createId(),
      label: item.querySelector(".checklist-item-label")?.value || "",
      done: item.querySelector(".checklist-item-done")?.checked === true
    }))
  }));
}

function setChecklistSaveStatus(card, message, stateName = "") {
  const status = card?.querySelector(".checklist-save-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-saving", stateName === "saving");
  status.classList.toggle("is-error", stateName === "error");
}

async function persistChecklistsFromView({ rerender = false } = {}) {
  clearTimeout(checklistSaveTimer);
  const source = checklistsFromView();
  state.settings.checklists = normalizeChecklists(source);
  try {
    await saveState();
    if (rerender) renderChecklists();
    else els.checklistList?.querySelectorAll(".checklist-card").forEach((card) => setChecklistSaveStatus(card, "Saved"));
  } catch (error) {
    console.error("Could not save checklists.", error);
    els.checklistList?.querySelectorAll(".checklist-card").forEach((card) => setChecklistSaveStatus(card, "Save failed", "error"));
  }
}

function queueChecklistSave(card) {
  clearTimeout(checklistSaveTimer);
  setChecklistSaveStatus(card, "Saving…", "saving");
  checklistSaveTimer = setTimeout(() => persistChecklistsFromView(), 500);
}

function updateChecklistCardProgress(card) {
  const items = [...card.querySelectorAll(".checklist-item")];
  const done = items.filter((item) => item.querySelector(".checklist-item-done")?.checked).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  card.querySelector(".checklist-progress-label").textContent = `${done} of ${items.length} complete`;
  card.querySelector(".checklist-progress span").style.width = `${percent}%`;
  card.querySelector("[data-reset-checklist]").disabled = done === 0;
}

async function createChecklist() {
  const checklists = normalizeChecklists(checklistsFromView());
  const checklist = { id: createId(), name: "New Checklist", items: [] };
  state.settings.checklists = [...checklists, checklist];
  await saveState();
  renderChecklists({ focusChecklistId: checklist.id });
}

async function handleChecklistAction(event) {
  const card = event.target.closest(".checklist-card");
  if (!card) return;
  state.settings.checklists = normalizeChecklists(checklistsFromView());
  const checklists = state.settings.checklists;
  const checklistIndex = checklists.findIndex((item) => item.id === card.dataset.checklistId);
  if (checklistIndex < 0) return;
  const checklist = checklists[checklistIndex];

  if (event.target.closest("[data-add-checklist-item]")) {
    const itemId = createId();
    card.querySelector(".checklist-items").insertAdjacentHTML("beforeend", checklistItemMarkup({ id: itemId }));
    updateChecklistCardProgress(card);
    card.querySelector(`[data-checklist-item-id="${CSS.escape(itemId)}"] .checklist-item-label`)?.focus();
    return;
  }
  if (event.target.closest("[data-duplicate-checklist]")) {
    const copy = {
      id: createId(),
      name: `Copy of ${checklist.name}`.slice(0, 60),
      items: checklist.items.map((item) => ({ ...item, id: createId(), done: false }))
    };
    checklists.splice(checklistIndex + 1, 0, copy);
    state.settings.checklists = normalizeChecklists(checklists);
    await saveState();
    renderChecklists({ focusChecklistId: copy.id });
    return;
  }
  if (event.target.closest("[data-delete-checklist]")) {
    if (!confirm(`Delete ${checklist.name}?`)) return;
    checklists.splice(checklistIndex, 1);
    state.settings.checklists = checklists;
    await saveState();
    renderChecklists();
    return;
  }
  if (event.target.closest("[data-reset-checklist]")) {
    if (checklist.items.some((item) => item.done) && !confirm(`Reset all completed items in ${checklist.name}?`)) return;
    checklist.items.forEach((item) => { item.done = false; });
    await saveState();
    renderChecklists();
    return;
  }
  const itemNode = event.target.closest(".checklist-item");
  const itemIndex = itemNode ? checklist.items.findIndex((item) => item.id === itemNode.dataset.checklistItemId) : -1;
  if (itemIndex < 0) return;
  if (event.target.closest("[data-delete-checklist-item]")) {
    checklist.items.splice(itemIndex, 1);
  } else {
    return;
  }
  state.settings.checklists = checklists;
  await saveState();
  renderChecklists();
}

function clearChecklistDragState() {
  els.checklistList?.querySelectorAll(".is-dragging, .is-drag-over").forEach((element) => {
    element.classList.remove("is-dragging", "is-drag-over");
  });
}

function checklistPointerTarget(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const item = element?.closest(".checklist-item");
  if (item) return { type: "item", element: item };
  const card = element?.closest(".checklist-card");
  return card ? { type: "checklist", element: card } : null;
}

function moveChecklistDragSource(event) {
  const drag = activeChecklistPointer;
  const target = checklistPointerTarget(event);
  if (!drag || !target || drag.type !== target.type || drag.source === target.element) return;
  if (drag.type === "item" && drag.source.closest(".checklist-card") !== target.element.closest(".checklist-card")) return;

  const bounds = target.element.getBoundingClientRect();
  const insertAfter = event.clientY > bounds.top + bounds.height / 2;
  const insertionPoint = insertAfter ? target.element.nextElementSibling : target.element;
  if (insertionPoint !== drag.source) {
    target.element.parentNode.insertBefore(drag.source, insertionPoint);
    target.element.classList.add("is-drag-over");
  }
}

function bindChecklistDragEvents() {
  els.checklistList?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("input, button, select, textarea")) return;
    const item = event.target.closest(".checklist-item");
    const card = event.target.closest(".checklist-card");
    const source = item || card;
    if (!source) return;
    activeChecklistPointer = {
      type: item ? "item" : "checklist",
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false
    };
  });
  els.checklistList?.addEventListener("pointermove", (event) => {
    const drag = activeChecklistPointer;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    if (!drag.active) {
      drag.active = true;
      drag.source.classList.add("is-dragging");
    }
    event.preventDefault();
    clearChecklistDragState();
    drag.source.classList.add("is-dragging");
    moveChecklistDragSource(event);
  });
  const finishPointerDrag = (event) => {
    const drag = activeChecklistPointer;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const didReorder = drag.active;
    activeChecklistPointer = null;
    clearChecklistDragState();
    if (didReorder) persistChecklistsFromView({ rerender: true }).catch((error) => console.error("Checklist reorder failed.", error));
  };
  els.checklistList?.addEventListener("pointerup", finishPointerDrag);
  els.checklistList?.addEventListener("pointercancel", finishPointerDrag);
}

function bindChecklistEvents() {
  els.newChecklistButton?.addEventListener("click", () => createChecklist().catch((error) => alert(error.message || "The checklist could not be created.")));
  els.emptyNewChecklistButton?.addEventListener("click", () => createChecklist().catch((error) => alert(error.message || "The checklist could not be created.")));
  els.checklistList?.addEventListener("click", (event) => {
    handleChecklistAction(event).catch((error) => {
      console.error("Checklist action failed.", error);
      alert(error.message || "The checklist could not be updated.");
    });
  });
  els.checklistList?.addEventListener("input", (event) => {
    if (!event.target.matches(".checklist-name, .checklist-item-label")) return;
    queueChecklistSave(event.target.closest(".checklist-card"));
  });
  els.checklistList?.addEventListener("change", (event) => {
    if (!event.target.matches(".checklist-item-done")) return;
    const card = event.target.closest(".checklist-card");
    updateChecklistCardProgress(card);
    queueChecklistSave(card);
  });
  bindChecklistDragEvents();
}
