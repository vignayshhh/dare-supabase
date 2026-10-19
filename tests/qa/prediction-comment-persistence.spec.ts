import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";
const comment = `DARE-QA-${qa.runId}-prediction-comment-${Date.now()}`;
async function openPrediction(page: import("@playwright/test").Page, marker: string) {
  await page.getByRole("button", { name: "Feed", exact: true }).click({ force: true });
  const cards = page.locator("article").filter({ hasText: marker });
  await expect.poll(async () => {
    for (let index = 0; index < await cards.count(); index += 1) {
      if (await cards.nth(index).isVisible()) return true;
    }
    return false;
  }, { timeout: 60_000 }).toBe(true);
  for (let index = 0; index < await cards.count(); index += 1) {
    if (await cards.nth(index).isVisible()) return cards.nth(index);
  }
  throw new Error("Visible Prediction card disappeared");
}
test("B's Prediction comment persists after reload", async ({ page }) => {
  test.skip(!qa.writeEnabled || !qa.dramaWriteEnabled, "Requires the authorized drama fixture gate.");
  test.setTimeout(120_000);
  await signIn(page, "B"); await completeOnboardingIfShown(page);
  const request = page.waitForRequest((candidate) => /^Bearer\s+.+/.test(candidate.headers().authorization || ""));
  await page.reload({ waitUntil: "domcontentloaded" });
  const authorization = (await request).headers().authorization;
  const marker = `DARE-QA-${qa.runId}-prediction-comment-card-${Date.now()}`;
  const created = await page.evaluate(async ({ authorization, marker }) => {
    const csrf = crypto.randomUUID();
    document.cookie = `csrf-token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax`;
    const response = await fetch("/api/drama", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf },
      body: JSON.stringify({ kind: "prediction", text: marker, subject: { type: "event", name: "QA comment event" }, deadline: new Date(Date.now() + 86_400_000).toISOString() }),
    });
    return { status: response.status, body: await response.json() };
  }, { authorization, marker });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const postId = created.body?.post?.id || created.body?.id;
  const persisted = await page.evaluate(async ({ authorization, postId, comment }) => {
    const csrf = crypto.randomUUID();
    document.cookie = `csrf-token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax`;
    const write = await fetch(`/api/drama/${postId}/update`, { method: "POST", headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf }, body: JSON.stringify({ action: "comment", text: comment }) });
    const feed = await fetch("/api/drama/feed", { headers: { Authorization: authorization } });
    const data = await feed.json();
    const row = (data.predictions || []).find((item: any) => item.id === postId);
    return { writeStatus: write.status, comments: row?.comments || [] };
  }, { authorization, postId, comment });
  expect(persisted.writeStatus).toBe(200);
  expect(persisted.comments.some((item: any) => item.text === comment)).toBe(true);
});
