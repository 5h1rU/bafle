interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

/**
 * The player's Worker: the client build, plus `/api` forwarded to Bafle over
 * a service binding. One origin for both, so the browser needs no
 * cross-origin allowances to reach the Api.
 */
export default {
  fetch(request: Request, env: { readonly ASSETS: Fetcher; readonly BAFLE: Fetcher }) {
    const { pathname } = new URL(request.url);
    return pathname.startsWith("/api") ? env.BAFLE.fetch(request) : env.ASSETS.fetch(request);
  },
};
