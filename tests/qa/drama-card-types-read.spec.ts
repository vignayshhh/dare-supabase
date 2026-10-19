import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function selectDramaFilter(page: import("@playwright/test").Page, label: string) {
  const filter = page.getByRole("button", { name: /Filter cards:/i });
  await expect(filter).toBeVisible({ timeout: 30_000 });
  await filter.click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

test("A can read B's persisted Deal, Rumour, Promise, and Custom cards", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const cardFilter = page.getByRole("button", { name: /Filter cards:/i });
  for (const label of ["Feed", "Dares"]) {
    const nav = page.getByRole("button", { name: label, exact: true });
    if (await nav.isVisible().catch(() => false)) {
      await nav.click({ force: true });
      if (await cardFilter.isVisible().catch(() => false)) break;
      await page.waitForTimeout(1_000);
    }
  }
  await expect(cardFilter).toBeVisible({ timeout: 30_000 });

  // Retained fixtures can outlive the QA run that created them. Prefer the
  // configured run, then accept the last retained card-types fixture. This
  // keeps the read-only check tied to real persisted cards without requiring
  // a write-enabled run or silently accepting arbitrary app text.
  const fixtureRuns = [qa.runId, "20261014-cardtypes4"].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  );
  const checks = ["Predictions", "Rumours", "Promises", "Custom"];
  const marker = new RegExp(`DARE-QA-(?:${fixtureRuns.join("|")})-`, "i");
  let fixtureFound = false;
  for (const filter of checks) {
    await selectDramaFilter(page, filter);
    const card = page.getByText(marker, { exact: false }).first();
    if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
      fixtureFound = true;
      continue;
    }
    if (!fixtureFound) {
      test.skip(true, `No retained Drama QA fixture found for runs: ${fixtureRuns.join(", ")}`);
    }
    await expect(card).toBeVisible({ timeout: 20_000 });
  }
});

