import { validateSupabaseMediaUrl } from "../mediaUrl";

describe("validateSupabaseMediaUrl", () => {
  it("accepts signed media URLs from a Supabase project", () => {
    const url =
      "https://wpbcaiotyxgkuxbcwqda.supabase.co/storage/v1/object/sign/post-media/feed-media/user/file.webp?token=test";

    expect(validateSupabaseMediaUrl(url)).toBe(url);
  });

  it("rejects insecure and lookalike hosts", () => {
    expect(() =>
      validateSupabaseMediaUrl(
        "https://wpbcaiotyxgkuxbcwqda.supabase.co.attacker.example/file.webp",
      ),
    ).toThrow("bad media url");
    expect(() =>
      validateSupabaseMediaUrl(
        "http://wpbcaiotyxgkuxbcwqda.supabase.co/file.webp",
      ),
    ).toThrow("bad media url");
  });
});
