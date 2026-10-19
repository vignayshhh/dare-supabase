import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const question = `DARE-QA-${qa.runId}-truth-live-${Date.now()}`;
const answer = `DARE-QA-${qa.runId}-truth-live-answer-${Date.now()}`;
const comment = `DARE-QA-${qa.runId}-truth-live-comment-${Date.now()}`;

async function openCreateAction(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(550);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

async function openTruths(page: Page) {
  const feed = page.getByLabel("Feed", { exact: true });
  if (!(await feed.isVisible().catch(() => false))) {
    await page.goto("/");
  }
  await expect(feed).toBeVisible({ timeout: 20_000 });
  await page.addStyleTag({ content: "nextjs-portal { display:none !important; }" });
  await feed.click({ force: true });
  const filter = page.getByRole("button", { name: /Filter cards:/ });
  await expect(filter).toBeVisible({ timeout: 20_000 });
  await filter.click();
  await page.getByRole("button", { name: "Truths", exact: true }).click();
}

async function refreshTruths(page: Page) {
  const reel = page.locator("[data-active-truth-index]");
  await expect(reel).toBeVisible({ timeout: 20_000 });
  const refreshResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/truth/feed" && new URL(response.url()).searchParams.get("refresh") === "1",
    { timeout: 30_000 },
  );
  await reel.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 180, clientY: 120 }] });
  await reel.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: 180, clientY: 220 }] });
  await reel.dispatchEvent("touchend", { changedTouches: [{ identifier: 0, clientX: 180, clientY: 220 }] });
  expect((await refreshResponse).ok()).toBe(true);
}

test("B's completed-Truth vote reconciles in A's open modal", async ({ browser }) => {
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
    await pageA.getByRole("button", { name: /DARE QA B.*dareqa_a1cb/i }).click();
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
    await pageB.getByPlaceholder("Type your answer here...").fill(answer);
    const answerResponse = pageB.waitForResponse(
      (response) => response.request().method() !== "GET" && new URL(response.url()).pathname.includes("/api/truth/"),
      { timeout: 30_000 },
    );
    await pageB.getByRole("button", { name: "Submit Answer", exact: true }).click();
    expect((await answerResponse).ok()).toBe(true);
    await expect(pageB.getByText("Truth completed", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await openTruths(pageA);
    await refreshTruths(pageA);
    await expect(pageA.getByText(question, { exact: true })).toBeVisible({ timeout: 30_000 });
    await openTruths(pageB);
    await refreshTruths(pageB);
    await expect(pageB.getByText(question, { exact: true })).toBeVisible({ timeout: 30_000 });

    const cardA = pageA.locator(".truth-card-slide:visible", { hasText: question });
    const cardB = pageB.locator(".truth-card-slide:visible", { hasText: question });
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();

    await cardA.getByRole("button", { name: "See who voted", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    const modalA = pageA.locator(".app-modal-backdrop");
    await expect(modalA).toBeVisible();
    await expect(modalA.getByText("0 votes", { exact: true })).toBeVisible();
    await pageA.waitForTimeout(2_000);

    await cardB.getByRole("button", { name: "L Lie", exact: true }).click();
    await expect(cardB.getByRole("button", { name: "You think this is a lie", exact: true })).toBeVisible();
    await cardB.getByRole("button", { name: "You think this is a lie", exact: true }).click();

    await expect(modalA.getByText("1 votes", { exact: true })).toBeVisible({ timeout: 30_000 });
    const modalB = pageB.locator(".app-modal-backdrop");
    await expect(modalB).toBeVisible();
    await modalB.getByRole("button", { name: /Comments/ }).click();
    await modalB.getByPlaceholder("Add a comment...").fill(comment);
    await modalB.getByRole("button", { name: "Post comment", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await expect(modalB.getByText(comment, { exact: true })).toBeVisible({ timeout: 30_000 });
    await modalA.getByRole("button", { name: /Comments/ }).click();
    await expect(modalA.getByText(comment, { exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});
