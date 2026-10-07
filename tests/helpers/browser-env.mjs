import { JSDOM } from "jsdom";

let dom;
let fetchHandler = async () => new Response("{}", { status: 200 });

function installStorage(name, storage) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    get: () => storage,
  });
}

function installWindowGlobals(window) {
  const globals = [
    "window",
    "document",
    "navigator",
    "location",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLSelectElement",
    "HTMLOptionElement",
    "HTMLTextAreaElement",
    "HTMLButtonElement",
    "HTMLFormElement",
    "HTMLCanvasElement",
    "HTMLImageElement",
    "HTMLVideoElement",
    "HTMLTemplateElement",
    "SVGElement",
    "Element",
    "Node",
    "DocumentFragment",
    "DOMParser",
    "CustomEvent",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "FormData",
    "File",
    "Blob",
    "URL",
    "URLSearchParams",
    "Headers",
    "Request",
    "Response",
  ];

  for (const name of globals) {
    if (window[name]) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: window[name],
      });
    }
  }
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
}

function installBrowserStubs(window) {
  window.matchMedia ??= () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
  window.requestAnimationFrame ??= (callback) => setTimeout(() => callback(Date.now()), 0);
  window.cancelAnimationFrame ??= (id) => clearTimeout(id);
  window.CSS ??= {};
  window.CSS.escape ??= (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");

  globalThis.matchMedia = window.matchMedia.bind(window);
  // Application code uses the host performance clock. jsdom's callback
  // timestamps have a different origin, so translate them to that same clock.
  globalThis.requestAnimationFrame = callback => window.requestAnimationFrame(() => callback(performance.now()));
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.CSS = window.CSS;
}

export function installBrowserEnv(html = "<!doctype html><html><body></body></html>") {
  dom?.window.close();
  dom = new JSDOM(html, {
    url: "http://127.0.0.1/",
    pretendToBeVisual: true,
  });
  installWindowGlobals(dom.window);
  installStorage("localStorage", dom.window.localStorage);
  installStorage("sessionStorage", dom.window.sessionStorage);
  installBrowserStubs(dom.window);
  globalThis.fetch = (...args) => fetchHandler(...args);
  return dom.window;
}

export function resetDom(html = "<!doctype html><html><body></body></html>") {
  return installBrowserEnv(html);
}

export function setFetch(handler) {
  fetchHandler = handler;
  globalThis.fetch = (...args) => fetchHandler(...args);
}

export function okJson(body = {}, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function currentWindow() {
  return dom?.window;
}
