import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { circleRequestContext } from "@/lib/supabase/requestContext";

type StorageReference = { bucket: string; path: string };
const signedCache = new Map<string, { value: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string>>();

const STORAGE_SIGN_PATH = "/storage/v1/object/sign/";

const signedUrlExpiresSoon = (value: URL) => {
  const token = value.searchParams.get("token");
  if (!token) return true;
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof decoded.exp !== "number" || decoded.exp <= Math.floor(Date.now() / 1000) + 300;
  } catch {
    return true;
  }
};

/** Extract a Supabase Storage bucket/path from a previously persisted URL. */
export const parseStoredStorageReference = (value: unknown): StorageReference | null => {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(value);
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (configured && parsed.origin !== new URL(configured).origin) return null;
    const markerIndex = parsed.pathname.indexOf(STORAGE_SIGN_PATH);
    if (markerIndex < 0) return null;
    const encodedReference = parsed.pathname.slice(markerIndex + STORAGE_SIGN_PATH.length);
    const separator = encodedReference.indexOf("/");
    if (separator <= 0 || separator >= encodedReference.length - 1) return null;
    const bucket = decodeURIComponent(encodedReference.slice(0, separator));
    const path = decodeURIComponent(encodedReference.slice(separator + 1));
    return bucket && path ? { bucket, path } : null;
  } catch {
    return null;
  }
};

/** Re-sign persisted private media so links remain usable after the original expires. */
export const refreshStoredMediaUrl = async (value: unknown): Promise<string> => {
  if (typeof value !== "string" || !value) return "";
  let parsedUrl: URL;
  try { parsedUrl = new URL(value); } catch { return value; }
  if (!signedUrlExpiresSoon(parsedUrl)) return value;
  const reference = parseStoredStorageReference(value);
  if (!reference) return value;
  const scope = circleRequestContext.getStore();
  const cacheKey = `${scope?.userId || "anonymous"}:${scope?.circleId || "none"}:${reference.bucket}:${reference.path}`;
  const cached = signedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 300_000) return cached.value;
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;
  const refresh = (async () => {
    try {
      const { data, error } = await getSupabaseAdminClient().storage.from(reference.bucket).createSignedUrl(reference.path, 60 * 60);
      if (error || !data?.signedUrl) return value;
      let expiresAt = Date.now() + 60 * 60 * 1000;
      try { const token = new URL(data.signedUrl).searchParams.get("token"); const payload = token?.split(".")[1]; const exp = payload ? JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp : null; if (typeof exp === "number") expiresAt = exp * 1000; } catch { /* use requested lifetime */ }
      signedCache.set(cacheKey, { value: data.signedUrl, expiresAt });
      while (signedCache.size > 1000) signedCache.delete(signedCache.keys().next().value as string);
      return data.signedUrl;
    } catch { return value; }
    finally { inFlight.delete(cacheKey); }
  })();
  inFlight.set(cacheKey, refresh);
  return refresh;
};

