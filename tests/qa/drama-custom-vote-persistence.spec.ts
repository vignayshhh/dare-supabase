import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function customFilter(page: Page) {
  // Next's development badge covers the first nav slot on narrow screens.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await page.getByRole("button", { name: /Filter cards:/i }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
}

async function undoVote(page: Page, card: import("@playwright/test").Locator, id: string) {
  const confirmation = card.getByRole("button", { name: /^You think this is/ });
  const write = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === `/api/drama/${id}/vote`,
  );
  await confirmation.hover();
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  const response = await write;
  expect(response.status(), await response.text()).toBe(200);
  expect((await response.json()).removed).toBe(true);
  await expect(confirmation).not.toBeVisible();
}

test("A votes on B's retained Custom card and B reads the durable vote", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const feed = pageA.waitForResponse((response) =>
      response.request().method() === "GET" && new URL(response.url()).pathname === "/api/drama/feed",
    );
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await customFilter(pageA);
    const data = await (await feed).json();
    const fixture = data.customs?.find((post: any) => post.statement?.startsWith("DARE-QA-") && post.creator?.name === "DARE QA B");
    expect(fixture, "Expected a retained B-authored QA Custom card").toBeTruthy();
    const card = pageA.locator("article").filter({ hasText: fixture.statement }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const selected = card.getByRole("button", { name: `You think this is ${fixture.choiceOneText}`, exact: true });
    if (await card.getByRole("button", { name: `You think this is ${fixture.choiceTwoText}`, exact: true }).isVisible().catch(() => false)) {
      await undoVote(pageA, card, fixture.id);
    }
    if (!(await selected.isVisible().catch(() => false))) {
      const choice = card.getByRole("button", { name: fixture.choiceOneText, exact: true });
      await choice.click({ trial: true });
      const write = pageA.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === `/api/drama/${fixture.id}/vote`,
      );
      await choice.click();
      const response = await write;
      expect(response.status(), await response.text()).toBe(200);
    }
    await expect(selected).toBeVisible();
    await pageA.reload({ waitUntil: "networkidle" });
    await customFilter(pageA);
    await expect(selected).toBeVisible({ timeout: 20_000 });
    await undoVote(pageA, card, fixture.id);
    const changed = pageA.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === `/api/drama/${fixture.id}/vote`,
    );
    await card.getByRole("button", { name: fixture.choiceTwoText, exact: true }).click();
    expect((await changed).status()).toBe(200);
    await pageA.reload({ waitUntil: "networkidle" });
    await customFilter(pageA);
    await expect(card.getByRole("button", { name: `You think this is ${fixture.choiceTwoText}`, exact: true })).toBeVisible();

    const pageB = await contextB.newPage();
    const recipientFeed = pageB.waitForResponse((response) =>
      response.request().method() === "GET" && new URL(response.url()).pathname === "/api/drama/feed",
    );
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await customFilter(pageB);
    const recipientData = await (await recipientFeed).json();
    const persisted = recipientData.customs.find((post: any) => post.id === fixture.id);
    const voter = Object.values(persisted.voters).find((person: any) => person.name === "DARE QA A") as { id: string } | undefined;
    expect(voter).toBeTruthy();
    expect(persisted.votes[voter!.id]).toBe("choiceTwo");
    const recipientCard = pageB.locator("article").filter({ hasText: fixture.statement }).last();
    await expect(recipientCard.getByRole("button", { name: "See who voted" })).toContainText("1 vote");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
