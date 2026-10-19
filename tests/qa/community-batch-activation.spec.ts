import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const challengeTitle = "Do 10 push-ups every day for 7 days";

test("A joins B's waiting official challenge through the normal UI", async ({ page }) => {
  test.skip(!qa.writeEnabled || !qa.communityJoinWriteEnabled, "Set DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_COMMUNITY_JOIN_ONCE=true for the authorized activation fixture.");
  test.setTimeout(60_000);

  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "community", exact: true }).click();
  await page.getByRole("button", { name: `Preview ${challengeTitle}`, exact: true }).click();

  const joinResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/rpc/join_community_challenge"),
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Join Current Batch", exact: true }).click();
  expect((await joinResponse).ok()).toBe(true);
  await expect(page.getByText("Batch joined", { exact: true })).toBeVisible({ timeout: 20_000 });
});
