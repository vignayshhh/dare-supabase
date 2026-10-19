import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function customFeed(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await page.getByRole("button", { name: /Filter cards:/ }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
}

test("B's open Custom card receives A's vote removal and new vote", async ({ browser }, testInfo) => {
  test.skip(!qa.writeEnabled, "Requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(180_000);
  const cycles = Math.min(10, Math.max(1, Number(process.env.DARE_QA_LIVE_VOTE_CYCLES) || 1));
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const feed = pageA.waitForResponse((response) => new URL(response.url()).pathname === "/api/drama/feed");
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await customFeed(pageA);
    const data = await (await feed).json();
    const fixture = data.customs.find((post: any) => post.statement.startsWith("DARE-QA-") && post.creator.name === "DARE QA B");
    expect(fixture).toBeTruthy();
    const cardA = pageA.locator("article").filter({ hasText: fixture.statement }).last();
    const selected = cardA.getByRole("button", { name: /^You think this is/ });
    if (!(await selected.isVisible().catch(() => false))) {
      const write = pageA.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/drama/${fixture.id}/vote`);
      await cardA.getByRole("button", { name: fixture.choiceOneText, exact: true }).click();
      expect((await write).status()).toBe(200);
    }
    const pageB = await contextB.newPage();
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await customFeed(pageB);
    const cardB = pageB.locator("article").filter({ hasText: fixture.statement }).last();
    const countB = cardB.getByRole("button", { name: "See who voted" });
    await expect(countB).toContainText("1 vote");

    const samples: Array<{ operation: string; latencyMs: number }> = [];
    for (let cycle = 0; cycle < cycles; cycle += 1) {
    // Keep the existing 30/minute feed-read limit intact during the series.
    if (cycles > 1) await pageA.waitForTimeout(3000);
    const remove = pageA.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/drama/${fixture.id}/vote`);
    await selected.hover();
    await pageA.mouse.down();
    await pageA.waitForTimeout(800);
    await pageA.mouse.up();
    expect((await remove).status()).toBe(200);
    const removedAt = Date.now();
    await expect(countB).toContainText("0 votes", { timeout: 20_000 });
    const removalMs = Date.now() - removedAt;
    samples.push({ operation: "remove", latencyMs: removalMs });
    await expect(selected).not.toBeVisible();

    if (cycles > 1) await pageA.waitForTimeout(3000);
    const write = pageA.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/drama/${fixture.id}/vote`);
    await cardA.getByRole("button", { name: fixture.choiceOneText, exact: true }).click();
    expect((await write).status()).toBe(200);
    const writtenAt = Date.now();
    await expect(countB).toContainText("1 vote", { timeout: 20_000 });
    await expect(cardB).toContainText("100%");
    samples.push({ operation: "vote", latencyMs: Date.now() - writtenAt });
    }
    const sorted = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
    const timing = { samples, medianMs: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
    console.info("DARE_QA_LIVE_VOTE_TIMING " + JSON.stringify(timing));
    await testInfo.attach("live-vote-timing", { body: JSON.stringify(timing), contentType: "application/json" });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
