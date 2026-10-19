import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("C can read the persisted approved direct Dare in the public reel", async ({ page }) => {
  test.setTimeout(60_000);

  const feedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/dares/feed",
  );
  await signIn(page, "C");
  await completeOnboardingIfShown(page);
  const feedBody = (await (await feedResponse).json()) as {
    dares?: Array<{ state?: string; proof?: { url?: string } }>;
  };
  const dares = feedBody.dares || [];
  expect(
    dares.some(
      (dare) => dare.state === "ACCEPTED_REAL" && Boolean(dare.proof?.url),
    ),
    JSON.stringify(
      dares.map((dare) => ({ state: dare.state, hasProof: Boolean(dare.proof?.url) })),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });

  const activeEntry = page.locator('[data-reel-index="0"]');
  await expect(activeEntry).toBeVisible({ timeout: 30_000 });
  await activeEntry.locator(".pop-dare-cover-card").dblclick();
  await expect
    .poll(() =>
      activeEntry.locator(".pop-dare-proof-card").evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
    )
    .toBe("auto");
  await expect
    .poll(() =>
      activeEntry.getByAltText("Dare proof", { exact: true }).evaluate(
        (element: HTMLImageElement) => element.complete && element.naturalWidth > 0,
      ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(activeEntry.locator(".pop-dare-proof-card .dare-real-btn")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        activeEntry
          .locator(".pop-dare-proof-card .dare-real-btn")
          .evaluate(
          (element) =>
            getComputedStyle(element.parentElement!.parentElement!).pointerEvents,
          ),
      { timeout: 20_000 },
    )
    .toBe("auto");
});
