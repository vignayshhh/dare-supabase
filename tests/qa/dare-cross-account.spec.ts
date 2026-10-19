import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-dare-01`;

async function openCreateAction(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(550);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

test("A can send a dare to B and B can accept it", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for the authorized cross-account dare check.");
  test.setTimeout(75_000);

  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openCreateAction(pageA);
    await pageA.getByText("Give a Dare", { exact: true }).click();
    await pageA.getByText("Dare a Friend", { exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "Give a Dare" })).toBeVisible();

    const recipient = pageA.getByPlaceholder("@username");
    await recipient.fill("@dareqa_a1cb");
    const recipientResult = pageA.getByRole("button", { name: /DARE QA B.*dareqa_a1cb/i });
    await expect(recipientResult).toBeVisible({ timeout: 10_000 });
    await recipientResult.click();
    await pageA.getByPlaceholder("Describe the dare clearly enough that proof is undeniable...").fill(marker);

    const createResponse = pageA.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/dares",
      { timeout: 20_000 },
    );
    await pageA.getByRole("button", { name: "Send Dare", exact: true }).click();
    expect((await createResponse).ok()).toBe(true);

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
    const dareCard = pageB.getByText(marker, { exact: true }).last();
    await expect(dareCard).toBeVisible({ timeout: 20_000 });
    await dareCard.click();
    const accept = pageB.getByRole("button", { name: /accept/i }).first();
    await expect(accept).toBeVisible({ timeout: 10_000 });
    await accept.click();
    await expect(pageB.getByText(/accepted/i).first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});
