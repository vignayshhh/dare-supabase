import { test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("B reports rendered profile-navigation controls", async ({ page }) => {
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  console.log("QA_PROFILE_NAV_CONTROLS", JSON.stringify(await page.locator("button").evaluateAll((buttons) => buttons.map((button, index) => ({
    index,
    label: button.getAttribute("aria-label"),
    text: button.textContent?.trim(),
    title: button.getAttribute("title"),
  })).slice(0, 80))));
});
