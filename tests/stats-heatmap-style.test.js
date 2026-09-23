const fs = require("fs");
const assert = require("assert");

const darkCss = fs.readFileSync("static/css/theme-dark.css", "utf8");

assert.match(
  darkCss,
  /:root\[data-theme="dark"\] \.activity-heatmap-day\.activity-heatmap-level-0,[\s\S]*?background:\s*#263442;/,
  "the dark base color should apply only to level-zero day cells"
);
assert.doesNotMatch(
  darkCss,
  /:root\[data-theme="dark"\] \.activity-heatmap-day\s*\{[^}]*background:/,
  "a generic dark day background would override every heatmap intensity"
);

const levelColors = [];
for (let level = 1; level <= 5; level += 1) {
  const rule = darkCss.match(new RegExp(`:root\\[data-theme="dark"\\] \\.activity-heatmap-level-${level} \\{ background: ([^;]+); \\}`));
  assert(rule, `dark mode should define an activity color for level ${level}`);
  levelColors.push(rule[1]);
}
assert.equal(new Set(levelColors).size, 5, "each dark-mode activity level should have a distinct color");
assert.equal(levelColors[0], "#8be6b5", "fewer trips should be lighter in dark mode");
assert.equal(levelColors[4], "#1e5b43", "more trips should be darker in dark mode");

console.log("stats heatmap dark-theme tests passed");
