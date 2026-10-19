import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";
import { openDramaSection } from "./drama-navigation";

const promisePrefix = "DARE-QA-20261014-cardtypes4-promise-";
const reply = `DARE-QA-${qa.runId}-promise-reply-${Date.now()}`;
async function openPromise(page: import("@playwright/test").Page) {
  await openDramaSection(page, "Promises");
  const card = page.locator("article").filter({ hasText: promisePrefix }).last();
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}
test("B's Promise reply persists after reload", async ({ page }) => {
  test.skip(!qa.writeEnabled || !qa.dramaWriteEnabled, "Requires the authorized drama fixture gate.");
  await signIn(page, "B"); await completeOnboardingIfShown(page);
  let card = await openPromise(page);
  await card.getByRole("button", { name: "Open replies", exact: true }).click();
  await page.getByPlaceholder("Add a reply...").fill(reply);
  const response = page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/drama\/[^/]+\/update$/.test(new URL(r.url()).pathname));
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  expect((await response).status()).toBe(200);
  await page.reload(); card = await openPromise(page);
  await card.getByRole("button", { name: "Open replies", exact: true }).click();
  await expect(page.getByText(reply, { exact: true }).last()).toBeVisible({ timeout: 30_000 });
});
