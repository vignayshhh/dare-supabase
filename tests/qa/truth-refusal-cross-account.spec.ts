import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const question = `DARE-QA-${qa.runId}-truth-refusal-${Date.now()}`;

async function openCreateAction(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(550);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

test("B refuses A's fresh Truth and A receives the persisted result", async ({ browser }) => {
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
    await pageA.getByPlaceholder("@username").fill(`@${qa.account("B").username.replace(/^@/, "")}`);
    const recipient = pageA.getByRole("button", { name: /DARE QA B.*dareqa_a1cb/i });
    await expect(recipient).toBeVisible({ timeout: 10_000 });
    await recipient.click();
    await pageA.getByPlaceholder("Ask the question they will replay in their head...").fill(question);
    const created = pageA.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/truth",
    );
    await pageA.getByRole("button", { name: "Ask Truth", exact: true }).click();
    expect((await created).ok()).toBe(true);

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByLabel("Notifications").click();
    await pageB.getByLabel("Open dare alert organizer").click();
    await pageB.getByText(/asked you a truth/i).first().click();
    await expect(pageB.getByText(question, { exact: true }).last()).toBeVisible({ timeout: 20_000 });
    await pageB.getByRole("button", { name: "Accept", exact: true }).first().click();
    await expect(pageB.getByRole("heading", { name: "Answer the Truth" })).toBeVisible({ timeout: 20_000 });
    const refused = pageB.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/refuse"),
    );
    await pageB.getByRole("button", { name: "Refuse Truth", exact: true }).click();
    const refusedResponse = await refused;
    expect(refusedResponse.ok()).toBe(true);
    expect((await refusedResponse.json()).truth?.state).toBe("REJECTED");

    const pageARead = await accountA.newPage();
    await pageARead.goto("http://localhost:3000");
    await expect(pageARead.getByLabel("Notifications")).toBeVisible({ timeout: 20_000 });
    await pageARead.getByLabel("Notifications").click();
    await pageARead.getByLabel("Open dare alert organizer").click();
    await expect(pageARead.getByText(/refused your truth/i).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});
