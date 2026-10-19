import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test.describe("feed publishing", () => {
  test.skip(
    !qa.writeEnabled || !qa.postWriteEnabled,
    "Post writes require both DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_POST_WRITE_ONCE=true in ignored .env.qa.local.",
  );

  test("A publishes one identifiable text post through the composer", async ({ page }) => {
    test.setTimeout(60_000);
    const marker = `DARE-QA-${qa.runId}-feed-01`;
    const markerText = page.getByText(marker, { exact: true });
    await signIn(page, "A");
    await completeOnboardingIfShown(page);

    const existingFeedResponse = page.waitForResponse(
      (response) => response.url().includes("/api/posts/feed") && response.status() === 200,
      { timeout: 30_000 },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    const existingFeedPayload = await (await existingFeedResponse).json();
    if (JSON.stringify(existingFeedPayload.items ?? []).includes(marker)) return;

    const home = page.getByLabel("Home", { exact: true });
    await home.dispatchEvent("pointerdown", { pointerType: "touch" });
    await page.waitForTimeout(550);
    await home.dispatchEvent("pointerup", { pointerType: "touch" });
    const chooser = page.getByRole("dialog", { name: "Choose center action" });
    await expect(chooser).toBeVisible();
    await chooser.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByText("Choose interaction", { exact: true })).toBeVisible();
    await page.getByText("Post to Feed", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create Post" })).toBeVisible();
    const post = page.getByRole("button", { name: /^Post/ });
    await expect(post).toBeDisabled();
    await page.getByPlaceholder("Add a caption...").fill(marker);
    await expect(post).toBeEnabled();
    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/posts",
      { timeout: 20_000 },
    );
    await post.click();
    await expect((await createResponse).status()).toBe(200);

    await expect(markerText.first()).toBeVisible({ timeout: 20_000 });
    // Auth, Realtime, and presence keep network connections alive, so
    // `networkidle` is not a valid persistence signal for this application.
    // Assert the authenticated feed payload after reload; the UI store can
    // paint one tick later than the response when fan-out/cache refresh runs.
    const feedResponse = page.waitForResponse(
      (response) => response.url().includes("/api/posts/feed") && response.status() === 200,
      { timeout: 30_000 },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    const feedPayload = await (await feedResponse).json();
    expect(JSON.stringify(feedPayload.items ?? [])).toContain(marker);
  });
});
