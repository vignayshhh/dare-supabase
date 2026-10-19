import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-chicken-out-${Date.now()}`;

async function openCreateAction(page: Page) {
  const home = page.getByLabel("Home", { exact: true });
  await home.dispatchEvent("pointerdown", { pointerType: "touch" });
  await page.waitForTimeout(800);
  await home.dispatchEvent("pointerup", { pointerType: "touch" });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
}

test("B can refuse a fresh A-to-B dare and the state persists", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.dareChickenOutEnabled,
    "Chicken-out writes require both DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_DARE_CHICKEN_OUT_ONCE=true.",
  );
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openCreateAction(pageA);
    await pageA.getByText("Give a Dare", { exact: true }).click();
    await pageA.getByText("Dare a Friend", { exact: true }).click();
    await expect(pageA.getByRole("heading", { name: "Give a Dare" })).toBeVisible();
    await pageA.getByPlaceholder("@username").fill(`@${qa.account("B").username.replace(/^@/, "")}`);
    const recipient = pageA.getByRole("button", { name: /DARE QA B.*dareqa_a1cb/i });
    await expect(recipient).toBeVisible({ timeout: 10_000 });
    await recipient.click();
    await pageA.getByPlaceholder("Describe the dare clearly enough that proof is undeniable...").fill(marker);
    const createResponse = pageA.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/dares",
      { timeout: 30_000 },
    );
    await pageA.getByRole("button", { name: "Send Dare", exact: true }).click();
    expect((await createResponse).ok()).toBe(true);

    const chickenOutRequests: string[] = [];
    pageB.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/chicken-out")) chickenOutRequests.push(request.url());
    });
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.getByLabel("Notifications").click();
    await pageB.getByLabel("Open dare alert organizer").click();
    const alert = pageB.getByText(/gave you a dare/i).first();
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await alert.click();
    const card = pageB.locator("article").filter({ hasText: marker }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const chickenOutResponse = pageB.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/chicken-out"),
      { timeout: 20_000 },
    );
    await card.getByRole("button", { name: "Refuse", exact: true }).click();
    const response = await chickenOutResponse;
    console.log("QA_CHICKEN_OUT_RESPONSE", response.status(), await response.text().catch(() => ""));
    await pageB.waitForTimeout(1_000);
    console.log("QA_CHICKEN_OUT_CARD", JSON.stringify((await card.innerText()).replace(/\s+/g, " ")));
    expect(chickenOutRequests.length).toBeGreaterThan(0);

    await pageA.getByLabel("Notifications").click();
    await pageA.getByLabel("Open dare alert organizer").click();
    await expect(pageA.getByText(marker, { exact: true }).last()).toBeVisible({ timeout: 20_000 });
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
