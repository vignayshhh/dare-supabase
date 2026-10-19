import { expect, test, type Locator, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const verdictMarker = `DARE-QA-${qa.runId}-verdict-01`;
const parentMarker = `DARE-QA-${qa.runId}-verdict-comment-parent`;
const replyMarker = `DARE-QA-${qa.runId}-verdict-comment-reply`;
const syntheticPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==", "base64");

async function openVerdicts(page: Page) {
  await page.getByRole("button", { name: "Verdicts", exact: true }).click({ force: true });
  await expect(page.getByText(verdictMarker, { exact: true }).first()).toBeVisible({ timeout: 25_000 });
}

function markedCard(page: Page): Locator {
  return page.locator("article").filter({ hasText: verdictMarker }).filter({
    has: page.getByRole("button", { name: /Open comments/i }),
  }).last();
}

async function openComments(page: Page) {
  const card = markedCard(page);
  await card.getByRole("button", { name: "Open comments", exact: true }).click({ force: true });
  await expect(page.locator("h1").filter({ hasText: verdictMarker })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments", exact: true }).last()).toBeVisible();
}

test("B comments, A replies, and Verdict results persist cross-account", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.verdictWriteEnabled, "Requires the general and Verdict write gates.");
  test.setTimeout(120_000);
  const contextB = await browser.newContext();
  const contextA = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByLabel("Home", { exact: true }).dispatchEvent("pointerdown", { pointerType: "touch" });
    await pageB.waitForTimeout(800);
    await pageB.getByLabel("Home", { exact: true }).dispatchEvent("pointerup", { pointerType: "touch" });
    await pageB.getByRole("dialog", { name: "Choose center action" }).getByRole("button", { name: "Create", exact: true }).click();
    await pageB.getByText("Create Verdict", { exact: true }).click();
    await pageB.locator('main input[type="file"]').setInputFiles({ name: "dare-qa-comments.png", mimeType: "image/png", buffer: syntheticPng });
    const freshMarker = `DARE-QA-${qa.runId}-verdict-comments-${Date.now()}`;
    await pageB.getByPlaceholder("Keep the haircut?").fill(freshMarker);
    await pageB.locator('input[placeholder="Keep"]').fill("Keep");
    await pageB.locator('input[placeholder="Change"]').fill("Change");
    const createResponse = pageB.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/verdicts");
    await pageB.getByRole("button", { name: "Post Verdict", exact: true }).click();
    const createdResponse = await createResponse;
    expect(createdResponse.status()).toBe(200);
    const created = await createdResponse.json();
    const verdictId = created?.verdict?.id;
    expect(verdictId).toBeTruthy();

    const authRequestB = pageB.waitForRequest((candidate) => /^Bearer\s+.+/.test(candidate.headers().authorization || ""));
    await pageB.reload({ waitUntil: "domcontentloaded" });
    const authorizationB = (await authRequestB).headers().authorization;
    const parent = await pageB.evaluate(async ({ authorization, verdictId, text }) => {
      const csrf = crypto.randomUUID(); document.cookie = `csrf-token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax`;
      const response = await fetch("/api/verdicts/comments", { method: "POST", headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf }, body: JSON.stringify({ verdict_id: verdictId, text }) });
      return { status: response.status, body: await response.json() };
    }, { authorization: authorizationB, verdictId, text: parentMarker });
    expect(parent.status).toBe(200);
    const parentId = parent.body?.comment?.id;
    expect(parentId).toBeTruthy();

    const pageA = await contextA.newPage();
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    const authRequestA = pageA.waitForRequest((candidate) => /^Bearer\s+.+/.test(candidate.headers().authorization || ""));
    await pageA.reload({ waitUntil: "domcontentloaded" });
    const authorizationA = (await authRequestA).headers().authorization;
    const reply = await pageA.evaluate(async ({ authorization, verdictId, parentId, text }) => {
      const csrf = crypto.randomUUID(); document.cookie = `csrf-token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax`;
      const response = await fetch("/api/verdicts/comments", { method: "POST", headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf }, body: JSON.stringify({ verdict_id: verdictId, parent_id: parentId, text }) });
      return { status: response.status, body: await response.json() };
    }, { authorization: authorizationA, verdictId, parentId, text: replyMarker });
    expect(reply.status).toBe(200);
    const readback = await pageB.evaluate(async ({ authorization, verdictId }) => {
      const response = await fetch(`/api/verdicts/comments?verdictId=${verdictId}`, { headers: { Authorization: authorization } });
      return await response.json();
    }, { authorization: authorizationB, verdictId });
    expect(readback.comments.some((item: any) => item.text === parentMarker && item.parent_id === null)).toBe(true);
    expect(readback.comments.some((item: any) => item.text === replyMarker && item.parent_id === parentId)).toBe(true);
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
