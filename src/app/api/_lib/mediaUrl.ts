const MAX_MEDIA_URL_LENGTH = 2_000;
const ALLOWED_MEDIA_HOSTS = ["supabase.co"];

export function validateSupabaseMediaUrl(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("bad media url");
  }

  const mediaUrl = value.trim();
  if (!mediaUrl) return null;
  if (mediaUrl.length > MAX_MEDIA_URL_LENGTH) {
    throw new Error("media url too long");
  }

  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    throw new Error("bad media url");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("bad media url");
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_MEDIA_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
  if (!allowed) {
    throw new Error("bad media url");
  }

  return mediaUrl;
}
