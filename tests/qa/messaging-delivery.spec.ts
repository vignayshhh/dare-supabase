import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const executionId = Date.now();
const markerAToB = `DARE-QA-${qa.runId}-${executionId}-message-A-to-B`;
const markerBToA = `DARE-QA-${qa.runId}-${executionId}-message-B-to-A`;

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 10_000 });
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

async function sendOnce(page: Page, marker: string) {
  if (await page.getByText(marker, { exact: true }).first().isVisible().catch(() => false)) return;
  await page.locator('textarea[placeholder="Message..."]').fill(marker);
  const sent = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/rpc/send_message"),
  );
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await sent).ok()).toBe(true);
  await expectVisibleMessage(page, marker, 10_000);
}

async function clearMoodIfPresent(page: Page) {
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(skip).not.toBeVisible({ timeout: 10_000 });
  }
}

test("A and B exchange durable messages live and retain them after reload", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for the authorized bounded message check.");
  test.skip(!qa.messageWriteEnabled, "Set DARE_QA_ALLOW_MESSAGE_WRITE_ONCE=true for deliberate QA messages.");
  test.setTimeout(90_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const rpcCalls = { a: [] as string[], b: [] as string[] };
  pageA.on("request", (request) => {
    if (request.url().includes("/rpc/")) rpcCalls.a.push(new URL(request.url()).pathname);
  });
  pageB.on("request", (request) => {
    if (request.url().includes("/rpc/")) rpcCalls.b.push(new URL(request.url()).pathname);
  });

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openConversation(pageA, "DARE QA B");
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openConversation(pageB, "DARE QA A");
    await clearMoodIfPresent(pageA);

    await sendOnce(pageA, markerAToB);
    await expectVisibleMessage(pageB, markerAToB);
    await sendOnce(pageB, markerBToA);
    await expectVisibleMessage(pageA, markerBToA);

    expect(rpcCalls.a.filter((path) => path.endsWith("/send_message")).length).toBeLessThanOrEqual(1);
    expect(rpcCalls.b.filter((path) => path.endsWith("/send_message")).length).toBeLessThanOrEqual(1);

    await pageA.reload();
    await openConversation(pageA, "DARE QA B");
    await expectVisibleMessage(pageA, markerBToA, 15_000);
    await pageB.reload();
    await openConversation(pageB, "DARE QA A");
    await expectVisibleMessage(pageB, markerAToB, 15_000);
    console.log("QA_BIDIRECTIONAL_MESSAGE_RPC_COUNTS", JSON.stringify({
      aSendMessage: rpcCalls.a.filter((path) => path.endsWith("/send_message")).length,
      bSendMessage: rpcCalls.b.filter((path) => path.endsWith("/send_message")).length,
      aInboxReads: rpcCalls.a.filter((path) => path.endsWith("/get_inbox_page")).length,
      bInboxReads: rpcCalls.b.filter((path) => path.endsWith("/get_inbox_page")).length,
    }));
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
