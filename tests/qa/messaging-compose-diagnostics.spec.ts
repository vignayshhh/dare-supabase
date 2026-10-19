import { test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("B can open the new-message chooser", async ({ page }) => {
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page.getByRole("button", { name: "Start new chat", exact: true }).click();
  await page.waitForTimeout(3_000);
  console.log("QA_NEW_MESSAGE_CHOOSER", JSON.stringify({
    text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600),
    controls: await page.getByRole("button").allTextContents(),
  }));
});
