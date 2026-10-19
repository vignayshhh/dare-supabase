import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 10_000 });
}

async function openMenu(page: Page) {
  await page.locator("button.messaging-header-action").click();
}

test("chat menu opens Games and temporary-invite surfaces without writing", async ({ page }) => {
  test.setTimeout(45_000);
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await openConversation(page, "DARE QA B");

  await openMenu(page);
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await expect(page.getByText("Pick a game", { exact: true })).toBeVisible();
  await expect(page.getByText("This Or That", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible();

  await openMenu(page);
  await page.getByRole("button", { name: "Invite friend", exact: true }).click();
  await expect(page.getByText("Temporary access", { exact: true })).toBeVisible();
  await expect(page.locator('input[placeholder="Search friends"]')).toBeVisible();
  await page.getByRole("button", { name: "Close invite friend", exact: true }).click();
  await expect(page.getByText("Temporary access", { exact: true })).toBeHidden();
});
