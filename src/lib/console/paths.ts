/**
 * Join a path onto the site's base path, collapsing duplicate slashes.
 * Pure and base-injectable so it can be tested without depending on how
 * `import.meta.env.BASE_URL` resolves in a given environment.
 */
export function joinBase(base: string, path: string): string {
  return `${base}/${path}`.replace(/\/{2,}/g, '/');
}

/**
 * A URL for an internal console route. The site is served under a base path
 * (`/ks-mansion` today), so root-absolute hrefs would 404 — every internal
 * console link must go through here.
 */
export function consolePath(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}
