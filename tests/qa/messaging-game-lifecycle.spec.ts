import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function openChat(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 15_000 });
}

test("A/B game invite enters real waiting room without spoofed answers", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.gameWriteEnabled, "Requires explicit game write gate.");
  test.setTimeout(120_000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  for (const page of [pageA, pageB]) page.on("response", async (response) => {
    if (/\/rpc\/(activate_conversation_game|create_conversation_game_round)/.test(response.url())) {
      console.log("QA_GAME_RPC", response.url().split("/rpc/").at(-1), response.status(), await response.text().catch(() => ""));
    }
  });
  try {
    await signIn(pageA, "A"); await completeOnboardingIfShown(pageA); await openChat(pageA, "DARE QA B");
    await signIn(pageB, "B"); await completeOnboardingIfShown(pageB); await openChat(pageB, "DARE QA A");
    await pageA.locator("button.messaging-header-action").click();
    await pageA.getByRole("button", { name: "Games", exact: true }).click();
    const inviteRpc = pageA.waitForResponse((r) => r.url().includes("/rpc/create_conversation_game_invite"));
    await pageA.locator("button").filter({ hasText: /^This Or That/ }).first().click();
    const inviteResponse = await inviteRpc;
    const inviteBody = await inviteResponse.json();
    expect(inviteResponse.status(), JSON.stringify(inviteBody)).toBe(200);
    const sessionId = String(inviteBody.id);
    const waitingB = pageB.locator(`button[data-game-session-id="${sessionId}"]`);
    await expect(waitingB).toBeVisible({ timeout: 20_000 });
    await waitingB.click();
    await expect(pageB.getByText("Round 1", { exact: true })).toBeVisible({ timeout: 20_000 });
    await pageA.getByRole("button", { name: "Enter waiting room", exact: true }).last().click();
    await expect(pageA.getByText("Round 1", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(pageA.locator('button[class*="min-h-[390px]"]').first()).toBeVisible({ timeout: 15_000 });
  } finally { await b.close(); await a.close(); }
});
