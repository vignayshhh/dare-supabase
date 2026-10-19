import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const question = `DARE-QA-${qa.runId}-truth-${Date.now()}`;
const answer = `DARE-QA-${qa.runId}-truth-answer-${Date.now()}`;

async function openCreateAction(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(850);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible({ timeout: 15_000 });
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

test("A asks and B answers a fresh QA Truth", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.truthWriteEnabled,
    "Truth writes require both DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_TRUTH_WRITE_ONCE=true.",
  );
  test.setTimeout(120_000);
  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openCreateAction(pageA);
    await pageA.getByText("Text Based Verdicts", { exact: true }).click();
    await pageA.getByText("Ask a Truth", { exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "Ask a Truth" })).toBeVisible();
    await pageA.getByPlaceholder("@username").fill(`@${qa.account("B").username.replace(/^@/, "")}`);
    const recipientResult = pageA.getByRole("button", { name: /DARE QA B.*dareqa_a1cb/i });
    await expect(recipientResult).toBeVisible({ timeout: 10_000 });
    await recipientResult.click();
    await pageA.getByPlaceholder("Ask the question they will replay in their head...").fill(question);
    const createResponse = pageA.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/truth",
      { timeout: 30_000 },
    );
    await pageA.getByRole("button", { name: "Ask Truth", exact: true }).click();
    expect((await createResponse).ok()).toBe(true);

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByLabel("Notifications").click();
    await pageB.getByLabel("Open dare alert organizer").click();
    const alert = pageB.getByText(/asked you a truth/i).first();
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await alert.click();
    await expect(pageB.getByText(question, { exact: true }).last()).toBeVisible({ timeout: 20_000 });
    await pageB.getByRole("button", { name: "Accept", exact: true }).first().click();
    await expect(pageB.getByRole("heading", { name: "Answer the Truth" })).toBeVisible({ timeout: 20_000 });
    await pageB.getByPlaceholder("Type your answer here...").fill(answer);
    const answerResponse = pageB.waitForResponse(
      (response) => response.request().method() !== "GET" && new URL(response.url()).pathname.includes("/api/truth/"),
      { timeout: 30_000 },
    );
    await pageB.getByRole("button", { name: "Submit Answer", exact: true }).click();
    expect((await answerResponse).ok()).toBe(true);
    await expect(pageB.getByText("Truth completed", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});

