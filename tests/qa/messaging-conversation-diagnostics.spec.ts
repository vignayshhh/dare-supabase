import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("B can open A's message composer without sending", async ({ page }) => {
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page.getByRole("button", { name: "Start new chat", exact: true }).click();
  const newChatDialog = page.getByRole("dialog", { name: "Start New Chat" });
  await expect(newChatDialog).toBeVisible();
  await expect(newChatDialog.getByText("Loading friends...", { exact: true })).not.toBeVisible({ timeout: 8_000 });

  const newChatFriend = newChatDialog.getByText("DARE QA A", { exact: true });
  if (await newChatFriend.isVisible().catch(() => false)) {
    await newChatFriend.click();
  } else {
    await page.getByRole("button", { name: "Close Start New Chat" }).click().catch(async () => {
      await newChatDialog.getByRole("button").click();
    });
    await page.getByRole("button", { name: /DARE QA A/ }).last().click();
  }
  const composer = page.locator('textarea[placeholder="Message..."]');
  await expect(composer).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("No conversation selected", { exact: true })).not.toBeVisible();
  console.log("QA_MESSAGE_COMPOSER", JSON.stringify({
    text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 700),
    inputs: await page.locator("input, textarea").evaluateAll((fields) => fields.map((field) => ({
      placeholder: field.getAttribute("placeholder"),
      type: field.getAttribute("type"),
    }))),
    controls: await page.getByRole("button").allTextContents(),
  }));
});
