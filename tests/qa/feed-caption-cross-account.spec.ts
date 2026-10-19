import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-feed-01`;

test("B receives and renders A's persisted feed caption", async ({ page }) => {
  test.setTimeout(45_000);

  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  const feedResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/posts/feed" && response.ok(),
    { timeout: 20_000 },
  );
  await page.reload({ waitUntil: "networkidle" });
  const payload = await (await feedResponse).json();
  const items = Array.isArray(payload.items) ? payload.items : payload.posts;
  expect(items).toEqual(expect.any(Array));
  expect(items.some((item: { content?: string }) => item.content === marker)).toBe(true);
  const matches = page.getByText(marker, { exact: false });
  // The rendered caption is one paragraph containing the author prefix and
  // marker, so the marker is a substring of the accessible text node.
  await expect(matches.last()).toBeVisible({ timeout: 20_000 });
});
