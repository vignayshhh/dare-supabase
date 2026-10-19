import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-dare-proof-${Date.now()}`;
const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==",
  "base64",
);

async function openCreateAction(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(550);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

test("A sends, B proves, and A approves a fresh QA dare", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.dareProofWriteEnabled,
    "Proof writes require both DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_DARE_PROOF_WRITE_ONCE=true.",
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
    await pageA.getByText("Give a Dare", { exact: true }).click();
    await pageA.getByText("Dare a Friend", { exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "Give a Dare" })).toBeVisible();
    const recipient = pageA.getByPlaceholder("@username");
    await recipient.fill(`@${qa.account("B").username.replace(/^@/, "")}`);
    const recipientResult = pageA.getByRole("button", { name: /DARE QA B.*dareqa_a1cb/i });
    await expect(recipientResult).toBeVisible({ timeout: 10_000 });
    await recipientResult.click();
    await pageA.getByPlaceholder("Describe the dare clearly enough that proof is undeniable...").fill(marker);
    const createResponse = pageA.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/dares",
      { timeout: 30_000 },
    );
    await pageA.getByRole("button", { name: "Send Dare", exact: true }).click();
    expect((await createResponse).ok()).toBe(true);

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByLabel("Notifications").click();
    await pageB.getByLabel("Open dare alert organizer").click();
    const alert = pageB.getByText(/gave you a dare/i).first();
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await alert.click();
    await expect(pageB.getByRole("navigation", { name: "Dare inbox" })).toBeVisible();
    const pendingCard = pageB.locator("article").filter({ hasText: marker }).last();
    await expect(pendingCard).toBeVisible({ timeout: 20_000 });
    await pendingCard.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(pageB.getByRole("dialog", { name: "Ready to prove it?" })).toBeVisible({ timeout: 20_000 });
    await pageB.getByRole("button", { name: "Start now", exact: true }).click();
    await expect(pageB.getByRole("heading", { name: "Complete the Dare" })).toBeVisible({ timeout: 20_000 });
    const chooser = pageB.waitForEvent("filechooser");
    await pageB.getByRole("button", { name: /Choose from Gallery/i }).click();
    await (await chooser).setFiles({
      name: `dare-qa-proof-${qa.runId}.png`,
      mimeType: "image/png",
      buffer: syntheticPng,
    });
    await expect(pageB.getByText("Preview", { exact: true })).toBeVisible({ timeout: 20_000 });
    const proofResponse = pageB.waitForResponse(
      (response) => response.request().method() !== "GET" && new URL(response.url()).pathname.includes("/api/dares/"),
      { timeout: 30_000 },
    );
    await pageB.getByRole("button", { name: "Submit", exact: true }).click();
    expect((await proofResponse).ok()).toBe(true);
    await expect(pageB.getByText(marker, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(pageB.getByText("Dare completed", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    // Proof must remain private and reviewable by A, rather than automatically
    // becoming a public completed dare.
    await pageA.reload({ waitUntil: "networkidle" });
    await expect(pageA.getByLabel("Notifications")).toBeVisible({ timeout: 20_000 });
    await pageA.getByLabel("Notifications").click();
    await pageA.getByLabel("Open dare alert organizer").click();
    const proofAlert = pageA.getByText(/submitted proof for your dare/i).first();
    await expect(proofAlert).toBeVisible({ timeout: 20_000 });
    await proofAlert.click();
    await expect(pageA.getByRole("navigation", { name: "Dare inbox" })).toBeVisible();
    await pageA.getByRole("button", { name: "Sent", exact: true }).click();
    const submittedCard = pageA.locator("article").filter({ hasText: marker }).last();
    await expect(submittedCard.getByText("Proof waiting for your review", { exact: true })).toBeVisible({ timeout: 30_000 });
    await submittedCard.getByRole("button", { name: "Review proof", exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "Review Submission" })).toBeVisible();
    await pageA.getByRole("button", { name: /^Accept/ }).click();
    const reviewResponse = pageA.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/review"),
      { timeout: 30_000 },
    );
    await pageA.getByRole("button", { name: "Confirm ACCEPT", exact: true }).click();
    expect((await reviewResponse).ok()).toBe(true);
    await expect(pageA.getByRole("navigation", { name: "Dare inbox" })).toBeVisible({ timeout: 30_000 });
    await expect(pageA.locator("article").filter({ hasText: marker }).last().getByText("Dare completed", { exact: true })).toBeVisible({ timeout: 30_000 });

    await pageB.reload({ waitUntil: "networkidle" });
    await pageB.getByLabel("Notifications").click();
    await pageB.getByLabel("Open dare alert organizer").click();
    const approvedAlert = pageB.getByText(/approved your dare/i).first();
    await expect(approvedAlert).toBeVisible({ timeout: 20_000 });
    await approvedAlert.click();
    await expect(pageB.getByRole("navigation", { name: "Dare inbox" })).toBeVisible();
    await expect(pageB.locator("article").filter({ hasText: marker }).last().getByText("Dare completed", { exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});

