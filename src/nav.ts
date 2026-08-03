/**
 * Address-bar input normalization. Mirrors src-tauri/src/address.rs: the
 * backend is the authority and re-validates; the frontend only guesses the
 * scheme the way real browsers do.
 */

const LOCALHOST_RE =
  /^(?:localhost|127\.0\.0\.1)(?::\d+)?$|^\[?::1\]?$|^10\.\d+\.\d+\.\d+$|^192\.168\.\d+\.\d+$|^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/;

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Adds http/https when the user typed a bare host or search terms. */
export function normalizeAddress(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (SCHEME_RE.test(trimmed)) return trimmed;
  if (LOCALHOST_RE.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

/** Display form of a URL for the address bar (no trailing slash on roots). */
export function prettyUrl(url: string): string {
  if (url === "about:blank") return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return url;
    if (u.pathname === "/" && !u.search && !u.hash) {
      return `${u.origin}`;
    }
    return url;
  } catch {
    return url;
  }
}
