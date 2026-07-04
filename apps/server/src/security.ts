import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";

import { env } from "./env.js";

const VITE_DEV_PORT = "5173";

const extraOrigins = new Set(
  env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function isAllowedOrigin(origin: string, requestHost: string | null): boolean {
  if (extraOrigins.has(origin)) return true;
  if (!requestHost) return false;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.host === requestHost) return true;

  // Vite dev server proxies /api but keeps its own port in Host/Origin.
  const requestHostname = requestHost.split(":")[0];
  return parsed.hostname === requestHostname && parsed.port === VITE_DEV_PORT;
}

function isValidToken(candidate: string): boolean {
  const expected = Buffer.from(env.NAS_TOOLS_API_TOKEN ?? "");
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Cross-origin + token guard for /api. The web app is same-origin (Vite dev
 * proxies /api), so a foreign Origin header is CSRF/DNS-rebinding surface and
 * is rejected outright. When NAS_TOOLS_API_TOKEN is set, /api additionally
 * requires `Authorization: Bearer <token>` — or `?token=` for EventSource,
 * which cannot set headers.
 */
export const securityGuard = new Elysia({ name: "security-guard" }).onRequest(
  ({ request, set }): string | undefined => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api")) return undefined;

    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin, request.headers.get("host"))) {
      set.status = 403;
      return "Forbidden: cross-origin request rejected";
    }

    if (!env.NAS_TOOLS_API_TOKEN) return undefined;

    const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
    const candidate = bearer ?? url.searchParams.get("token") ?? "";
    if (!isValidToken(candidate)) {
      set.status = 401;
      return "Unauthorized";
    }

    return undefined;
  },
);
