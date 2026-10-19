import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function openProfileEditor(page: Page) {
  const settings = page.getByLabel("Profile settings", { exact: true });
  if (!(await settings.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "DARE QA A", exact: true }).first().click();
  }
  await expect(settings).toBeVisible({ timeout: 12_000 });
  await settings.click();
  await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible({ timeout: 12_000 });
}

async function saveBio(page: Page, bio: string) {
  await page.getByLabel("Bio", { exact: true }).fill(bio);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Profile Updated!", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeHidden({ timeout: 8_000 });
}

test("A owner bio edit is visible to B and is restored", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.profileEditWriteEnabled,
    "Profile edits require both DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_PROFILE_EDIT_WRITE_ONCE=true.",
  );
  test.setTimeout(120_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  let originalBio = "";
  let changed = false;
  const marker = `DARE QA bio ${Date.now().toString().slice(-6)}`;

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openProfileEditor(pageA);
    originalBio = await pageA.getByLabel("Bio", { exact: true }).inputValue();
    await saveBio(pageA, marker);
    changed = true;

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByRole("button", { name: "DARE QA A", exact: true }).first().click();
    await expect(
      pageB.getByRole("region", { name: "DARE QA A's profile" }).getByText(marker, { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    if (changed) {
      try {
        await openProfileEditor(pageA);
        await saveBio(pageA, originalBio);
      } catch (error) {
        console.error("QA_PROFILE_BIO_RESTORE_FAILED", error);
        throw error;
      }
    }
    await contextB.close();
    await contextA.close();
  }
});
