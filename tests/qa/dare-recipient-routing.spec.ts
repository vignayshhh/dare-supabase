import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-dare-01`;

test("B can reach a received dare from its alert organizer", async ({ page }) => {
  test.setTimeout(45_000);
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByLabel("Notifications").click();
  await page.getByLabel("Open dare alert organizer").click();

  // Alert cards intentionally use the compact “gave you a dare” copy rather
  // than exposing the full dare description. The selected card supplies the
  // highlighted entity ID to the received-dare inbox.
  const alert = page.getByText(/gave you a dare/i).first();
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await alert.click();

  await expect(page.getByRole("navigation", { name: "Dare inbox" })).toBeVisible();
  const markerCard = page.getByText(marker, { exact: true }).last().locator("xpath=ancestor::article");
  await expect(markerCard).toBeVisible({
    timeout: 20_000,
  });
});
