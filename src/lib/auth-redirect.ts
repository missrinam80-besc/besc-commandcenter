/** Preserve internal auth destinations without permitting protocol-relative/backslash redirects. */
export function internalAuthDestination(value: string | null, fallback: string) {
  if (!value?.startsWith("/")) return fallback;
  try {
    const base = "https://auth-return.invalid";
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
