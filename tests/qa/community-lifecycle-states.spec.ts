import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

const title = "DARE-QA-LIFECYCLE-20261016 for 7 days";

async function openHub(page: import("@playwright/test").Page, account: "A" | "B" | "C", join = true) {
  await signIn(page, account);
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "community", exact: true }).click();
  await page.getByRole("button", { name: /Preview DARE-QA-LIFECYCLE-20261016/i }).click();
  if (join) await page.getByRole("button", { name: /^Joined/ }).last().click({ force: true });
}

test("A sees active lifecycle run", async ({ page }) => {
  await openHub(page, "A");
  await page.getByRole("button", { name: `Open ${title}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit proof", exact: true })).toBeVisible();
});

test("B completed fixture shows next-batch surface", async ({ page }) => {
  await openHub(page, "B");
  await expect(page.getByText("A batch is running. Join now to enter the next batch.", { exact: false })).toBeVisible();
});

test("C eliminated fixture shows next-batch surface", async ({ page }) => {
  await openHub(page, "C", false);
  await expect(page.getByText("A batch is running. Join now to enter the next batch.", { exact: false })).toBeVisible();
});
