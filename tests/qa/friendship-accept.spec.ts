import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test.describe("friendship workflow", () => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true in ignored .env.qa.local to run relationship checks.");

  test("B accepts A's pending friend request from notifications", async ({ page }) => {
    await signIn(page, "B");
    await completeOnboardingIfShown(page);
    await page.getByRole("button", { name: "Notifications", exact: true }).click();

    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "PATCH" &&
        /^\/api\/friends\/[^/]+$/.test(new URL(candidate.url()).pathname),
    );
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect((await response).status()).toBe(200);
    await expect(page.getByText("Friends ✓", { exact: true })).toBeVisible();
  });
});
