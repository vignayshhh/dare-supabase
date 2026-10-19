import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 15_000 });
}

test("B reacts to A's Story and A receives B's marked Story reply", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.storyInteractionWriteEnabled,
    "Story interaction writes require DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_STORY_INTERACTION_WRITE_ONCE=true.",
  );
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const marker = `DARE QA Story reply ${Date.now().toString().slice(-6)}`;

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    const story = pageB.getByLabel(/Open DARE QA A.*story/i).first();
    await expect(story).toBeVisible({ timeout: 20_000 });
    await story.click();
    await expect(pageB.locator('[data-story-media="true"]')).toBeVisible({ timeout: 10_000 });
    await pageB.getByLabel("Reply to story").fill(marker);
    await pageB.waitForTimeout(1_000);
    await pageB.getByRole("button", { name: "Like story", exact: true }).click();
    await expect(pageB.getByLabel("Remove story like")).toBeVisible({ timeout: 10_000 });
    await pageB.getByLabel("Send story reply").click();
    await expect(pageB.getByText("Sent", { exact: true }).last()).toBeVisible({ timeout: 15_000 });

    await openConversation(pageA, "DARE QA B");
    await expect(pageA.getByText(marker, { exact: true })).toBeVisible({ timeout: 25_000 });
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
