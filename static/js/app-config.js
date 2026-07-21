const storageKey = "fishing-logbook-v1";
let csrfTokenPromise;

async function protectedFetch(url, options = {}, retry = true) {
  const method = String(options.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return fetch(url, options);

  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch("/api/csrf-token")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not establish request protection");
        return (await response.json()).csrfToken;
      })
      .catch((error) => {
        csrfTokenPromise = null;
        throw error;
      });
  }

  const headers = new Headers(options.headers || {});
  headers.set("X-CSRF-Token", await csrfTokenPromise);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 403 && retry) {
    csrfTokenPromise = null;
    return protectedFetch(url, options, false);
  }
  return response;
}
