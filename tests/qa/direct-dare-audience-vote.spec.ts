import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test("C can vote Real on an approved direct Dare", async ({ page }) => {
  test.skip(!qa.writeEnabled, "Requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(60_000);

  await signIn(page, "C");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });

  const activeEntry = page.locator('[data-reel-index="0"]');
  await expect(activeEntry).toBeVisible({ timeout: 30_000 });
  await activeEntry.locator(".pop-dare-cover-card").dblclick();
  await expect
    .poll(() =>
      activeEntry.locator(".pop-dare-proof-card").evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
    )
    .toBe("auto");
  const realVote = activeEntry.locator(".pop-dare-proof-card .dare-real-btn");
  await expect(realVote).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      () =>
        realVote.evaluate(
          (element) =>
            getComputedStyle(element.parentElement!.parentElement!).pointerEvents,
        ),
      { timeout: 20_000 },
    )
    .toBe("auto");
  const voteResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/dares\/[^/]+\/vote$/.test(new URL(response.url()).pathname),
  );
  await realVote.click();
  const confirm = page.getByRole("button", { name: "You think this is Real", exact: true });
  await expect(confirm).toBeVisible();
  await confirm.click();
  expect((await voteResponse).status()).toBe(200);
});
