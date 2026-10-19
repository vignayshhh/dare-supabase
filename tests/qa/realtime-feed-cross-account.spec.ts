import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test("B sees A's realtime feed marker without a manual refresh", async ({ browser }) => {
  const replayMarker = process.env.DARE_QA_REALTIME_MARKER;
  test.skip(
    !replayMarker && (!qa.writeEnabled || !qa.realtimeWriteEnabled),
    "Realtime write testing requires DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_REALTIME_WRITE_ONCE=true; set DARE_QA_REALTIME_MARKER for a read-only replay.",
  );
  test.setTimeout(90_000);

  const marker = replayMarker || `DARE-QA-${qa.runId}-realtime-${Date.now()}`;
  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();
  const startedAt = Date.now();

  try {
    // B stays on the feed while A publishes in a separate authenticated context.
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await expect(pageB.getByLabel("Home", { exact: true })).toBeVisible({ timeout: 20_000 });
    const markerText = pageB.getByText(marker, { exact: false });
    if (replayMarker) {
      await expect(markerText.first()).toBeVisible({ timeout: 20_000 });
      return;
    }
    await expect(markerText).toHaveCount(0);
    await pageB.waitForTimeout(1_000);

    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    const home = pageA.getByLabel("Home", { exact: true });
    await home.dispatchEvent("pointerdown", { pointerType: "touch" });
    await pageA.waitForTimeout(550);
    await home.dispatchEvent("pointerup", { pointerType: "touch" });
    const chooser = pageA.getByRole("dialog", { name: "Choose center action" });
    await expect(chooser).toBeVisible();
    await chooser.getByRole("button", { name: "Create", exact: true }).click();
    await expect(pageA.getByText("Choose interaction", { exact: true })).toBeVisible();
    await pageA.getByText("Post to Feed", { exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "Create Post" })).toBeVisible();
    await pageA.getByPlaceholder("Add a caption...").fill(marker);
    const publishedAt = Date.now();
    const createResponse = pageA.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/posts",
      { timeout: 20_000 },
    );
    await pageA.getByRole("button", { name: /^Post/ }).click();
    expect((await createResponse).status()).toBe(200);

    await expect(markerText.first()).toBeVisible({ timeout: 30_000 });
    const observedAt = Date.now();
    const latencyMs = observedAt - publishedAt;
    expect(latencyMs).toBeGreaterThanOrEqual(0);
    console.log("QA_REALTIME_FEED_RESULT", JSON.stringify({ run: 1, marker, publicationConfirmedAt: publishedAt, observedAt, latencyMs, hostElapsedMs: observedAt - startedAt }));
  } finally {
    await accountB.close();
    await accountA.close();
  }
});

