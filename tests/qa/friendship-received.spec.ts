import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("B sees the established A friendship in notifications", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "B");
  await completeOnboardingIfShown(page);

  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await page.getByRole("button", { name: "Open main alerts", exact: true }).click();
  const established = page.getByText(/you are now friends/i).first();
  for (let pageIndex = 0; pageIndex < 6 && !(await established.isVisible().catch(() => false)); pageIndex += 1) {
    const older = page.getByRole("button", { name: "Load older alerts", exact: true });
    await expect(older).toBeVisible({ timeout: 10_000 });
    const response = page.waitForResponse((result) => {
      const url = new URL(result.url());
      return url.pathname.endsWith("/rest/v1/alerts") && Boolean(url.searchParams.get("or"));
    });
    await older.click();
    expect((await response).status()).toBe(200);
    await expect(page.getByRole("button", { name: "Loading older alerts...", exact: true })).toHaveCount(0);
  }
  await expect(established).toBeVisible();
});
