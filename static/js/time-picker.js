import { html, insertHtml, setHtml } from "./html.js";
import { timeFormatPreference } from "./app-units.js";

let nextTimePickerId = 0;
let activePicker = null;

function parseTime(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function localTimeNow() {
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

function displayTime({ hour, minute }) {
  const paddedMinute = String(minute).padStart(2, "0");
  if (timeFormatPreference() === "12") {
    const hour12 = hour % 12 || 12;
    return `${hour12}:${paddedMinute} ${hour < 12 ? "AM" : "PM"}`;
  }
  return `${String(hour).padStart(2, "0")}:${paddedMinute}`;
}

function displayHour(hour) {
  if (timeFormatPreference() === "12") return String(hour % 12 || 12);
  return String(hour).padStart(2, "0");
}

function fieldLabel(input) {
  return input.closest("label")?.querySelector(":scope > span")?.textContent?.trim() || "time";
}

function enhanceTimeInput(input) {
  if (input.dataset.timePickerId) return;
  const label = input.closest("label");
  if (!label) return;

  const id = `timePicker${++nextTimePickerId}`;
  const triggerId = `${id}Trigger`;
  const name = fieldLabel(input);
  label.classList.add("time-picker-field");
  input.classList.add("time-picker-native");
  input.dataset.timePickerId = id;
  input.tabIndex = -1;
  input.style.pointerEvents = "none";

  insertHtml(label, "beforeend", html`
    <button class="time-picker-trigger" id="${triggerId}" type="button" data-time-picker-trigger="${id}" aria-label="Choose ${name}" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.25"/><path d="M10 5.8v4.5l3 1.8"/></svg>
    </button>`);
}

function enhanceTimeInputs(root = document) {
  if (root instanceof Element && root.matches('input[type="time"]')) enhanceTimeInput(root);
  root.querySelectorAll?.('input[type="time"]').forEach(enhanceTimeInput);
}

function hourValues() {
  if (timeFormatPreference() === "12") {
    const period = activePicker.hour < 12 ? 0 : 12;
    return Array.from({ length: 12 }, (_, index) => (index + 1) % 12 + period);
  }
  return Array.from({ length: 24 }, (_, hour) => hour);
}

function renderPicker() {
  if (!activePicker) return;
  const { input, popover, hour, minute } = activePicker;
  const hours = hourValues();
  const hourButtons = hours.map((hourValue) => html`
    <button type="button" class="time-picker-option" data-time-hour="${hourValue}" aria-pressed="${hourValue === hour}" tabindex="${hourValue === hour ? 0 : -1}">${displayHour(hourValue)}</button>`);
  const minuteButtons = Array.from({ length: 60 }, (_, minuteValue) => html`
    <button type="button" class="time-picker-option" data-time-minute="${minuteValue}" aria-pressed="${minuteValue === minute}" tabindex="${minuteValue === minute ? 0 : -1}">${String(minuteValue).padStart(2, "0")}</button>`);
  const usesTwelveHourClock = timeFormatPreference() === "12";

  setHtml(popover, html`
    <header class="time-picker-header">
      <div><span>Choose ${fieldLabel(input).toLowerCase()}</span><strong aria-live="polite">${displayTime({ hour, minute })}</strong></div>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>
    </header>
    <div class="time-picker-columns">
      <section class="time-picker-column" aria-label="Hour">
        <h4>Hour</h4>
        <div class="time-picker-hour-list">${hourButtons}</div>
        ${usesTwelveHourClock ? html`<div class="time-picker-periods" aria-label="AM or PM">
          <button type="button" data-time-period="AM" aria-pressed="${hour < 12}" tabindex="${hour < 12 ? 0 : -1}">AM</button>
          <button type="button" data-time-period="PM" aria-pressed="${hour >= 12}" tabindex="${hour >= 12 ? 0 : -1}">PM</button>
        </div>` : ""}
      </section>
      <section class="time-picker-column" aria-label="Minute">
        <h4>Minute</h4>
        <div class="time-picker-minute-list">${minuteButtons}</div>
      </section>
    </div>
    <footer class="time-picker-footer">
      <button type="button" data-time-clear>Clear</button>
      <div><button type="button" data-time-now>Now</button><button type="button" class="time-picker-done" data-time-done>Done</button></div>
    </footer>`);

  positionPopover();
  const minuteList = popover.querySelector(".time-picker-minute-list");
  const selectedMinute = minuteList?.querySelector(`[data-time-minute="${minute}"]`);
  if (selectedMinute && minuteList) minuteList.scrollTop = selectedMinute.offsetTop - minuteList.offsetTop - (minuteList.clientHeight / 2) + (selectedMinute.clientHeight / 2);
}

function positionPopover() {
  if (!activePicker) return;
  const { input, popover } = activePicker;
  const inputRect = input.getBoundingClientRect();
  const panelRect = popover.getBoundingClientRect();
  const margin = 12;
  const left = Math.max(margin, Math.min(inputRect.left, window.innerWidth - panelRect.width - margin));
  const below = inputRect.bottom + 6;
  const above = inputRect.top - panelRect.height - 6;
  const top = below + panelRect.height <= window.innerHeight - margin || above < margin
    ? Math.min(below, window.innerHeight - panelRect.height - margin)
    : above;
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(margin, top)}px`;
}

function closePicker({ restoreFocus = false } = {}) {
  if (!activePicker) return;
  const { trigger, popover } = activePicker;
  trigger.setAttribute("aria-expanded", "false");
  popover.remove();
  activePicker = null;
  if (restoreFocus && trigger.isConnected) trigger.focus();
}

function openPicker(trigger) {
  const id = trigger.dataset.timePickerTrigger;
  const input = document.querySelector(`input[data-time-picker-id="${id}"]`);
  if (!input) return;
  if (activePicker?.trigger === trigger) {
    closePicker();
    return;
  }
  closePicker();

  const selected = parseTime(input.value) || localTimeNow();
  const popover = document.createElement("div");
  popover.className = "time-picker-popover";
  popover.id = id;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Choose ${fieldLabel(input).toLowerCase()}`);
  document.body.append(popover);
  activePicker = { id, input, trigger, popover, hour: selected.hour, minute: selected.minute };
  trigger.setAttribute("aria-expanded", "true");
  renderPicker();
  popover.querySelector(`[data-time-minute="${selected.minute}"]`)?.focus();
}

