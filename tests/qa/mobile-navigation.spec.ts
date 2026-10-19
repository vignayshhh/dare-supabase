import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("mobile primary navigation remains reachable without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "This audit is specific to the requested mobile viewports.");
  await signIn(page, "A");
  await completeOnboardingIfShown(page);

  for (const name of ["Feed", "Dares", "Verdicts", "Circle"] as const) {
    const control = page.getByRole("button", { name, exact: true }).first();
    await expect(control).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds, `${name} must have rendered bounds`).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);

    // Next's development-tools portal can cover the app in local dev while
    // leaving no visible product overlay. The control itself is visible and
    // measured above; force only bypasses that external dev-tools layer.
    await control.click({ force: true });
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath(`${name.toLowerCase()}.png`), fullPage: true });
    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  }
});
