import { expect, test, type Locator, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const postMarker = `DARE-QA-${qa.runId}-feed-01`;
const parentMarker = `DARE-QA-${qa.runId}-comment-thread-parent`;
const replyMarker = `DARE-QA-${qa.runId}-comment-thread-reply`;

async function openMarkedPostComments(page: Page) {
  const post = page.locator(".feed-post-card").filter({ hasText: postMarker }).first();
  await expect(post).toBeVisible({ timeout: 25_000 });
  await post.getByLabel("Open comments", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Comments", exact: true })).toBeVisible();
}

function commentActions(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true }).first().locator("xpath=following-sibling::div[1]");
}

async function likeCount(actions: Locator) {
  const likeButton = actions.getByRole("button", { name: /^(?:Like comment|Comment liked)$/ });
  const text = await likeButton.innerText();
  return Number(text.match(/\d+/)?.[0] ?? 0);
}

test("A replies to and likes B's feed comment; B sees both after reload", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.commentWriteEnabled, "Requires the general and comment-write gates.");
  test.setTimeout(100_000);
  const contextB = await browser.newContext();
  const contextA = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openMarkedPostComments(pageB);
    if ((await pageB.getByText(parentMarker, { exact: true }).count()) === 0) {
      await pageB.getByPlaceholder("Add a comment...", { exact: true }).fill(parentMarker);
      await pageB.getByRole("button", { name: "Post comment", exact: true }).click();
    }
    await expect(pageB.getByText(parentMarker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    const pageA = await contextA.newPage();
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openMarkedPostComments(pageA);
    const parentActionsA = commentActions(pageA, parentMarker);
    await expect(parentActionsA).toBeVisible({ timeout: 20_000 });
    const beforeLike = await likeCount(parentActionsA);
    const needsReply = (await pageA.getByText(replyMarker, { exact: true }).count()) === 0;
    if (needsReply) {
      await parentActionsA.getByRole("button", { name: "Like comment", exact: true }).click();
      await expect(parentActionsA.getByRole("button", { name: "Comment liked", exact: true })).toBeVisible();
      await expect.poll(() => likeCount(parentActionsA), { timeout: 10_000 }).toBe(beforeLike + 1);
      await parentActionsA.getByRole("button", { name: "Reply", exact: true }).click();
      await pageA.getByPlaceholder(/^Reply to @/).fill(replyMarker);
      await pageA.getByRole("button", { name: "Post reply", exact: true }).click();
    }
    const expectedLikeCount = beforeLike + (needsReply ? 1 : 0);
    await expect(pageA.getByText(replyMarker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await pageB.reload({ waitUntil: "networkidle" });
    await openMarkedPostComments(pageB);
    const parentActionsB = commentActions(pageB, parentMarker);
    await expect(parentActionsB).toBeVisible({ timeout: 20_000 });
    await expect(pageB.getByText(replyMarker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    expect(await likeCount(parentActionsB)).toBe(expectedLikeCount);
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