function commitTime(hour, minute) {
  if (!activePicker) return;
  const { input } = activePicker;
  input.value = hour === null ? "" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  closePicker({ restoreFocus: true });
}

function stepOption(target, delta) {
  if (!activePicker) return;
  const hourOption = target.closest("[data-time-hour]");
  const minuteOption = target.closest("[data-time-minute]");
  const periodOption = target.closest("[data-time-period]");
  if (!hourOption && !minuteOption && !periodOption) return;

  if (hourOption) {
    const hours = hourValues();
    const index = hours.indexOf(Number(hourOption.dataset.timeHour));
    activePicker.hour = hours[(index + delta + hours.length) % hours.length];
  } else if (minuteOption) {
    activePicker.minute = (Number(minuteOption.dataset.timeMinute) + delta + 60) % 60;
  } else {
    activePicker.hour = (activePicker.hour + 12) % 24;
  }
  renderPicker();
  const selector = hourOption
    ? `[data-time-hour="${activePicker.hour}"]`
    : minuteOption
      ? `[data-time-minute="${activePicker.minute}"]`
      : `[data-time-period="${activePicker.hour < 12 ? "AM" : "PM"}"]`;
  activePicker.popover.querySelector(selector)?.focus();
}

function setupTimePickerEvents() {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-time-picker-trigger]");
    if (trigger) {
      event.preventDefault();
      openPicker(trigger);
      return;
    }

    if (activePicker?.popover.contains(event.target)) {
      const hour = event.target.closest("[data-time-hour]");
      const minute = event.target.closest("[data-time-minute]");
      const period = event.target.closest("[data-time-period]");
      if (hour) activePicker.hour = Number(hour.dataset.timeHour);
      else if (minute) activePicker.minute = Number(minute.dataset.timeMinute);
      else if (period) activePicker.hour = (activePicker.hour % 12) + (period.dataset.timePeriod === "PM" ? 12 : 0);
      else if (event.target.closest("[data-time-clear]")) {
        commitTime(null, 0);
        return;
      } else if (event.target.closest("[data-time-now]")) {
        const now = localTimeNow();
        commitTime(now.hour, now.minute);
        return;
      } else if (event.target.closest("[data-time-done]")) {
        commitTime(activePicker.hour, activePicker.minute);
        return;
      } else return;

      renderPicker();
      const selector = hour
        ? `[data-time-hour="${activePicker.hour}"]`
        : minute
          ? `[data-time-minute="${activePicker.minute}"]`
          : `[data-time-period="${activePicker.hour < 12 ? "AM" : "PM"}"]`;
      activePicker.popover.querySelector(selector)?.focus();
      return;
    }

    const timeField = event.target.closest?.(".time-picker-field");
    if (timeField && !event.target.closest(".time-picker-popover")) {
      event.preventDefault();
      const fieldTrigger = timeField.querySelector("[data-time-picker-trigger]");
      if (fieldTrigger) openPicker(fieldTrigger);
      return;
    }

    if (activePicker) closePicker();
  });

  document.addEventListener("keydown", (event) => {
    if (!activePicker) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker({ restoreFocus: true });
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      const option = event.target.closest?.("[data-time-hour], [data-time-minute], [data-time-period]");
      if (option) {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -4 : 4;
        stepOption(option, delta);
      }
    }
  });

  window.addEventListener("resize", positionPopover);
  window.addEventListener("scroll", positionPopover, true);

  const observer = new MutationObserver((records) => {
    records.forEach(({ addedNodes }) => addedNodes.forEach((node) => {
      if (node instanceof Element) enhanceTimeInputs(node);
    }));
    if (activePicker && !activePicker.input.isConnected) closePicker();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function setup() {
  enhanceTimeInputs();
  setupTimePickerEvents();
}
