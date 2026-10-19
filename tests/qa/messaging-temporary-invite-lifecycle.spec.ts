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

test("A invites C into A/B chat; C enters; A removes temporary access", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.chatInviteWriteEnabled, "Requires explicit temporary-invite write gate.");
  test.setTimeout(120_000);
  const a = await browser.newContext();
  const c = await browser.newContext();
  const pageA = await a.newPage();
  const pageC = await c.newPage();
  try {
    await signIn(pageA, "A"); await completeOnboardingIfShown(pageA); await openChat(pageA, "DARE QA B");
    await signIn(pageC, "C"); await completeOnboardingIfShown(pageC);

    await pageC.getByRole("button", { name: "Messages", exact: true }).click();
    await pageC.getByRole("button", { name: "Invite alerts", exact: true }).click();
    const accept = pageC.getByRole("button", { name: "Accept invite" });
    const enter = pageC.getByRole("button", { name: "Enter", exact: true });
    const hasActiveInvite = await enter.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false);
    const hasPendingInvite = !hasActiveInvite && await accept.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false);
    if (!hasActiveInvite && !hasPendingInvite) {
      await pageC.getByRole("button", { name: "Back", exact: true }).click();
      await pageA.locator("button.messaging-header-action").click();
      await pageA.getByRole("button", { name: "Invite friend", exact: true }).click();
      const search = pageA.getByPlaceholder("Search friends");
      await expect(search).toBeVisible();
      await search.fill(qa.account("C").username);
      const candidate = pageA.locator("button").filter({ hasText: new RegExp(qa.account("C").username, "i") }).last();
      await expect(candidate).toBeVisible({ timeout: 15_000 });
      await candidate.click();
      await expect(pageA.getByText("Invite friend", { exact: true })).toBeHidden({ timeout: 15_000 });
      await pageC.getByRole("button", { name: "Invite alerts", exact: true }).click();
    }
    if (!hasActiveInvite) {
      await expect(accept).toBeVisible({ timeout: 20_000 });
      await accept.click();
    }
    await expect(enter).toBeVisible({ timeout: 20_000 });
    await enter.click();
    await expect(pageC.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 20_000 });
    await expect(pageA.getByText(/has joined this conversation/i).first()).toBeVisible({ timeout: 20_000 });
    await pageA.getByRole("button", { name: "Remove friend", exact: true }).click();
    await expect(pageC.getByText("Temporary chat access ended", { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally { await c.close(); await a.close(); }
});
