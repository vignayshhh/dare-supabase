import "server-only";

/** Attach newly tracked Storage objects after the authoritative content row exists. */
export async function attachMediaAssetsForUrls(
  client: any,
  urls: Array<string | null | undefined>,
  referenceType: string,
  referenceId: string,
) {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin) return;
  const refs = [...new Set(urls.filter((value): value is string => typeof value === "string" && value.length > 0))];
  for (const value of refs) {
    let parsed: URL;
    try { parsed = new URL(value); } catch { continue; }
    if (parsed.origin !== origin) continue;
    const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:sign|authenticated|public)\/([^/]+)\/(.+)$/);
    if (!match) continue;
    const bucket = decodeURIComponent(match[1]);
    const objectPath = decodeURIComponent(match[2]);
    const { data } = await client.from("media_assets").select("id").eq("bucket", bucket).eq("object_path", objectPath).maybeSingle();
    if (data?.id) await client.rpc("attach_media_asset", { p_asset_id: data.id, p_reference_type: referenceType, p_reference_id: referenceId });
  }
}
