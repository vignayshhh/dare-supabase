import { test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("B can open the messaging surface and report its safe initial state", async ({ page }) => {
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page.waitForTimeout(750);

  const visibleText = await page.locator("body").innerText();
  const controls = await page.getByRole("button").evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const style = window.getComputedStyle(button);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((button) => button.getAttribute("aria-label") || button.textContent?.trim() || "")
      .filter(Boolean)
      .slice(0, 50),
  );
  console.log("QA_MESSAGING_SURFACE", JSON.stringify({
    text: visibleText.replace(/\s+/g, " ").slice(0, 500),
    controls,
  }));
});
