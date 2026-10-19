import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-verdict-01`;
const choiceOne = "Keep";
const choiceTwo = "Change";
const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==",
  "base64",
);

async function openCreateAction(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(800);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

test("A creates a media verdict and B votes on it", async ({ browser }) => {
  test.skip(!qa.verdictWriteEnabled, "Set DARE_QA_ALLOW_VERDICT_WRITE_ONCE=true for the authorized one-shot verdict check.");
  test.setTimeout(90_000);
  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openCreateAction(pageA);
    await pageA.getByText("Create Verdict", { exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "Create Verdict" })).toBeVisible();
    const fileInput = pageA.locator('main input[type="file"]');
    await expect(fileInput).toHaveCount(1);
    await fileInput.setInputFiles({
      name: "dare-qa-verdict.png",
      mimeType: "image/png",
      buffer: syntheticPng,
    });
    await expect(pageA.getByText("Image selected", { exact: true })).toBeVisible({ timeout: 20_000 });
    await pageA.getByPlaceholder("Keep the haircut?").fill(marker);
    const choices = pageA.locator('input[placeholder="Keep"], input[placeholder="Change"]');
    await choices.nth(0).fill(choiceOne);
    await choices.nth(1).fill(choiceTwo);

    const createResponse = pageA.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/verdicts",
      { timeout: 30_000 },
    );
    await pageA.getByRole("button", { name: "Post Verdict", exact: true }).click();
    expect((await createResponse).status()).toBe(200);

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByRole("button", { name: "Verdicts", exact: true }).click({ force: true });
    await expect(pageB.getByText(marker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await pageB.getByRole("button", { name: choiceOne, exact: true }).first().click();
    await expect(pageB.getByRole("button", { name: /You think this is Keep/i }).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});

test("B can view the existing QA Verdict on mobile", async ({ page }) => {
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Verdicts", exact: true }).click({ force: true });
  await expect(page.getByText(marker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  const verdictImage = page.getByAltText(marker).first();
  await expect(verdictImage).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => verdictImage.evaluate((image) => (image as HTMLImageElement).naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /You think this is Keep/i }).first()).toBeVisible({ timeout: 10_000 });
});
