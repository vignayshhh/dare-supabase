import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("mobile Feed header surface hides with its contents", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Feed", exact: true }).click({ force: true });
  const scrollSurface = page.locator(".feed-scroll-surface");
  const header = page.locator(".feed-main-header");
  await expect(scrollSurface).toBeVisible();
  await scrollSurface.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
    element.scrollTop = 720;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(header).toHaveClass(/feed-main-header--hidden/, { timeout: 5_000 });
  await expect.poll(() => header.evaluate((element) => getComputedStyle(element).backgroundColor)).toMatch(/rgba?\(0, 0, 0(?:, 0)?\)/);
  await expect
    .poll(() =>
      header.evaluate((element) => element.getBoundingClientRect().bottom),
    )
    .toBeLessThanOrEqual(1);
});
