import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const challengeTitle = "Do 10 push-ups every day for 7 days";

test("mobile Community proof report submits once", async ({ page }) => {
  test.skip(!qa.writeEnabled, "Requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(60_000);
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "community", exact: true }).click();
  await page.getByRole("button", { name: `Preview ${challengeTitle}`, exact: true }).last().click();
  await page.getByRole("button", { name: /^Joined/ }).last().click();
  await page.getByRole("button", { name: `Open ${challengeTitle}`, exact: true }).click({ timeout: 15_000 });
  const report = page.getByRole("button", { name: "Report proof", exact: true }).last();
  await expect(report).toBeVisible({ timeout: 20_000 });
  const write = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/rest/v1/reports"));
  await report.click();
  const response = await write;
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByText("Report sent.", { exact: true })).toBeVisible();
});
