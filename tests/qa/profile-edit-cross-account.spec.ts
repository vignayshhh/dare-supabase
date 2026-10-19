import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function openProfileEditor(page: Page) {
  const settings = page.getByLabel("Profile settings", { exact: true });
  if (!(await settings.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "DARE QA A", exact: true }).first().click();
  }
  await expect(page.getByLabel("Profile settings", { exact: true })).toBeVisible({ timeout: 12_000 });
  await page.getByLabel("Profile settings", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible({ timeout: 12_000 });
}

async function saveDisplayName(page: Page, name: string) {
  await page.getByPlaceholder("Enter your display name").fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Profile Updated!", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeHidden({ timeout: 8_000 });
}

test("A owner display-name edit is visible to B and is restored", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.profileEditWriteEnabled,
    "Profile edits require both DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_PROFILE_EDIT_WRITE_ONCE=true.",
  );
  test.setTimeout(120_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  let originalName = "";
  let changed = false;
  const marker = `DARE QA A ${Date.now().toString().slice(-6)}`;

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openProfileEditor(pageA);
    originalName = await pageA.getByPlaceholder("Enter your display name").inputValue();
    await saveDisplayName(pageA, marker);
    changed = true;

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    // Home is the durable cross-account surface in the current navigation;
    // profile search itself has no primary entry from B's Home/Circle routes.
    await expect(pageB.getByText(marker, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    if (changed && originalName) {
      try {
        await openProfileEditor(pageA);
        await saveDisplayName(pageA, originalName);
      } catch (error) {
        console.error("QA_PROFILE_RESTORE_FAILED", error);
        throw error;
      }
    }
    await contextB.close();
    await contextA.close();
  }
});
