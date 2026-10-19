import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("mobile feed composer opens with a safe initial submit state", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "This audit is specific to the requested mobile viewports.");
  await signIn(page, "A");
  await completeOnboardingIfShown(page);

  const home = page.getByLabel("Home", { exact: true });
  await expect(home).toBeVisible();
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(550);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByText("Post to Feed", { exact: true }).click();

  await expect(page.getByRole("heading", { name: "Create Post" })).toBeVisible();
  await expect(page.getByPlaceholder("Add a caption...")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Post/ })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("feed-composer.png"), fullPage: true });
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
});
