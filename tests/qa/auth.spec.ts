import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test.describe("QA account access", () => {
  for (const account of ["A", "B", "C"] as const) {
    test(`${account} can establish an isolated authenticated session`, async ({ page }) => {
      await signIn(page, account);
      await completeOnboardingIfShown(page);
      await expect(page.getByText("Invalid email or password.")).toHaveCount(0);
      await expect(page.getByText("Make your entrance", { exact: true })).toHaveCount(0);
      await expect(page.locator('input[name="email"]')).toHaveCount(0);
    });
  }
});
