import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 10_000 });
}

async function openMenu(page: Page) {
  await page.locator("button.messaging-header-action").click();
}

async function chooseMood(page: Page, mood: "Angry" | "Crying") {
  await openMenu(page);
  await page.getByRole("button", { name: "Mood Block", exact: true }).click();
  const persisted = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/rpc/update_conversation_state"),
  );
  await page.getByRole("button").filter({ hasText: mood }).click();
  expect((await persisted).ok()).toBe(true);
}

async function clearMood(page: Page) {
  const persisted = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/rpc/update_conversation_state"),
  );
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  expect((await persisted).ok()).toBe(true);
}

async function clearMoodIfPresent(page: Page) {
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  if (await skip.isVisible().catch(() => false)) await clearMood(page);
}

async function setFreeze(page: Page, action: "Freeze chat" | "Unfreeze") {
  await openMenu(page);
  const persisted = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/rpc/update_conversation_state"),
  );
  await page.getByRole("button", { name: action, exact: true }).click();
  expect((await persisted).ok()).toBe(true);
}

async function unfreezeIfPresent(pageA: Page, pageB: Page) {
  for (const page of [pageA, pageB]) {
    await openMenu(page);
    const unfreeze = page.getByRole("button", { name: "Unfreeze", exact: true });
    if (await unfreeze.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const persisted = page.waitForResponse((response) =>
        response.request().method() === "POST" && response.url().includes("/rpc/update_conversation_state"),
      );
      await unfreeze.click();
      expect((await persisted).ok()).toBe(true);
      return;
    }
    const freeze = page.getByRole("button", { name: "Freeze chat", exact: true });
    if (await freeze.isVisible().catch(() => false)) {
      await page.locator("button.messaging-header-action").click();
      return;
    }
    await page.locator("button.messaging-header-action").click();
  }
}

test("Mood Block and freeze synchronize both directions and survive reload", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Authorized main-database state verification requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(120_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openConversation(pageA, "DARE QA B");
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openConversation(pageB, "DARE QA A");
    await clearMoodIfPresent(pageA);
    await unfreezeIfPresent(pageA, pageB);

    await chooseMood(pageA, "Angry");
    await expect(pageB.getByText(/is angry/i).first()).toBeVisible({ timeout: 12_000 });
    await pageB.reload();
    await openConversation(pageB, "DARE QA A");
    await expect(pageB.getByText(/is angry/i).first()).toBeVisible({ timeout: 15_000 });
    await clearMood(pageB);
    await expect(pageA.getByText(/is angry/i).first()).not.toBeVisible({ timeout: 12_000 });

    await chooseMood(pageB, "Crying");
    await expect(pageA.getByText(/is crying/i).first()).toBeVisible({ timeout: 12_000 });
    await clearMood(pageA);
    await expect(pageB.getByText(/is crying/i).first()).not.toBeVisible({ timeout: 12_000 });

    await setFreeze(pageA, "Freeze chat");
    await expect(pageA.getByText(/You froze this chat/).first()).toBeVisible({ timeout: 12_000 });
    await expect(pageB.getByText(/Chat frozen by the other person/).first()).toBeVisible({ timeout: 12_000 });
    await pageB.reload();
    await openConversation(pageB, "DARE QA A");
    await expect(pageB.getByText(/Chat frozen by the other person/).first()).toBeVisible({ timeout: 15_000 });
    await setFreeze(pageA, "Unfreeze");
    await expect(pageB.getByText(/Chat frozen by the other person/).first()).not.toBeVisible({ timeout: 12_000 });

    await setFreeze(pageB, "Freeze chat");
    await expect(pageA.getByText(/Chat frozen by the other person/).first()).toBeVisible({ timeout: 12_000 });
    await setFreeze(pageB, "Unfreeze");
    await expect(pageA.getByText(/Chat frozen by the other person/).first()).not.toBeVisible({ timeout: 12_000 });
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
