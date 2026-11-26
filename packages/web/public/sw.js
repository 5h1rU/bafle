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

// NOTE: the name changes when what was kept under the old one cannot be
// trusted, and everything kept under another name is let go of as this one
// takes over. `v1` could hold the app's page under the name of its script
// (`isTheFile`), and an app that had kept that never started again.
const CACHE = "bafle-shell-v2";

/** The page every address of the app is: the app draws the rest itself. */
const SHELL = "/";

/** What the shell names besides its script and its style sheet: asked for by a home screen, or by the page. */
const SHELL_FILES = ["/manifest.webmanifest", "/favicon.svg", "/favicon-dark.svg", "/icons/monochrome.svg"];

/** How long the network is given to answer for the page before the kept one is shown. */
const PAGE_WAITS_MS = 4000;

/** The files the build names by their contents: a name never comes to mean another file. */
const isBuilt = (url) => url.pathname.startsWith("/assets/");

/** The catalog, and anything else the app asks of its own server. */
const isApi = (url) => url.pathname.startsWith("/api/");

const builtFilesIn = (html) => [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])];

/**
 * Whether an answer for a built file is that file. The server answers any
 * address it has no file for with the app's page, and says it went well: in
 * the moments after a release its page already names files it does not yet
 * serve, and what comes back for them is that page. Kept under the file's
 * name, it was handed to the page as its script from then on, and the app
 * stayed on its mark for good.
 */
const isTheFile = (response) =>
  response.ok && !(response.headers.get("content-type") ?? "").includes("text/html");

/** Keep one file of the shell, unless it is kept already. Says whether it is kept now. */
const keepFile = async (cache, path) => {
  if ((await cache.match(path)) !== undefined) {
    return true;
  }
  const file = await fetch(path, { cache: "no-cache" }).catch(() => undefined);
  if (file === undefined || !isTheFile(file)) {
    return false;
  }
  await cache.put(path, file);
  return true;
};

/**
 * Keep the page and the files it names, and let go of the built files it no
 * longer names: each release names its files anew, and the ones before would
 * be kept for good.
 */
// NOTE: the page is kept only once every built file it names is. A page
// kept without its script would start nothing with no network, and the one
// kept before it, whole, still does.
const keepShell = async (response) => {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const named = builtFilesIn(html);
  const builtKept = await Promise.all(named.map((path) => keepFile(cache, path)));
  await Promise.all(SHELL_FILES.map((path) => keepFile(cache, path)));
  if (builtKept.includes(false)) {
    return;
  }
  await cache.put(SHELL, response.clone());
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
    return fromNetwork.catch(() => Response.error());
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
  const response = await fetch(request).catch(() => Response.error());
  if (isTheFile(response)) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

/** A file the shell names: the network's, and the one kept when there is no network. */
// NOTE: with neither, the answer is a network error and not a rejection. The
// page sees the same failed request either way, but a rejection handed to
// `respondWith` is also reported in the console as an error of this script's.
const shellFile = async (request) => {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(request)) ?? Response.error();
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
  if (isBuilt(url)) {
    event.respondWith(built(request));
    return;
  }
  // NOTE: nothing else of the app's own is ever kept (an icon a home screen
  // asks for, a launch picture), so there is nothing to answer it with but
  // the network: it is left to the browser, as the catalog is.
  if (SHELL_FILES.includes(url.pathname)) {
    event.respondWith(shellFile(request));
  }
});
