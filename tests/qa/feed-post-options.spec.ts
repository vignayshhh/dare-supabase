import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-feed-01`;

async function openOptions(page: Page) {
  const post = page.locator(".feed-post-card").filter({ hasText: marker }).first();
  await expect(post).toBeVisible({ timeout: 25_000 });
  await post.getByRole("button", { name: "Post options", exact: true }).click();
}

test("post options open Prediction, Rumour, Truth, and Dare composers", async ({ page }) => {
  await signIn(page, "B");
  await completeOnboardingIfShown(page);

  await openOptions(page);
  await page.getByRole("button", { name: "Prediction", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make the call", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();

  await openOptions(page);
  await page.getByRole("button", { name: "Rumour", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Spill the tea", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();

  await openOptions(page);
  await page.getByRole("button", { name: "Ask Truth", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ask a Truth", exact: true })).toBeVisible();
  await expect(page.locator(".interaction-flow-screen:visible").getByText("DARE QA A", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();

  await openOptions(page);
  await page.getByRole("button", { name: "Give Dare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Give a Dare", exact: true })).toBeVisible();
  await expect(page.locator(".interaction-flow-screen:visible").getByText("DARE QA A", { exact: true })).toBeVisible();
});
