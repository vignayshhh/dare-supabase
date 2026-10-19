import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const retainedMarker = /DARE-QA-20261014-chicken-fixed-chicken-out-/;

test("B can persist refusal for the retained pending QA dare", async ({ page }) => {
  test.skip(!qa.writeEnabled || !qa.dareChickenOutEnabled, "Requires the explicit Dare refusal write gates.");
  test.setTimeout(60_000);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/chicken-out")) requests.push(request.url());
  });
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByLabel("Notifications").click();
  await page.getByLabel("Open dare alert organizer").click();
  const alert = page.getByText(/gave you a dare/i).first();
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await alert.click();
  const card = page.locator("article").filter({ hasText: retainedMarker }).last();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.scrollIntoViewIfNeeded();
  const refuse = card.getByRole("button", { name: "Refuse", exact: true });
  if (!(await refuse.isVisible().catch(() => false))) {
    await expect(card.getByText("You backed away like a loser", { exact: true })).toBeVisible({ timeout: 10_000 });
    return;
  }
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/chicken-out"),
    { timeout: 20_000 },
  );
  await refuse.click();
  const response = await responsePromise;
  const payload = await response.json().catch(() => ({}));
  expect(response.ok()).toBe(true);
  expect(payload?.dare?.state).toBe("CHICKEN_OUT");
  expect(requests.length).toBeGreaterThan(0);
  await expect(card.getByText("You backed away like a loser", { exact: true })).toBeVisible({ timeout: 10_000 });
});
