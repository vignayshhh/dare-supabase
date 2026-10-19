import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("Daily Challenge surface opens on mobile without writes", async ({ page }) => {
  await signIn(page, "A");
  await completeOnboardingIfShown(page);

  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const daily = page.getByRole("button", { name: "Daily Challenge", exact: true });
  await expect(daily).toBeVisible({ timeout: 10_000 });
  await daily.click();
  await expect(page.getByText("Daily challenge", { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("button", { name: "Can't sleep room", exact: true })).toBeVisible({ timeout: 10_000 });
});

test("Birthday Room opens from the real Dare Center long-press path", async ({ page }) => {
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  const dareLogo = page.getByLabel("Long press Dare to open Dare Center");
  await expect(dareLogo).toHaveCount(1, { timeout: 10_000 });
  await dareLogo.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(800);
  await dareLogo.dispatchEvent("pointerup", { pointerType: "touch" });
  await expect(page.getByText("Enter Dare Center?", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Enter center", exact: true }).click();
  await expect(page.getByText("Dare Center", { exact: true })).toBeVisible({ timeout: 10_000 });
  const birthdayEyebrow = page.getByText("Birthday rooms", { exact: true }).first();
  for (let index = 1; index <= 8 && !(await birthdayEyebrow.isVisible().catch(() => false)); index += 1) {
    const screenButton = page.getByRole("button", { name: `Open Dare Center screen ${index}`, exact: true });
    if (await screenButton.count()) await screenButton.click();
  }
  await expect(birthdayEyebrow).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Open Birthday Room", exact: true }).click();
  await expect(page.getByText("Birthday room", { exact: true })).toBeVisible({ timeout: 10_000 });
});
