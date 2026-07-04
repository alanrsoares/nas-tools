const TOKEN_STORAGE_KEY = "nas-tools:api-token";

/** Optional API token matching the server's NAS_TOOLS_API_TOKEN env var. */
export function getApiToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** EventSource cannot set headers; pass the token as a query param instead. */
export function withToken(url: string): string {
  const token = getApiToken();
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
