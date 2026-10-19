import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test("C can vote Fake on a second approved direct Dare", async ({ page }) => {
  test.skip(!qa.writeEnabled, "Requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(75_000);

  await signIn(page, "C");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });

  const firstEntry = page.locator('[data-reel-index="0"]');
  await expect(firstEntry).toBeVisible({ timeout: 30_000 });
  const reel = firstEntry.locator("..");
  await reel.hover();
  await page.mouse.wheel(0, 900);

  const activeEntry = page.locator('[data-reel-index="1"]');
  await activeEntry.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(activeEntry).toBeInViewport({ timeout: 10_000 });
  await activeEntry.locator(".pop-dare-cover-card").dblclick();
  await expect
    .poll(() =>
      activeEntry.locator(".pop-dare-proof-card").evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
    )
    .toBe("auto");

  const fakeVote = activeEntry.locator(".pop-dare-proof-card .dare-fake-btn");
  await expect(fakeVote).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      () =>
        fakeVote.evaluate(
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
  await fakeVote.click();
  const confirm = page.getByRole("button", {
    name: "You think this is Fake",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await confirm.click();
  expect((await voteResponse).status()).toBe(200);
});
