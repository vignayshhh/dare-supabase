import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("A can reach people search from an authenticated profile surface", async ({ page }) => {
  await signIn(page, "A");
  await completeOnboardingIfShown(page);

  // Own-profile control lives inside Circle surfaces in the authenticated shell.
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Switch Circle", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Open your profile", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Open your profile", exact: true }).click();
  const findPeople = page.getByLabel("Find people", { exact: true });
  await expect(findPeople).toBeVisible();
  await findPeople.click();
  await expect(
    page.getByPlaceholder("Search by username or display name"),
  ).toBeVisible();
});
