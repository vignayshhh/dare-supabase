import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const challengeTitle = "Do 10 push-ups every day for 7 days";
const proofMarkerPrefix = `DARE-QA-${qa.runId}-community-proof-`;
const marker = `DARE-QA-${qa.runId}-community-comment-${Date.now()}`;

async function openProofComments(page: Page, account: "A" | "B") {
  await signIn(page, account);
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "community", exact: true }).click();
  await page.getByRole("button", { name: `Preview ${challengeTitle}`, exact: true }).last().click();
  await page.getByRole("button", { name: /^Joined/ }).last().click();
  await page.getByRole("button", { name: `Open ${challengeTitle}`, exact: true }).click({ timeout: 15_000 });
  const proof = page.locator("article").filter({ hasText: proofMarkerPrefix }).last();
  await expect(proof).toBeVisible({ timeout: 20_000 });
  await proof.getByRole("button").last().click();
  await expect(page.getByPlaceholder("Add a comment...")).toBeVisible({ timeout: 15_000 });
}

test("A's proof comment is visible to B in the active community room", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.communityCommentWriteEnabled, "Set DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_COMMUNITY_COMMENT_WRITE_ONCE=true for the authorized proof-comment fixture.");
  test.setTimeout(45_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await openProofComments(pageB, "B");
    await openProofComments(pageA, "A");
    await pageA.getByPlaceholder("Add a comment...").fill(marker);
    await pageA.getByRole("button", { name: "Send comment", exact: true }).click();
    await expect(pageA.getByText(marker, { exact: true })).toBeVisible({ timeout: 20_000 });
    // Persisted cross-account read is authoritative; realtime may be delayed by
    // the room's bounded refresh window, so reopen B's panel once.
    await pageB.reload();
    await openProofComments(pageB, "B");
    await expect(pageB.getByText(marker, { exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
