import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CachedUrl = { url: string; expiresAt: number };

const SIGN_PATH = "/storage/v1/object/sign/";

const parseSignedReference = (value: string) => {
  try {
    const parsed = new URL(value);
    const marker = parsed.pathname.indexOf(SIGN_PATH);
    if (marker < 0) return null;
    const reference = parsed.pathname.slice(marker + SIGN_PATH.length);
    const separator = reference.indexOf("/");
    if (separator <= 0 || separator >= reference.length - 1) return null;
    return {
      url: parsed,
      bucket: decodeURIComponent(reference.slice(0, separator)),
      path: decodeURIComponent(reference.slice(separator + 1)),
    };
  } catch {
    return null;
  }
};

const expiresSoon = (url: URL) => {
  const token = url.searchParams.get("token");
  if (!token) return true;
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof decoded.exp !== "number" || decoded.exp <= Math.floor(Date.now() / 1000) + 300;
  } catch {
    return true;
  }
};

/** Real Supabase Storage signed URL helper with bounded reuse cache. */
class SignedUrlService {
  private readonly signedUrlCache = new Map<string, CachedUrl>();

  async refreshStoredMediaUrl(value: string): Promise<string> {
    if (!value) return value;
    const reference = parseSignedReference(value);
    if (!reference || !expiresSoon(reference.url)) return value;
    const cacheKey = `stored:${value}`;
    const cached = this.signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .storage.from(reference.bucket)
        .createSignedUrl(reference.path, 60 * 60);
      if (error || !data?.signedUrl) return value;
      this.signedUrlCache.set(cacheKey, {
        url: data.signedUrl,
        expiresAt: Date.now() + 55 * 60 * 1000,
      });
      return data.signedUrl;
    } catch {
      return value;
    }
  }

  async getSignedDownloadURL(resourcePath: string, userId: string): Promise<string> {
    const cacheKey = `${userId}:${resourcePath}`;
    const cached = this.signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const bucket = resourcePath.startsWith("avatars/")
      ? "avatars"
      : resourcePath.startsWith("stories/")
        ? "story-media"
        : resourcePath.startsWith("messages/")
          ? "chat-media"
          : resourcePath.startsWith("dare-proofs/")
            ? "dare-proofs"
            : "post-media";
    const { data, error } = await getSupabaseBrowserClient()
      .storage.from(bucket).createSignedUrl(resourcePath, 60 * 60);
    if (error || !data?.signedUrl) {
      throw error ?? new Error("Could not create signed URL");
    }

    this.signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: Date.now() + 55 * 60 * 1000,
    });
    if (this.signedUrlCache.size > 500) {
      const oldestKey = this.signedUrlCache.keys().next().value;
      if (typeof oldestKey === "string") this.signedUrlCache.delete(oldestKey);
    }
    return data.signedUrl;
  }
}

export const signedUrlService = new SignedUrlService();
