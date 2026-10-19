import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";
import { openDramaSection } from "./drama-navigation";

const rumourPrefix = "DARE-QA-20261014-cardtypes4-rumour-";
const reply = `DARE-QA-${qa.runId}-rumour-reply-${Date.now()}`;

async function openRumour(page: import("@playwright/test").Page) {
  await openDramaSection(page, "Rumours");
  const card = page.locator("article").filter({ hasText: rumourPrefix }).last();
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}

test("B's Rumour reply persists after reload", async ({ page }) => {
  test.skip(!qa.writeEnabled || !qa.dramaWriteEnabled, "Requires the authorized drama fixture gate.");
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  let card = await openRumour(page);
  await card.getByRole("button", { name: "Open replies", exact: true }).click();
  await page.getByPlaceholder("Add a reply...").fill(reply);
  const response = page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/drama\/[^/]+\/update$/.test(new URL(r.url()).pathname));
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  expect((await response).status()).toBe(200);
  await page.reload();
  card = await openRumour(page);
  await card.getByRole("button", { name: "Open replies", exact: true }).click();
  await expect(page.getByText(reply, { exact: true }).last()).toBeVisible({ timeout: 30_000 });
});
