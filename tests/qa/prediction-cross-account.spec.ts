import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-prediction-01`;

async function openCreateAction(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(550);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

async function expectAnyVisibleText(page: Page, text: string) {
  const matches = page.getByText(text, { exact: true });
  await expect.poll(async () => {
    const count = await matches.count();
    for (let index = 0; index < count; index += 1) {
      if (await matches.nth(index).isVisible()) return true;
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
}

async function hasAnyVisibleText(page: Page, text: string) {
  const matches = page.getByText(text, { exact: true });
  const count = await matches.count();
  for (let index = 0; index < count; index += 1) {
    if (await matches.nth(index).isVisible()) return true;
  }
  return false;
}

test("A's prediction about B persists and is visible to B", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for the authorized cross-account prediction check.");
  test.setTimeout(75_000);

  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.getByRole("button", { name: "Dares", exact: true }).click({ force: true });

    if (!(await hasAnyVisibleText(pageA, marker))) {
      await pageA.getByRole("button", { name: "Home", exact: true }).click({ force: true });
      await openCreateAction(pageA);
      await pageA.getByText("Text Based Verdicts", { exact: true }).click();
      await pageA.getByText("Make Prediction", { exact: true }).click();
      await expect(pageA.getByRole("heading", { name: "Make the call" })).toBeVisible();

      const recipient = pageA.getByPlaceholder("Enter username");
      await recipient.fill("dareqa_a1cb");
      const recipientResult = pageA.getByRole("button", { name: /DARE QA B.*dareqa_a1cb/i });
      await expect(recipientResult).toBeVisible({ timeout: 10_000 });
      await recipientResult.click();
      await pageA.locator("textarea").fill(marker);

      const createResponse = pageA.waitForResponse(
        (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/drama",
        { timeout: 20_000 },
      );
      await pageA.getByRole("button", { name: "Post Prediction", exact: true }).click();
      expect((await createResponse).status()).toBe(200);
    }

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByRole("button", { name: "Feed", exact: true }).click({ force: true });
    await expectAnyVisibleText(pageB, marker);
  } finally {
    await accountB.close();
    await accountA.close();
  }
});
