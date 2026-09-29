const HTML_ESCAPE_RE = /[&<>"'`]/g;
const MARKUP_LIKE_RE = /<[/!a-zA-Z]/;
const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;",
  "`": "&#096;"
};

export class SafeHtml {
  constructor(markup) {
    this.markup = String(markup ?? "");
    Object.freeze(this);
  }

  toString() {
    return this.markup;
  }

  [Symbol.toPrimitive]() {
    return this.markup;
  }

  includes(...args) {
    return this.markup.includes(...args);
  }

  match(...args) {
    return this.markup.match(...args);
  }

  matchAll(...args) {
    return this.markup.matchAll(...args);
  }

  replace(...args) {
    return this.markup.replace(...args);
  }
}

function escapeHtmlValue(value) {
  return String(value).replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPES[char]);
}

function renderValue(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(renderValue).join("");
  if (typeof __STRICT_STATE__ !== "undefined" && __STRICT_STATE__ && MARKUP_LIKE_RE.test(String(value))) {
    console.error("html: markup-like string was escaped", value);
  }
  return escapeHtmlValue(value);
}

export function html(strings, ...values) {
  if (!Array.isArray(strings) || !Object.prototype.hasOwnProperty.call(strings, "raw")) {
    throw new TypeError("html must be used as a tagged template.");
  }
  let output = "";
  strings.forEach((part, index) => {
    output += part;
    if (index < values.length) output += renderValue(values[index]);
  });
  return new SafeHtml(output);
}

export function raw(value) {
  return new SafeHtml(value);
}

export function joinHtml(items, separator = "") {
  const trustedSeparator = String(separator ?? "");
  return new SafeHtml((items || []).map(renderValue).join(trustedSeparator));
}

export function safeUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const normalized = text.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  if (normalized.startsWith("javascript:")) return "";
  if (normalized.startsWith("data:") && !normalized.startsWith("data:image/")) return "";
  return text;
}

function assertSafeHtml(template, apiName) {
  if (template instanceof SafeHtml) return template;
  // Helpers commonly return "" (or nothing) for "no markup"; that cannot inject.
  if (template === "" || template === null || template === undefined) return new SafeHtml("");
  const message = `${apiName} requires a SafeHtml value. Use the html tagged template or raw() for trusted constants.`;
  if (typeof __STRICT_STATE__ !== "undefined" && __STRICT_STATE__) {
    throw new TypeError(message);
  }
  console.error(message);
  return new SafeHtml("");
}

export function setHtml(element, template) {
  if (!element) return;
  element.innerHTML = String(assertSafeHtml(template, "setHtml"));
}

export function setOuterHtml(element, template) {
  if (!element) return;
  element.outerHTML = String(assertSafeHtml(template, "setOuterHtml"));
}

export function insertHtml(element, position, template) {
  if (!element) return;
  element.insertAdjacentHTML(position, String(assertSafeHtml(template, "insertHtml")));
}
