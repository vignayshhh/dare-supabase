import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-${Date.now()}-delete-for-me`;

async function openChat(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 15_000 });
}

test("A hides B's fresh message only for A and keeps B's durable copy", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.messageWriteEnabled, "Requires explicit bounded message-write gates.");
  test.setTimeout(90_000);
  const a = await browser.newContext(); const b = await browser.newContext();
  const pageA = await a.newPage(); const pageB = await b.newPage();
  try {
    await signIn(pageA, "A"); await completeOnboardingIfShown(pageA); await openChat(pageA, "DARE QA B");
    await signIn(pageB, "B"); await completeOnboardingIfShown(pageB); await openChat(pageB, "DARE QA A");
    await pageB.locator('textarea[placeholder="Message..."]').fill(marker);
    await pageB.getByRole("button", { name: "Send message" }).click();
    const bubbleA = pageA.locator("[data-message-id]").filter({ hasText: marker });
    await expect(bubbleA).toBeVisible({ timeout: 15_000 });
    await bubbleA.dispatchEvent("contextmenu");
    const hideResponse = pageA.waitForResponse((response) =>
      response.url().includes("/rest/v1/rpc/hide_message_for_me"),
    );
    await pageA.getByRole("button", { name: "Delete for me", exact: true }).click();
    const hide = await hideResponse;
    expect(hide.ok(), await hide.text()).toBeTruthy();
    await expect(bubbleA).toHaveCount(0);
    await expect(pageB.locator("[data-message-id]").filter({ hasText: marker })).toBeVisible();
    await pageA.reload(); await openChat(pageA, "DARE QA B");
    await expect(pageA.locator("[data-message-id]").filter({ hasText: marker })).toHaveCount(0);
    await pageB.reload(); await openChat(pageB, "DARE QA A");
    await expect(pageB.locator("[data-message-id]").filter({ hasText: marker })).toBeVisible();
  } finally { await b.close(); await a.close(); }
});
