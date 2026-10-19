import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const question = `DARE-QA-${qa.runId}-truth-01`;
const answer = `DARE-QA-${qa.runId}-truth-answer-01`;

test("B receives A's QA truth and submits an answer", async ({ browser }) => {
  test.skip(!qa.truthWriteEnabled, "Set DARE_QA_ALLOW_TRUTH_WRITE_ONCE=true for the authorized one-shot truth check.");
  test.setTimeout(90_000);
  const accountB = await browser.newContext();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByLabel("Notifications").click();
    await pageB.getByLabel("Open dare alert organizer").click();
    await pageB.getByText(/asked you a truth/i).first().click();
    const truthCard = pageB.locator("article").filter({ hasText: question }).last();
    await expect(truthCard).toBeVisible({ timeout: 20_000 });
    await truthCard.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(pageB.getByRole("heading", { name: "Answer the Truth" })).toBeVisible({ timeout: 20_000 });
    await pageB.getByPlaceholder("Type your answer here...").fill(answer);
    await pageB.getByRole("button", { name: "Submit Answer", exact: true }).click();
    await expect(pageB.getByText("Truth completed", { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await accountB.close();
  }
});
