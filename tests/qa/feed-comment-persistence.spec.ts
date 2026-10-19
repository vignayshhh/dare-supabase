import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const commentMarker = `DARE-QA-${qa.runId}-comment-01`;

test("B comment persists on A's post and is visible to A", async ({ browser }) => {
  test.skip(!qa.commentWriteEnabled, "Set DARE_QA_ALLOW_COMMENT_WRITE_ONCE=true for the authorized one-shot comment check.");
  test.setTimeout(75_000);

  const contextB = await browser.newContext();
  const contextA = await browser.newContext();
  const pageB = await contextB.newPage();
  const pageA = await contextA.newPage();

  try {
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByLabel("Open comments").first().click();
    if ((await pageB.getByText(commentMarker, { exact: true }).count()) === 0) {
      await pageB.getByPlaceholder("Add a comment...").fill(commentMarker);
      await pageB.getByLabel("Post comment").click();
    }
    await expect(pageB.getByText(commentMarker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.getByLabel("Open comments").first().click();
    await expect(pageA.getByText(commentMarker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
