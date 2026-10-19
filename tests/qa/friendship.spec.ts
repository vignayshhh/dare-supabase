import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test.describe("friendship workflow", () => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true in ignored .env.qa.local to run relationship checks.");

  test("A sends B a friend request through profile search", async ({ page }) => {
    const accountB = qa.account("B");
    await signIn(page, "A");
    await completeOnboardingIfShown(page);

    await page.getByRole("button", { name: "DARE QA A", exact: true }).first().click();
    await page.getByLabel("Find people", { exact: true }).click();
    const search = page.getByPlaceholder("Search by username or display name");
    await search.fill(accountB.username);
    await page.getByText("DARE QA B", { exact: true }).evaluateAll((elements) => {
      const visible = elements.find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!visible) throw new Error("Visible B search result missing");
      (visible as HTMLElement).click();
    });

    const addFriend = page.getByRole("button", { name: /Add friend|Send Friend Request/ });
    await expect(addFriend).toBeVisible();
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/api/friends/request",
    );
    await addFriend.first().click();
    await expect((await response).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Request sent", exact: true }),
    ).toBeVisible();
  });
});
