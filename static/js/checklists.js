import { html, joinHtml, setHtml } from "./html.js";
import { createId } from "./app-defaults.js";
import { state } from "./app-state.js";
import { replaceChecklists } from "./actions.js";
import { els } from "./app-elements.js";
import { settingsUi } from "./settings-core.js";
import { checklistDraftFromSettings, checklistsFromDraft } from "./settings-draft.js";


export let checklistSaveTimer = null;
export let activeChecklistPointer = null;
const editingChecklistIds = new Set();

export function savedChecklists() {
  return Array.isArray(state.settings?.checklists) ? state.settings.checklists : [];
}

function checklistNameKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

function uniqueChecklistName(name, checklists) {
  const base = String(name ?? "").trim().slice(0, 60) || "New Checklist";
  const usedNames = new Set(checklists.map((checklist) => checklistNameKey(checklist.name)));
  if (!usedNames.has(checklistNameKey(base))) return base;

  for (let suffix = 2; ; suffix += 1) {
    const ending = ` (${suffix})`;
    const candidate = `${base.slice(0, 60 - ending.length).trimEnd()}${ending}`;
    if (!usedNames.has(checklistNameKey(candidate))) return candidate;
  }
}

export function checklistItemMarkup(item = {}, checklistIndex = 0, itemIndex = 0, editing = false) {
  const label = editing
    ? html`<input class="checklist-item-label" type="text" maxlength="120" value="${item.label || ""}" data-settings-draft="checklistsDraft" data-settings-bind="${checklistIndex}.items.${itemIndex}.label" placeholder="Checklist item" aria-label="Checklist item" />`
    : html`<span class="checklist-item-text">${item.label || ""}</span>`;
  return html`
    <li class="checklist-item" data-checklist-item-id="${item.id || createId()}">
      ${editing ? html`<span class="checklist-drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>` : ""}
      <input class="checklist-item-done" type="checkbox" ${item.done ? "checked" : ""} data-settings-draft="checklistsDraft" data-settings-bind="${checklistIndex}.items.${itemIndex}.done" aria-label="Mark checklist item complete" />
      ${label}
      ${editing ? html`<button class="icon-button" type="button" data-delete-checklist-item aria-label="Delete checklist item">×</button>` : ""}
    </li>
  `;
}

export function checklistCardMarkup(checklist, index, total) {
  const editing = editingChecklistIds.has(checklist.id);
  const done = checklist.items.filter((item) => item.done).length;
  const percent = checklist.items.length ? Math.round((done / checklist.items.length) * 100) : 0;
  const title = editing
    ? html`<input class="checklist-name" type="text" maxlength="60" value="${checklist.name}" data-settings-draft="checklistsDraft" data-settings-bind="${index}.name" aria-label="Checklist name" />`
    : html`<h4 class="checklist-name-display">${checklist.name}</h4>`;
  return html`
    <article class="checklist-card${editing ? " is-editing" : ""}" data-checklist-id="${checklist.id}">
      <header class="checklist-card-header">
        ${editing ? html`<span class="checklist-drag-handle checklist-card-drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>` : ""}
        <div class="checklist-title-block">
          ${title}
          <span class="checklist-progress-label">${done} of ${checklist.items.length} complete</span>
        </div>
        <div class="checklist-card-actions">
          <button class="icon-button checklist-edit-button" type="button" data-toggle-checklist-edit aria-pressed="${editing}" aria-label="${editing ? "Finish editing" : "Edit"} ${checklist.name}" title="${editing ? "Done" : "Edit checklist"}">
            ${editing
              ? html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.5" /></svg>`
              : html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.8 2.6 2.6 2.6M2.8 13.2l.8-3.1 7.1-7.1a1.8 1.8 0 0 1 2.6 2.6l-7.1 7.1-3.4.5Z" /></svg>`}
          </button>
        </div>
      </header>
      <div class="checklist-progress" aria-hidden="true"><span style="width: ${percent}%"></span></div>
      <ul class="checklist-items">${joinHtml(checklist.items.map((item, itemIndex) => checklistItemMarkup(item, index, itemIndex, editing)))}</ul>
      <footer class="checklist-card-footer">
        ${editing ? html`
          <button class="button secondary" type="button" data-add-checklist-item>Add Item</button>
          <button class="button secondary" type="button" data-reset-checklist ${done ? "" : "disabled"}>Reset Checklist</button>
          <button class="button secondary" type="button" data-duplicate-checklist>Duplicate</button>
          <button class="button danger" type="button" data-delete-checklist>Delete</button>
        ` : ""}
        <span class="checklist-save-status" role="status" aria-live="polite">Saved</span>
      </footer>
    </article>
  `;
}

export function renderChecklists({ focusChecklistId = "", focusItemId = "" } = {}) {
  if (!els.checklistList) return;
  if (!settingsUi.checklistsDraft) settingsUi.checklistsDraft = checklistDraftFromSettings(state.settings || {});
  const checklists = settingsUi.checklistsDraft;
  setHtml(els.checklistList, joinHtml(checklists.map((checklist, index) => checklistCardMarkup(checklist, index, checklists.length))));
  els.checklistsEmpty?.classList.toggle("hidden", checklists.length > 0);
  if (focusItemId) els.checklistList.querySelector(`[data-checklist-item-id="${CSS.escape(focusItemId)}"] .checklist-item-label`)?.focus();
  else if (focusChecklistId) els.checklistList.querySelector(`[data-checklist-id="${CSS.escape(focusChecklistId)}"] .checklist-name`)?.select();
}

export function currentChecklistDraft() {
  if (!settingsUi.checklistsDraft) settingsUi.checklistsDraft = checklistDraftFromSettings(state.settings || {});
  return settingsUi.checklistsDraft;
}

export function checklistsFromDraftState() {
  return checklistsFromDraft(currentChecklistDraft(), savedChecklists());
}

export function setChecklistSaveStatus(card, message, stateName = "") {
  const status = card?.querySelector(".checklist-save-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-saving", stateName === "saving");
  status.classList.toggle("is-error", stateName === "error");
}

export async function persistChecklistsDraft({ rerender = false } = {}) {
  clearTimeout(checklistSaveTimer);
  const source = checklistsFromDraftState();
  try {
    await replaceChecklists(source);
    if (rerender) renderChecklists();
    else els.checklistList?.querySelectorAll(".checklist-card").forEach((card) => setChecklistSaveStatus(card, "Saved"));
    return true;
  } catch (error) {
    console.error("Could not save checklists.", error);
    els.checklistList?.querySelectorAll(".checklist-card").forEach((card) => setChecklistSaveStatus(card, "Save failed", "error"));
    return false;
  }
}

export function queueChecklistSave(card) {
  clearTimeout(checklistSaveTimer);
  setChecklistSaveStatus(card, "Saving…", "saving");
  checklistSaveTimer = setTimeout(() => persistChecklistsDraft(), 500);
}

export function updateChecklistCardProgress(card) {
  const checklist = currentChecklistDraft().find((item) => item.id === card?.dataset.checklistId);
  const items = checklist?.items || [];
  const done = items.filter((item) => item.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  card.querySelector(".checklist-progress-label").textContent = `${done} of ${items.length} complete`;
  card.querySelector(".checklist-progress span").style.width = `${percent}%`;
  card.querySelector("[data-reset-checklist]").disabled = done === 0;
}

export async function createChecklist() {
  const checklists = currentChecklistDraft();
  const checklist = { id: createId(), name: uniqueChecklistName("New Checklist", checklists), items: [] };
  settingsUi.checklistsDraft = [...checklists, checklist];
  await replaceChecklists(checklistsFromDraftState());
  settingsUi.checklistsDraft = checklistDraftFromSettings(state.settings || {});
  editingChecklistIds.add(checklist.id);
  renderChecklists({ focusChecklistId: checklist.id });
}

export async function handleChecklistAction(event) {
  const card = event.target.closest(".checklist-card");
  if (!card) return;
  if (event.target.closest("[data-delete-checklist-item]")) {
    const checklistIndex = Number([...els.checklistList.querySelectorAll(".checklist-card")].indexOf(card));
    const itemIndex = Number([...card.querySelectorAll(".checklist-item")].indexOf(event.target.closest(".checklist-item")));
    currentChecklistDraft()[checklistIndex]?.items?.splice(itemIndex, 1);
    await replaceChecklists(checklistsFromDraftState());
    renderChecklists();
    return;
  }
  const checklists = currentChecklistDraft();
  const checklistIndex = checklists.findIndex((item) => item.id === card.dataset.checklistId);
  if (checklistIndex < 0) return;
  const checklist = checklists[checklistIndex];

  if (event.target.closest("[data-toggle-checklist-edit]")) {
    const wasEditing = editingChecklistIds.has(checklist.id);
    if (wasEditing) {
      if (!await persistChecklistsDraft()) return;
      editingChecklistIds.delete(checklist.id);
    } else {
      editingChecklistIds.add(checklist.id);
    }
    renderChecklists({ focusChecklistId: wasEditing ? "" : checklist.id });
    if (wasEditing) {
      els.checklistList.querySelector(`[data-checklist-id="${CSS.escape(checklist.id)}"] [data-toggle-checklist-edit]`)?.focus();
    }
    return;
  }

  if (event.target.closest("[data-add-checklist-item]")) {
    const itemId = createId();
    checklist.items.push({ id: itemId, label: "", done: false });
    renderChecklists({ focusItemId: itemId });
    return;
  }
  if (event.target.closest("[data-duplicate-checklist]")) {
    const copy = {
      id: createId(),
      name: uniqueChecklistName(`Copy of ${checklist.name}`, checklists),
      items: checklist.items.map((item) => ({ ...item, id: createId(), done: false }))
    };
    checklists.splice(checklistIndex + 1, 0, copy);
    await replaceChecklists(checklists);
    editingChecklistIds.add(copy.id);
    renderChecklists({ focusChecklistId: copy.id });
    return;
  }
  if (event.target.closest("[data-delete-checklist]")) {
    if (!confirm(`Delete ${checklist.name}?`)) return;
    checklists.splice(checklistIndex, 1);
    await replaceChecklists(checklists);
    editingChecklistIds.delete(checklist.id);
    renderChecklists();
    return;
  }
  if (event.target.closest("[data-reset-checklist]")) {
    if (checklist.items.some((item) => item.done) && !confirm(`Reset all completed items in ${checklist.name}?`)) return;
    checklist.items.forEach((item) => { item.done = false; });
    settingsUi.checklistsDraft = checklists;
    await replaceChecklists(checklistsFromDraftState());
    renderChecklists();
    return;
  }
}

export function clearChecklistDragState() {
  els.checklistList?.querySelectorAll(".is-dragging, .is-drag-over").forEach((element) => {
    element.classList.remove("is-dragging", "is-drag-over");
  });
}

export function checklistPointerTarget(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const item = element?.closest(".checklist-item");
  if (item) return { type: "item", element: item };
  const card = element?.closest(".checklist-card");
  return card ? { type: "checklist", element: card } : null;
}

export function moveChecklistDragSource(event) {
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

export function bindChecklistDragEvents() {
  els.checklistList?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("input, button, select, textarea")) return;
    const card = event.target.closest(".checklist-card");
    const handle = event.target.closest(".checklist-drag-handle");
    if (!card?.classList.contains("is-editing") || !handle) return;
    const item = handle.closest(".checklist-item");
    const source = item || card;
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
    if (didReorder) {
      settingsUi.checklistsDraft = [...els.checklistList.querySelectorAll(".checklist-card")].map((card) => {
        const checklist = currentChecklistDraft().find((item) => item.id === card.dataset.checklistId) || {};
        const items = [...card.querySelectorAll(".checklist-item")].map((row) => (
          (checklist.items || []).find((item) => item.id === row.dataset.checklistItemId) || {}
        ));
        return { ...checklist, items };
      });
      persistChecklistsDraft({ rerender: true }).catch((error) => console.error("Checklist reorder failed.", error));
    }
  };
  els.checklistList?.addEventListener("pointerup", finishPointerDrag);
  els.checklistList?.addEventListener("pointercancel", finishPointerDrag);
}

export function bindChecklistEvents() {
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
