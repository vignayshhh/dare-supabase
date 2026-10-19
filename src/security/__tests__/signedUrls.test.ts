import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { signedUrlService } from "@/security/signedUrls";

jest.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: jest.fn(),
}));

const signed = (exp: number) => {
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  return `https://demo.supabase.co/storage/v1/object/sign/chat-media/messages/u/photo.png?token=x.${payload}.z`;
};

describe("signed URL expiry recovery", () => {
  it("refreshes an expired stored URL once and reuses the bounded cache", async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: "fresh-url" }, error: null });
    (getSupabaseBrowserClient as jest.Mock).mockReturnValue({
      storage: { from: jest.fn().mockReturnValue({ createSignedUrl }) },
    });

    const stale = signed(Math.floor(Date.now() / 1000) - 60);
    await expect(signedUrlService.refreshStoredMediaUrl(stale)).resolves.toBe("fresh-url");
    await expect(signedUrlService.refreshStoredMediaUrl(stale)).resolves.toBe("fresh-url");
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith("messages/u/photo.png", 3600);
  });
});
