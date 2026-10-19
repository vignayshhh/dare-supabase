import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";
import { openDramaResults } from "./drama-navigation";

const marker = `DARE-QA-${qa.runId}-rumour-outcome-${Date.now()}`;
test("A resolves an expired Rumour and B sees the persisted result", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.dramaWriteEnabled, "Requires the authorized drama fixture gate."); test.setTimeout(90_000);
  const a = await browser.newContext(), b = await browser.newContext(); const pageA = await a.newPage(), pageB = await b.newPage();
  try {
    await signIn(pageA, "A"); await completeOnboardingIfShown(pageA); await signIn(pageB, "B"); await completeOnboardingIfShown(pageB);
    const request = pageA.waitForRequest((r) => new URL(r.url()).pathname.startsWith("/api/") && /^Bearer\s+.+/.test(r.headers().authorization || "")); await pageA.reload({ waitUntil: "domcontentloaded" }); const authorization = (await request).headers().authorization;
    const create = await pageA.evaluate(async ({ authorization, marker }) => { const csrf = crypto.randomUUID(); document.cookie = `csrf-token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax`; const r = await fetch("/api/drama", { method: "POST", headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf }, body: JSON.stringify({ kind: "rumour", statement: marker, sourceLabel: "DARE QA source", heatLabel: "unverified", deadline: new Date(Date.now() - 60_000).toISOString() }) }); return r.status; }, { authorization, marker }); expect(create).toBe(200);
    const openResults = (page: typeof pageA) => openDramaResults(page, "Rumours");
    await openResults(pageA); const cardA = pageA.locator("article").filter({ hasText: marker }).last(); await expect(cardA).toBeVisible({ timeout: 30_000 }); const response = pageA.waitForResponse((r) => r.request().method() === "POST" && /\/api\/drama\/[^/]+\/update$/.test(new URL(r.url()).pathname)); await cardA.getByRole("button", { name: "CONFIRM TRUE", exact: true }).evaluate((button: HTMLButtonElement) => button.click()); expect((await response).status()).toBe(200);
    await openResults(pageB); await expect(pageB.locator("article").filter({ hasText: marker }).last().getByText("Confirmed true", { exact: true })).toBeVisible({ timeout: 30_000 });
  } finally { await b.close(); await a.close(); }
});
