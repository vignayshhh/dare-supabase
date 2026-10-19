import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-dare-01`;

test("B can accept an existing A-to-B QA dare", async ({ page }) => {
  test.skip(!qa.dareAcceptEnabled, "Set DARE_QA_ALLOW_DARE_ACCEPT_ONCE=true for the authorized one-shot acceptance check.");
  test.setTimeout(45_000);

  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByLabel("Notifications").click();
  await page.getByLabel("Open dare alert organizer").click();
  await page.getByText(/gave you a dare/i).first().click();

  const card = page
    .getByText(marker, { exact: true })
    .last()
    .locator("xpath=ancestor::article");
  const accept = card.getByRole("button", { name: "Accept", exact: true });
  await expect(accept).toBeVisible({ timeout: 20_000 });
  await accept.click();

  await expect(page.getByRole("dialog", { name: "Ready to prove it?" })).toBeVisible({
    timeout: 20_000,
  });
});
