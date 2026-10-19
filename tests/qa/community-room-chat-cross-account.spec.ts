import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const challengeTitle = "Do 10 push-ups every day for 7 days";
const marker = `DARE-QA-${qa.runId}-community-chat-${Date.now()}`;

async function openRoomChat(page: Page, account: "A" | "B") {
  await signIn(page, account);
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "community", exact: true }).click();
  await page.getByRole("button", { name: `Preview ${challengeTitle}`, exact: true }).last().click();
  await page.getByRole("button", { name: /^Joined/ }).last().click();
  await page.getByRole("button", { name: `Open ${challengeTitle}`, exact: true }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open room options", exact: true }).click();
  await page.getByText("Group chat", { exact: true }).click();
  await expect(page.getByPlaceholder("Message the room...")).toBeVisible({ timeout: 15_000 });
}

test("B's community room chat message is visible to A", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.communityChatWriteEnabled, "Set DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_COMMUNITY_CHAT_WRITE_ONCE=true for the authorized room-chat fixture.");
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await openRoomChat(pageA, "A");
    await openRoomChat(pageB, "B");
    await pageB.getByPlaceholder("Message the room...").fill(marker);
    const sendResponse = pageB.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/rest/v1/community_challenge_room_messages"),
      { timeout: 20_000 },
    );
    await pageB.getByRole("button", { name: "Send room message", exact: true }).click();
    const response = await sendResponse;
    expect(response.status()).toBe(201);
    await expect(pageB.getByText(marker, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(pageA.getByText(marker, { exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
