import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const challengeTitle = "Do 10 push-ups every day for 7 days";

test("B joins an official community dare through the normal UI", async ({ page }) => {
  test.skip(!qa.communityJoinWriteEnabled, "Set DARE_QA_ALLOW_COMMUNITY_JOIN_ONCE=true for the authorized one-shot community join check.");
  test.setTimeout(60_000);

  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "community", exact: true }).click();
  await page.getByRole("button", { name: `Preview ${challengeTitle}`, exact: true }).click();

  const joinResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/rpc/join_community_challenge"),
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Join Current Batch", exact: true }).click();
  const response = await joinResponse;
  expect(response.ok()).toBe(true);
  await expect(page.getByText("Batch joined", { exact: true })).toBeVisible({ timeout: 20_000 });
});
