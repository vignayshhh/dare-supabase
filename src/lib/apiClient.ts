/**
 * Minimal authenticated-fetch helper for Next.js API routes.
 *
 * Attaches the Supabase access token (Bearer), the double-submit CSRF
 * token (`x-csrf-token`), and — when Turnstile is enabled — the
 * Cloudflare Turnstile response token. Keeps callers ignorant of the
 * security pipeline so adding Turnstile later is transparent.
 *
 * Usage:
 *   await apiFetch("/api/posts/abc/like", { method: "POST" });
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createUuid } from "@/utils/uuid";
import { recordResourceMetric } from "@/lib/observability/resourceMetrics";

import { getActiveCircleId, getActiveEventId } from "@/lib/circleContext";
import { getChatSource } from "@/lib/chatContext";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

function ensureCsrfToken(): string | null {
  const existing = readCookie("csrf-token");
  if (existing || typeof document === "undefined") return existing;

  const token = createUuid();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const sameSite = window.location.protocol === "https:" ? "Strict" : "Lax";
  document.cookie = `csrf-token=${encodeURIComponent(
    token,
  )}; Path=/; Max-Age=3600; SameSite=${sameSite}${secure}`;

  return token;
}

async function waitForIdToken(): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Not signed in");
  return data.session.access_token;
}

export interface ApiFetchOptions extends RequestInit {
  /**
   * When true, will NOT throw on non-2xx; caller inspects `response.ok`.
   * Default false (throws on 4xx/5xx).
   */
  raw?: boolean;
  /**
   * Send a page-level Turnstile token with this request. Most in-app actions
   * do not need it; keeping this opt-in prevents stale challenge tokens from
   * turning normal authenticated writes into production-only 401s.
   */
  turnstile?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const circleId = getActiveCircleId();
  const chatSourceId = getChatSource()?.id;
  const eventId = getActiveEventId();
  recordResourceMetric("api_requests");
  const token = await waitForIdToken();
  const csrf = ensureCsrfToken();
  // Window.turnstile widget stashes the latest response on window; pick
  // it up if present. Ignored server-side when TURNSTILE_SECRET_KEY unset.
  const turnstile =
    opts.turnstile && typeof window !== "undefined"
      ? (window as unknown as { __turnstileToken?: string }).__turnstileToken
      : undefined;

  const headers = new Headers(opts.headers);
  if (chatSourceId && opts.method === 'POST' && /^\/api\/(dares|truth|drama)$/.test(path)) headers.set('x-chat-source-id', chatSourceId);
  if (eventId) headers.set("x-event-id", eventId);
  if (circleId) headers.set("x-circle-id", circleId);
  headers.set("Authorization", `Bearer ${token}`);
  if (csrf) headers.set("x-csrf-token", csrf);
  if (turnstile) headers.set("cf-turnstile-response", turnstile);
  if (opts.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(path, {
    ...opts,
    headers,
    credentials: "same-origin",
  });
  if (circleId !== getActiveCircleId()) throw new DOMException("Circle changed", "AbortError");
  if (opts.raw) return res as unknown as T;
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`API ${res.status} ${path}: ${detail}`);
  }
  try {
    const data = (await res.json()) as T;
    if (circleId !== getActiveCircleId()) throw new DOMException("Circle changed", "AbortError");
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return undefined as unknown as T;
  }
}
