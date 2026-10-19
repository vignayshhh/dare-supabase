import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-feed-01`;

test("B can add repeat likes to A's QA post", async ({ page }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for the authorized repeat-like check.");

  await signIn(page, "B");
  await completeOnboardingIfShown(page);

  const post = page.locator(".feed-post-card").filter({ hasText: marker }).first();
  await expect(post).toBeVisible({ timeout: 12_000 });
  const firstTap = post.getByRole("button", { name: "Like post" });
  const repeatTap = post.getByRole("button", { name: "Add another like" });
  if (await firstTap.isVisible().catch(() => false)) await firstTap.click();
  await expect(repeatTap).toBeVisible({ timeout: 8_000 });
  await repeatTap.click();
  await expect(repeatTap).toBeVisible({ timeout: 8_000 });
});
