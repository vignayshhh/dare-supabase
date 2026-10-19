import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const executionId = Date.now();
const original = `DARE-QA-${qa.runId}-${executionId}-reply-original`;
const response = `DARE-QA-${qa.runId}-${executionId}-reply-response`;

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({
    timeout: 10_000,
  });
}

async function expectVisibleMessage(page: Page, marker: string, timeout = 12_000) {
  await expect.poll(async () => page.getByText(marker, { exact: true }).evaluateAll((nodes) =>
    nodes.some((node) => {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }),
  ), { timeout }).toBe(true);
}

async function send(page: Page, marker: string) {
  await page.locator('textarea[placeholder="Message..."]').fill(marker);
  const sent = page.waitForResponse((reply) =>
    reply.request().method() === "POST" && reply.url().includes("/rpc/send_message"),
  );
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await sent).ok()).toBe(true);
  await expectVisibleMessage(page, marker);
}

test("A and B retain threaded replies and mark the opened message read", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for authorized bounded message QA.");
  test.skip(!qa.messageWriteEnabled, "Set DARE_QA_ALLOW_MESSAGE_WRITE_ONCE=true for deliberate QA messages.");
  test.setTimeout(90_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const readRpcCalls: string[] = [];
  pageB.on("request", (request) => {
    if (request.url().includes("/rpc/mark_conversation_read")) readRpcCalls.push(request.url());
  });

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openConversation(pageA, "DARE QA B");
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openConversation(pageB, "DARE QA A");

    await send(pageA, original);
    await expectVisibleMessage(pageB, original);
    await expect.poll(() => readRpcCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(
      pageA.locator("[data-message-id]").filter({ hasText: original }).last()
        .getByText("Seen", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await pageB.getByText(original, { exact: true }).evaluateAll((nodes) => {
      const target = nodes.find((node) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(element).visibility !== "hidden";
      });
      if (!target) throw new Error("No visible reply target was rendered.");
      target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    await expect(pageB.getByText("Message options", { exact: true })).toBeVisible();
    await pageB.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(pageB.getByText("Replying to DARE QA A", { exact: true })).toBeVisible();
    await send(pageB, response);
    await expectVisibleMessage(pageA, response);
    await expect(pageA.getByText(original, { exact: true }).last()).toBeVisible();

    await pageA.reload();
    await openConversation(pageA, "DARE QA B");
    await expectVisibleMessage(pageA, response, 15_000);
    await expect(pageA.getByText(original, { exact: true }).last()).toBeVisible();
    console.log("QA_REPLY_READ", JSON.stringify({ readRpcCalls: readRpcCalls.length }));
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
