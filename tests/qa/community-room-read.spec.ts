import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

const challengeTitle = "Read 10 pages every day for 7 days";

test("B opens the retained community run in its current lifecycle without a write", async ({ page }) => {
  test.setTimeout(60_000);

  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "community", exact: true }).click();
  await page.getByRole("button", { name: `Preview ${challengeTitle}`, exact: true }).click();
  const joinResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/rest/v1/community_challenge_joins") &&
      Boolean(url.searchParams.get("select")?.includes("proof_due_at"));
  });
  await page.getByRole("button", { name: "Joined", exact: true }).last().click();
  const joins = await (await joinResponse).json();
  const join = joins.find((item: any) => item.challenge_title === challengeTitle);
  expect(join, "Expected B's retained community membership").toBeTruthy();
  const expired = join.status === "eliminated" ||
    (join.status === "active" && join.proof_due_at && new Date(join.proof_due_at).getTime() <= Date.now());
  if (expired) {
    await page.getByRole("button", { name: "Eliminated", exact: true }).click();
  } else if (join.status === "completed") {
    await page.getByRole("button", { name: "Completed", exact: true }).click();
  }
  await page.getByRole("button", { name: `Open ${challengeTitle}`, exact: true }).click({ timeout: 15_000 });

  await expect(page.getByRole("heading", { name: challengeTitle, exact: true })).toBeVisible({ timeout: 15_000 });
  if (expired || join.status === "completed") {
    await expect(page.getByRole("button", { name: "Submit proof", exact: true })).toHaveCount(0);
  } else {
    await expect(page.getByRole("button", { name: "Submit proof", exact: true })).toBeVisible();
  }
});
