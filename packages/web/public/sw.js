// THE APP'S SHELL, KEPT FOR WHEN THERE IS NO NETWORK
//
// Bafle needs the network to play anything: the catalog and the sound both
// come over it. What is kept here is only the app itself, the page it opens
// with and the files that page names, so that the app added to a home screen
// starts with no network at all. It then opens on its own mark and says, in
// its own words, that it could not reach the catalog, with the way to try
// again, where a browser would have shown a page of its own saying the site
// cannot be reached.
//
// Nothing of the catalog is kept, and nothing of the sound: a request for
// either goes to the network as if this were not here.

const CACHE = "bafle-shell-v1";

/** The page every address of the app is: the app draws the rest itself. */
const SHELL = "/";

/** What the shell names besides its script and its style sheet: asked for by a home screen, or by the page. */
const SHELL_FILES = ["/manifest.webmanifest", "/favicon.svg", "/icons/monochrome.svg"];

/** How long the network is given to answer for the page before the kept one is shown. */
const PAGE_WAITS_MS = 4000;

/** The files the build names by their contents: a name never comes to mean another file. */
const isBuilt = (url) => url.pathname.startsWith("/assets/");

/** The catalog, and anything else the app asks of its own server. */
const isApi = (url) => url.pathname.startsWith("/api/");

const builtFilesIn = (html) => [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])];

/**
 * Keep the page and the files it names, and let go of the built files it no
 * longer names: each release names its files anew, and the ones before would
 * be kept for good.
 */
const keepShell = async (response) => {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const named = builtFilesIn(html);
  await cache.put(SHELL, response.clone());
  await Promise.all(
    [...named, ...SHELL_FILES].map(async (path) => {
      if ((await cache.match(path)) === undefined) {
        const file = await fetch(path, { cache: "no-cache" });
        if (file.ok) {
          await cache.put(path, file);
        }
      }
    }),
  );
  const kept = await cache.keys();
  await Promise.all(
    kept
      .filter((request) => {
        const url = new URL(request.url);
        return isBuilt(url) && !named.includes(url.pathname);
      })
      .map((request) => cache.delete(request)),
  );
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(SHELL, { cache: "no-cache" })
      .then((response) => (response.ok ? keepShell(response) : undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/**
 * The page: from the network, so that a release is seen as soon as there is
 * one, and from what is kept when the network does not answer in time.
 */
const page = async (request) => {
  const kept = await caches.match(SHELL);
  const fromNetwork = fetch(request).then((response) => {
    if (response.ok) {
      void keepShell(response.clone());
    }
    return response;
  });
  if (kept === undefined) {
    return fromNetwork;
  }
  const late = new Promise((resolve) => setTimeout(() => resolve(kept), PAGE_WAITS_MS));
  return Promise.race([fromNetwork.catch(() => kept), late]);
};

/** A built file: the one kept, or the network's, which is then kept. */
const built = async (request) => {
  const kept = await caches.match(request);
  if (kept !== undefined) {
    return kept;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

/** Any other file of the app's own: the network's, and the one kept when there is no network. */
const other = async (request) => {
  try {
    return await fetch(request);
  } catch (error) {
    const kept = await caches.match(request);
    if (kept !== undefined) {
      return kept;
    }
    throw error;
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || isApi(url)) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  event.respondWith(isBuilt(url) ? built(request) : other(request));
});
