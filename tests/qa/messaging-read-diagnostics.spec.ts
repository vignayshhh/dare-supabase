import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 8_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 8_000 });
}

test("diagnoses A/B durable message reads without writing", async ({ browser }) => {
  test.setTimeout(60_000);
  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();
  const reads: Array<{ actor: string; status: number; query: string; rowCount?: number; error?: string }> = [];

  for (const [actor, page] of [["A", pageA], ["B", pageB]] as const) {
    page.on("response", async (response) => {
      if (!response.url().includes("/rest/v1/messages?")) return;
      const query = new URL(response.url()).search;
      const payload = await response.json().catch(() => null);
      reads.push({
        actor,
        status: response.status(),
        query,
        rowCount: Array.isArray(payload) ? payload.length : undefined,
        error: !response.ok() && payload && typeof payload === "object"
          ? String((payload as { message?: unknown }).message || "message read failed").slice(0, 160)
          : undefined,
      });
    });
  }

  try {
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openConversation(pageB, "DARE QA A");
    await pageB.waitForTimeout(1_500);

    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openConversation(pageA, "DARE QA B");
    await pageA.waitForTimeout(1_500);

    console.log("QA_MESSAGE_READS", JSON.stringify(reads));
  } finally {
    await accountB.close();
    await accountA.close();
  }
});
