import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-${Date.now()}-delete-everyone`;

async function openChat(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 15_000 });
}

async function visible(page: Page, text: string, timeout = 15_000) {
  await expect.poll(() => page.getByText(text, { exact: true }).count(), { timeout }).toBeGreaterThan(0);
}

test("A deletes a fresh message for everyone; B loses it live and after reload", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.messageWriteEnabled, "Requires explicit bounded message-write gates.");
  test.setTimeout(90_000);
  const a = await browser.newContext(); const b = await browser.newContext();
  const pageA = await a.newPage(); const pageB = await b.newPage();
  try {
    await signIn(pageA, "A"); await completeOnboardingIfShown(pageA); await openChat(pageA, "DARE QA B");
    await signIn(pageB, "B"); await completeOnboardingIfShown(pageB); await openChat(pageB, "DARE QA A");
    await pageA.locator('textarea[placeholder="Message..."]').fill(marker);
    await pageA.getByRole("button", { name: "Send message" }).click();
    await visible(pageA, marker); await visible(pageB, marker);
    await pageA.getByText(marker, { exact: true }).last().dispatchEvent("contextmenu");
    await expect(pageA.getByText("Message options", { exact: true })).toBeVisible();
    await pageA.getByRole("button", { name: "Delete for everyone", exact: true }).click();
    await expect.poll(() => pageB.getByText(marker, { exact: true }).count(), { timeout: 15_000 }).toBe(0);
    await pageB.reload(); await openChat(pageB, "DARE QA A");
    await expect(pageB.getByText(marker, { exact: true })).toHaveCount(0);
  } finally { await b.close(); await a.close(); }
});
