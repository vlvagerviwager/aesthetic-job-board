const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function asSafeHttpUrl(rawUrl: string, fallbackUrl: string): string {
  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl === "") {
    return fallbackUrl;
  }
  try {
    const parsedUrl = new URL(trimmedUrl);
    if (SAFE_URL_PROTOCOLS.has(parsedUrl.protocol) === false) {
      return fallbackUrl;
    }
    return parsedUrl.toString();
  } catch {
    return fallbackUrl;
  }
}

export function resolveBoardUrl(detailHref: string, boardUrl: string): string {
  const trimmedHref = detailHref.trim();
  if (trimmedHref === "") {
    return boardUrl;
  }
  try {
    const parsedUrl = new URL(trimmedHref, boardUrl);
    if (SAFE_URL_PROTOCOLS.has(parsedUrl.protocol) === false) {
      return boardUrl;
    }
    return parsedUrl.toString();
  } catch {
    return boardUrl;
  }
}
