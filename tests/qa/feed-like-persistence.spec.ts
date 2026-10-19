import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-feed-01`;

async function markedPost(page: Page) {
  const post = page.locator(".feed-post-card").filter({ hasText: marker }).first();
  await expect(post).toBeVisible({ timeout: 12_000 });
  return post;
}

async function postById(page: Page, id: string) {
  const post = page.locator(`[id="${id}"]`);
  await expect(post).toBeVisible({ timeout: 12_000 });
  return post;
}

test("B's repeat likes on A's marked post persist and are visible to A", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for the authorized persistent-like check.");
  test.setTimeout(60_000);

  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    let postB = await markedPost(pageB);
    const stablePostId = await postB.getAttribute("id");
    expect(stablePostId).toMatch(/^feed-post-/);
    const firstTap = postB.getByRole("button", { name: "Like post" });
    const repeatTap = postB.getByRole("button", { name: "Add another like" });
    if (await firstTap.isVisible().catch(() => false)) await firstTap.click();
    await expect(repeatTap).toBeVisible({ timeout: 8_000 });
    await repeatTap.click();

    await pageB.reload({ waitUntil: "networkidle" });
    postB = await postById(pageB, stablePostId!);
    await expect(postB.getByRole("button", { name: "Add another like" })).toBeVisible({ timeout: 12_000 });

    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    const postA = await markedPost(pageA);
    await postA.getByRole("button", { name: "Open likes" }).click();
    const likesPanel = pageA.getByRole("heading", { name: "Likes" }).locator("xpath=../..");
    await expect(likesPanel).toBeVisible();
    await expect(likesPanel.getByText("DARE QA B", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(likesPanel.getByText(/liked [2-9]\d* times/)).toBeVisible({ timeout: 10_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});
