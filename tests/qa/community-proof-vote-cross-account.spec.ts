import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const challengeTitle = "Do 10 push-ups every day for 7 days";
const marker = `DARE-QA-${qa.runId}-community-proof-${Date.now()}`;
const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==",
  "base64",
);

async function openActiveRoom(page: Page, account: "A" | "B") {
  await signIn(page, account);
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "community", exact: true }).click();
  await page.getByRole("button", { name: `Preview ${challengeTitle}`, exact: true }).last().click();
  await page.getByRole("button", { name: /^Joined/ }).last().click();
  await page.getByRole("button", { name: `Open ${challengeTitle}`, exact: true }).click({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: challengeTitle, exact: true })).toBeVisible({ timeout: 15_000 });
}

test("B submits one real community proof and A's real vote persists", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.communityProofWriteEnabled, "Set DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_COMMUNITY_PROOF_WRITE_ONCE=true for the authorized proof/vote fixture.");
  test.setTimeout(120_000);
  const contextB = await browser.newContext();
  const contextA = await browser.newContext();
  const pageB = await contextB.newPage();
  const pageA = await contextA.newPage();

  try {
    await openActiveRoom(pageB, "B");
    // The floating action button can remount during room hydration on mobile.
    // Reuse an existing B proof when today's proof is already submitted.
    await expect(pageB.getByRole("heading", { name: challengeTitle, exact: true })).toBeVisible();
    const submitFab = pageB.getByRole("button", { name: "Submit proof", exact: true });
    let proofMarker = marker;
    let openedSubmission = false;
    if (await submitFab.isVisible().catch(() => false)) {
      // Countdown rerenders this button; dispatch on the current DOM node.
      await submitFab.evaluate((element) => (element as HTMLButtonElement).click());
      const picker = pageB.getByText("Choose photo or video proof", { exact: true });
      if (await picker.isVisible({ timeout: 2_000 }).catch(() => false)) {
        openedSubmission = true;
        const chooser = pageB.waitForEvent("filechooser");
        await picker.click();
        await (await chooser).setFiles({ name: "dare-qa-community-proof.png", mimeType: "image/png", buffer: syntheticPng });
        await pageB.getByPlaceholder("Add a short proof note...").fill(marker);
        await pageB.getByRole("button", { name: /Submit proof|Replace proof/, exact: true }).last().evaluate((element) => (element as HTMLButtonElement).click());
        await expect(pageB.getByText(marker, { exact: true })).toBeVisible({ timeout: 30_000 });
      }
    }
    if (!openedSubmission) {
      const existingProof = pageB.locator("article").filter({ has: pageB.getByRole("button", { name: /real$/ }) }).first();
      await expect(existingProof).toBeVisible({ timeout: 20_000 });
      proofMarker = "__existing__";
    }

    await openActiveRoom(pageA, "A");
    const proof = proofMarker === marker
      ? pageA.locator("article").filter({ hasText: marker })
      : pageA.locator("article").filter({ has: pageA.getByRole("button", { name: /real$/ }) }).first();
    await expect(proof).toBeVisible({ timeout: 30_000 });
    const realVote = proof.getByRole("button", { name: /real$/ });
    const before = await realVote.textContent();
    await realVote.click();
    await expect(realVote).toHaveClass(/border-\[#4ade80\]/, { timeout: 20_000 });
    expect(await realVote.textContent()).not.toBe(before);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
