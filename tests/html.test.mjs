import test from "node:test";
import assert from "node:assert/strict";
import { resetDom } from "./helpers/browser-env.mjs";

globalThis.__STRICT_STATE__ = true;

const { html, insertHtml, raw, safeUrl, setHtml } = await import("../static/js/html.js");

test("html escapes special characters in text and attributes", () => {
  const hostile = "&<>\"'`";
  assert.equal(String(html`<p>${hostile}</p>`), "<p>&amp;&lt;&gt;&quot;&#039;&#096;</p>");
  assert.equal(String(html`<button data-name="${hostile}">${hostile}</button>`), "<button data-name=\"&amp;&lt;&gt;&quot;&#039;&#096;\">&amp;&lt;&gt;&quot;&#039;&#096;</button>");
});

test("html renders arrays, nested SafeHtml, raw markup, and empty sentinels", () => {
  const nested = html`<strong>${"Tom's & Co."}</strong>`;
  const result = html`<div>${[nested, " <plain>", raw("<em>trusted</em>"), null, undefined, false]}</div>`;
  assert.equal(String(result), "<div><strong>Tom&#039;s &amp; Co.</strong> &lt;plain&gt;<em>trusted</em></div>");
});

test("setHtml and insertHtml require SafeHtml values", () => {
  resetDom("<!doctype html><main><section id=\"target\"></section></main>");
  const target = document.querySelector("#target");
  assert.throws(() => setHtml(target, "<p>plain</p>"), /SafeHtml/);
  setHtml(target, html`<p>${"Tom & Jerry"}</p>`);
  assert.equal(target.innerHTML, "<p>Tom &amp; Jerry</p>");
  insertHtml(target, "beforeend", html`<span>${"<ok>"}</span>`);
  assert.equal(target.querySelector("span")?.textContent, "<ok>");
});

test("safeUrl blocks scriptable data while preserving ordinary URLs", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl(" java\nscript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<svg onload=alert(1)>"), "");
  assert.equal(safeUrl("data:image/png;base64,abc"), "data:image/png;base64,abc");
  assert.equal(safeUrl("/uploads/catch.png"), "/uploads/catch.png");
  assert.equal(safeUrl("https://example.test/path?a=1"), "https://example.test/path?a=1");
});

test("gear select renderer does not create elements from hostile record ids", async () => {
  resetDom("<!doctype html><select id=\"gear\"></select>");
  const hostile = "x\"><img src=x onerror=\"alert(1)\">";
  const { setState } = await import("../static/js/app-state.js");
  const { populateGearSelect } = await import("../static/js/gear-pickers.js");
  setState({ lures: [{ id: hostile, name: "Tom's \"Blue\" & Silver" }], rods: [], reels: [], rodReelCombos: [], flashers: [] });
  const select = document.querySelector("#gear");
  populateGearSelect(select, [{ id: hostile, name: "Tom's \"Blue\" & Silver" }], hostile, "Select lure", (item) => item.name);
  assert.equal(select.querySelectorAll("img").length, 0);
  assert.equal(select.options[1].value, hostile);
  assert.equal(select.options[1].textContent, "Tom's \"Blue\" & Silver");
});
