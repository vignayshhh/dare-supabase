import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("A can inspect the authenticated public Dares reel vote surface", async ({ page }) => {
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.waitForTimeout(2_500);

  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const controls = await page.getByRole("button").allTextContents();
  console.log("QA_PUBLIC_DARES_REEL", JSON.stringify({ body: body.slice(0, 1500), controls }));
  expect(await page.getByRole("heading", { name: /This page couldn/i }).isVisible().catch(() => false)).toBe(false);
});
