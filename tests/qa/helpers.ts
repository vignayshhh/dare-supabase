import { expect, type Page } from "@playwright/test";
import type { QaAccount } from "./qa-env";
import { qa } from "./qa-env";

export async function dismissLaunch(page: Page) {
  await page.evaluate(() => sessionStorage.setItem("dare_intro_played", "1"));
  await page.reload({ waitUntil: "networkidle" });
}

export async function signIn(page: Page, account: QaAccount) {
  const credentials = qa.account(account);
  await page.goto("/", { waitUntil: "networkidle" });
  await dismissLaunch(page);
  if (await page.getByRole("button", { name: "Notifications", exact: true }).isVisible().catch(() => false)) {
    return;
  }
  await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByLabel("Sign in", { exact: true }).click();
  await expect
    .poll(async () => {
      const invalid = await page
        .getByText("Invalid email or password.")
        .isVisible()
        .catch(() => false);
      const onboarding = await page
        .getByText("Make your entrance", { exact: true })
        .isVisible()
        .catch(() => false);
      const authenticatedShell = await page
        .getByRole("button", { name: "Notifications", exact: true })
        .isVisible()
        .catch(() => false);
      const circleGate = await page
        .locator(".circles-screen, .circle-context-header")
        .first()
        .isVisible()
        .catch(() => false);
      return invalid || onboarding || authenticatedShell || circleGate;
    }, { timeout: 15_000 })
    .toBe(true);
  await expect(page.getByText("Invalid email or password.")).not.toBeVisible();
}

export async function completeOnboardingIfShown(page: Page) {
  const entrance = page.getByText("Make your entrance", { exact: true });
  if (!(await entrance.isVisible().catch(() => false))) return;

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const consent = page.getByText("I am 18 years or older", { exact: true });
  await expect(consent).toBeVisible();
  const continueButton = page.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  if (await continueButton.isDisabled()) {
    await consent.evaluate((element) => {
      (element.closest("button") as HTMLButtonElement | null)?.click();
    });
    await expect(continueButton).toBeEnabled();
  }
  await continueButton.click();
  await page.getByRole("button", { name: "Complete Profile", exact: true }).click();
  await expect(entrance).not.toBeVisible();
}
