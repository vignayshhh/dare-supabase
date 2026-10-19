import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";
import { openDramaResults } from "./drama-navigation";

const marker = `DARE-QA-${qa.runId}-deal-outcome-${Date.now()}`;

test("A resolves an expired Deal and B sees the persisted Happened already result", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.dramaWriteEnabled, "Requires the authorized drama fixture gate.");
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await signIn(pageA, "A"); await completeOnboardingIfShown(pageA);
    await signIn(pageB, "B"); await completeOnboardingIfShown(pageB);
    const request = pageA.waitForRequest((candidate) => new URL(candidate.url()).pathname.startsWith("/api/") && /^Bearer\s+.+/.test(candidate.headers().authorization || ""));
    await pageA.reload({ waitUntil: "domcontentloaded" });
    const authorization = (await request).headers().authorization;
    const created = await pageA.evaluate(async ({ authorization, marker }) => {
      const csrf = crypto.randomUUID(); document.cookie = `csrf-token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax`;
      const response = await fetch("/api/drama", { method: "POST", headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf }, body: JSON.stringify({ kind: "deal", scope: "friend", subject: { type: "event", name: "DARE QA expired deal" }, event: marker, winOutcome: "DARE QA deal win", loseOutcome: "DARE QA deal loss", resolutionDate: new Date(Date.now() - 60_000).toISOString() }) });
      return { status: response.status, payload: await response.json() };
    }, { authorization, marker });
    expect(created.status).toBe(200);
    for (const page of [pageA, pageB]) {
      await openDramaResults(page, "Predictions");
    }
    const cardA = pageA.locator("article").filter({ hasText: marker }).last();
    await expect(cardA).toBeVisible({ timeout: 30_000 });
    const response = pageA.waitForResponse((candidate) => candidate.request().method() === "POST" && /\/api\/drama\/[^/]+\/update$/.test(new URL(candidate.url()).pathname));
    await cardA.getByRole("button", { name: "IT HAPPENED", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    expect((await response).status()).toBe(200);
    await openDramaResults(pageB, "Predictions");
    await expect(pageB.locator("article").filter({ hasText: marker }).last().getByText(/Deal Won/i)).toBeVisible({ timeout: 30_000 });
  } finally { await contextB.close(); await contextA.close(); }
});
