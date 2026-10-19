import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";
import { openDramaResults } from "./drama-navigation";

const marker = `DARE-QA-${qa.runId}-prediction-outcome-${Date.now()}`;

test("A resolves an expired prediction and B sees the persisted Happened already result", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.dramaWriteEnabled, "Requires the authorized drama fixture gate.");
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);

    const feedRequest = pageA.waitForRequest((request) =>
      new URL(request.url()).pathname.startsWith("/api/") && /^Bearer\s+.+/.test(request.headers().authorization || ""),
    );
    await pageA.reload({ waitUntil: "domcontentloaded" });
    const authorization = (await feedRequest).headers().authorization;
    expect(authorization).toMatch(/^Bearer\s+.+/);

    const result = await pageA.evaluate(async ({ text, authorization }) => {
      const csrf = crypto.randomUUID();
      document.cookie = `csrf-token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax`;
      const response = await fetch("/api/drama", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: authorization,
          "x-csrf-token": csrf,
        },
        // The UI prevents past dates, so this authenticated fixture is used
        // solely to exercise the post-deadline UI path without waiting an hour.
        body: JSON.stringify({ kind: "prediction", text, subject: { type: "event", name: "DARE QA outcome event" }, deadline: new Date(Date.now() - 60_000).toISOString() }),
      });
      return { status: response.status, payload: await response.json() };
    }, { text: marker, authorization });
    expect(result.status).toBe(200);

    await openDramaResults(pageA, "Predictions");
    const card = pageA.locator("article").filter({ hasText: marker }).last();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const closeOutcomeExplanation = pageA.getByRole("button", { name: "Close outcome explanation", exact: true });
    if (await closeOutcomeExplanation.isVisible().catch(() => false)) await closeOutcomeExplanation.click();
    const resolved = pageA.waitForResponse((response) => response.request().method() === "POST" && /\/api\/drama\/[^/]+\/update$/.test(new URL(response.url()).pathname));
    await card.getByRole("button", { name: "DIDN'T HAPPEN", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    expect((await resolved).status()).toBe(200);

    await openDramaResults(pageB, "Predictions");
    await expect(pageB.locator("article").filter({ hasText: marker }).last().getByText(/final/i)).toBeVisible({ timeout: 30_000 });
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
