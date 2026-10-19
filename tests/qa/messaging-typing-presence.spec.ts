import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 10_000 });
}

async function clearMoodIfPresent(page: Page) {
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(skip).not.toBeVisible({ timeout: 10_000 });
  }
}

test("online and typing indicators work A to B and B to A without database traffic", async ({ browser }) => {
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const databaseRequests: string[] = [];
  const recordDatabaseRequest = (request: { url(): string; method(): string }) => {
    const url = request.url();
    const method = request.method();
    if ((url.includes("/rest/v1/") || url.includes("/rpc/")) && !["GET", "HEAD"].includes(method)) {
      databaseRequests.push(`${request.method()} ${new URL(url).pathname}`);
    }
  };

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openConversation(pageA, "DARE QA B");
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openConversation(pageB, "DARE QA A");
    await clearMoodIfPresent(pageA);

    await expect(pageA.getByText("ACTIVE NOW", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByText("ACTIVE NOW", { exact: true })).toBeVisible({ timeout: 15_000 });

    pageA.on("request", recordDatabaseRequest);
    pageB.on("request", recordDatabaseRequest);

    const composerA = pageA.locator('textarea[placeholder="Message..."]');
    await composerA.fill("A typing probe");
    await expect(pageB.getByText("TYPING...", { exact: true })).toBeVisible({ timeout: 12_000 });
    await composerA.fill("");
    await expect(pageB.getByText("TYPING...", { exact: true })).not.toBeVisible({ timeout: 12_000 });

    const composerB = pageB.locator('textarea[placeholder="Message..."]');
    await composerB.fill("B typing probe");
    await expect(pageA.getByText("TYPING...", { exact: true })).toBeVisible({ timeout: 12_000 });
    await composerB.fill("");
    await expect(pageA.getByText("TYPING...", { exact: true })).not.toBeVisible({ timeout: 12_000 });

    const receiptWrites = databaseRequests.filter((request) => request.endsWith("/mark_conversation_read"));
    const unexpectedWrites = databaseRequests.filter((request) => !request.endsWith("/mark_conversation_read"));
    expect(unexpectedWrites, `Typing/presence must not write to Postgres: ${unexpectedWrites.join(", ")}`).toEqual([]);
    expect(receiptWrites.length, "Opening the thread should batch its read receipt").toBeLessThanOrEqual(2);
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
