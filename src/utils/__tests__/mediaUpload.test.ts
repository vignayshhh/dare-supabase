import { validateMediaSelection } from "@/utils/mediaUpload";

describe("media upload boundaries", () => {
  it("rejects a message image over the 100 MB input limit before upload", async () => {
    const file = { size: 100 * 1024 * 1024 + 1, type: "image/png" } as Blob;
    await expect(validateMediaSelection(file, "messages")).resolves.toEqual({
      valid: false,
      error: "File is too large. Max allowed size is 100.0 MB.",
    });
  });
});
