import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==", "base64");

async function openCreate(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(800);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

test("B can hold to remove and restore a fresh Verdict vote", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.verdictWriteEnabled, "Requires the general and Verdict write gates.");
  test.setTimeout(120_000);
  const marker = `DARE-QA-${qa.runId}-verdict-undo-${Date.now()}`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
  await signIn(pageA, "A");
  await completeOnboardingIfShown(pageA);
  await openCreate(pageA);
  await pageA.getByText("Create Verdict", { exact: true }).click();
  await pageA.locator('main input[type="file"]').setInputFiles({ name: "undo.png", mimeType: "image/png", buffer: png });
  await pageA.getByPlaceholder("Keep the haircut?").fill(marker);
  const choices = pageA.locator('input[placeholder="Keep"], input[placeholder="Change"]');
  await choices.nth(0).fill("Keep"); await choices.nth(1).fill("Change");
  const created = pageA.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/verdicts");
  await pageA.getByRole("button", { name: "Post Verdict", exact: true }).click();
  expect((await created).ok()).toBe(true);
  await signIn(pageB, "B"); await completeOnboardingIfShown(pageB);
  await pageB.getByRole("button", { name: "Verdicts", exact: true }).click({ force: true });
  const card = pageB.locator("article").filter({ hasText: marker });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "Keep", exact: true }).click();
  const selected = card.getByRole("button", { name: /You think this is Keep/i });
  await expect(selected).toBeVisible({ timeout: 10_000 });

  const removal = pageB.waitForResponse((response) => response.request().method() === "DELETE" && /\/api\/verdicts\/[^/]+\/vote$/.test(new URL(response.url()).pathname), { timeout: 20_000 });
  await selected.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1, isPrimary: true });
  await pageB.waitForTimeout(800);
  await selected.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1, isPrimary: true });
  expect((await removal).status()).toBe(200);
  await expect(card.getByRole("button", { name: "Keep", exact: true })).toBeVisible({ timeout: 10_000 });

  const restore = pageB.waitForResponse((response) => response.request().method() === "POST" && /\/api\/verdicts\/[^/]+\/vote$/.test(new URL(response.url()).pathname), { timeout: 20_000 });
  await card.getByRole("button", { name: "Keep", exact: true }).click();
  expect((await restore).status()).toBe(200);
  await expect(card.getByRole("button", { name: /You think this is Keep/i })).toBeVisible({ timeout: 10_000 });

  await pageB.reload({ waitUntil: "networkidle" });
  await pageB.getByRole("button", { name: "Verdicts", exact: true }).click({ force: true });
  await expect(pageB.locator("article").filter({ hasText: marker }).getByRole("button", { name: /You think this is Keep/i })).toBeVisible({ timeout: 20_000 });
  } finally { await contextB.close(); await contextA.close(); }
});
