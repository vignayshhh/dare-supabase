import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

const retainedMarker = /DARE-QA-20261014-chicken-fixed-chicken-out-/;

test("A sees B's persisted chicken-out state for the retained QA dare", async ({ page }) => {
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await page.getByLabel("Notifications").click();
  await page.getByLabel("Open dare alert organizer").click();
  const dareAlert = page.getByText(/completed your dare/i).first();
  await expect(dareAlert).toBeVisible({ timeout: 20_000 });
  await dareAlert.click();
  await expect(page.getByRole("navigation", { name: "Dare inbox" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Sent", exact: true }).click();
  const card = page.locator("article").filter({ hasText: retainedMarker }).last();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText(/surrendered/i)).toBeVisible({ timeout: 10_000 });
});
