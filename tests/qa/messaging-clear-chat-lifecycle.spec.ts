import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const before = `DARE-QA-${qa.runId}-${Date.now()}-clear-before`;
const after = `DARE-QA-${qa.runId}-${Date.now()}-clear-after`;

async function openChat(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 15_000 });
}

async function send(page: Page, marker: string) {
  const write = page.waitForResponse((response) =>
    response.url().includes("/rpc/send_message") &&
    !!response.request().postData()?.includes(marker),
  );
  await page.locator('textarea[placeholder="Message..."]').fill(marker);
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await write).status()).toBe(200);
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
}

test("Clear chat is private, survives reload, and permits later messages", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.messageWriteEnabled, "Requires explicit bounded message-write gates.");
  test.setTimeout(120_000);
  const a = await browser.newContext(); const b = await browser.newContext();
  const pageA = await a.newPage(); const pageB = await b.newPage();
  try {
    await signIn(pageA, "A"); await completeOnboardingIfShown(pageA);
    await signIn(pageB, "B"); await completeOnboardingIfShown(pageB);
    await openChat(pageA, "DARE QA B");
    await openChat(pageB, "DARE QA A");
    await send(pageA, before);
    await expect(pageB.getByText(before, { exact: true }).last()).toBeVisible({ timeout: 15_000 });

    pageA.once("dialog", (dialog) => dialog.accept());
    const clearWrite = pageA.waitForResponse((response) =>
      response.url().includes("/rpc/clear_conversation_for_me"),
    );
    await pageA.locator("button.messaging-header-action").click();
    await pageA.getByRole("button", { name: "Clear chat", exact: true }).click();
    const clearResponse = await clearWrite;
    expect(clearResponse.status()).toBe(204);
    await expect(pageA.getByText(before, { exact: true })).toHaveCount(0);
    await expect(pageB.getByText(before, { exact: true }).last()).toBeVisible();
    await pageA.reload();
    await openChat(pageA, "DARE QA B");
    await expect(pageA.getByText(before, { exact: true })).toHaveCount(0);
    await pageB.reload(); await openChat(pageB, "DARE QA A");
    await expect(pageB.getByText(before, { exact: true }).last()).toBeVisible();

    await send(pageA, after);
    await expect(pageB.getByText(after, { exact: true }).last()).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByText(after, { exact: true })).toBeVisible();
  } finally { await b.close(); await a.close(); }
});
