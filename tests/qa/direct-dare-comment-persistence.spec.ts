import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-direct-dare-comment-render-fix`;

async function openFirstDareComments(page: import("@playwright/test").Page, description?: string) {
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  const entry = description
    ? page.locator('[data-reel-index]').filter({ has: page.locator(".pop-dare-cover-card p", { hasText: description }) }).first()
    : page.locator('[data-reel-index="0"]');
  await expect(entry).toBeVisible({ timeout: 30_000 });
  await entry.locator(".pop-dare-cover-card").dblclick();
  await expect
    .poll(() =>
      entry.locator(".pop-dare-proof-card").evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
    )
    .toBe("auto");
  const comments = entry.getByRole("button", { name: "Open dare comments" });
  await expect(comments).toBeVisible({ timeout: 20_000 });
  await comments.click();
  await expect(page.getByPlaceholder("Add a comment...")).toBeVisible();
  await expect(page.getByText("Loading comments...", { exact: true })).not.toBeVisible();
  return entry.locator(".pop-dare-cover-card p").first().textContent();
}

test("C direct-Dare comment persists after reload and is visible to B", async ({ page, browser }) => {
  test.skip(!qa.writeEnabled, "Requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(120_000);

  await signIn(page, "C");
  await completeOnboardingIfShown(page);
  const description = await openFirstDareComments(page);

  if ((await page.getByText(marker, { exact: true }).count()) === 0) {
    await page.getByPlaceholder("Add a comment...").fill(marker);
    const commentWrite = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/rest/v1/dare_comments"),
    );
    await page.getByRole("button", { name: "Post dare comment" }).click();
    const response = await commentWrite;
    expect(response.status(), await response.text()).toBe(201);
  }
  await expect(page.getByText(marker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  await page.reload({ waitUntil: "networkidle" });
  await openFirstDareComments(page);
  await expect(page.getByText(marker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  const recipientContext = await browser.newContext();
  try {
    const recipient = await recipientContext.newPage();
    await signIn(recipient, "B");
    await completeOnboardingIfShown(recipient);
    await openFirstDareComments(recipient, description!);
    await expect(recipient.getByText(marker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    const commentRow = recipient.getByText(marker, { exact: true }).first().locator("../..");
    const like = commentRow.getByRole("button", { name: "Like dare comment" });
    if ((await like.getAttribute("aria-pressed")) !== "true") {
      const write = recipient.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/rest/v1/dare_comment_likes"),
      );
      await like.click();
      const response = await write;
      expect(response.status(), await response.text()).toBe(201);
    }
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await recipient.reload({ waitUntil: "networkidle" });
    await openFirstDareComments(recipient, description!);
    const persistedRow = recipient.getByText(marker, { exact: true }).first().locator("../..");
    await expect(persistedRow.getByRole("button", { name: "Like dare comment" })).toHaveAttribute("aria-pressed", "true");
    await expect(persistedRow.getByRole("button", { name: "Like dare comment" })).toContainText("1");
  } finally {
    await recipientContext.close();
  }
});

test("A's direct-Dare comment reaches B's already-open comments sheet", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    const description = await openFirstDareComments(pageA);
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openFirstDareComments(pageB, description!);
    const liveMarker = `DARE-QA-${qa.runId}-dare-live-comment-${Date.now()}`;
    await pageA.getByPlaceholder("Add a comment...").fill(liveMarker);
    const write = pageA.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/rest/v1/dare_comments"),
    );
    await pageA.getByRole("button", { name: "Post dare comment" }).click();
    expect((await write).status()).toBe(201);
    await expect(pageA.getByText(liveMarker, { exact: true })).toBeVisible();
    await expect(pageB.getByText(liveMarker, { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
