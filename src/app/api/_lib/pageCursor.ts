import "server-only";

export type PageCursor = { value: string | number | boolean; id: string };

export function encodePageCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePageCursor(raw: string | null): PageCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<PageCursor>;
    const value = parsed.value;
    if (!((typeof value === "string" && value.length > 0) || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") || typeof parsed.id !== "string" || !parsed.id) return null;
    return { value, id: parsed.id };
  } catch {
    const legacy = Number(raw) || Date.parse(raw);
    return Number.isFinite(legacy) ? { value: new Date(legacy).toISOString(), id: "" } : null;
  }
}
