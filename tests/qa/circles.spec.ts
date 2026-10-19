import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test.describe("Circles", () => {
  for (const account of ["A", "B"] as const) {
    test(`${account} loads the Circle boundary without an access error`, async ({ page }) => {
      await signIn(page, account);
      await completeOnboardingIfShown(page);
      await expect(page.locator(".circles-screen, .circle-context-header").first()).toBeVisible();
      await expect(page.locator("main [role='alert']")).toHaveCount(0);
      await expect(page.locator(".circles-error")).toHaveCount(0);
    });
  }

  test("A shares an active private Circle and B accepts its invite", async ({ browser }) => {
    test.skip(
      !qa.writeEnabled || !qa.circleWriteEnabled,
      "Requires DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_CIRCLE_WRITE_ONCE=true.",
    );

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await signIn(pageA, "A");
      await completeOnboardingIfShown(pageA);
      const name = (await pageA.locator(".circle-context-header strong").textContent())?.trim();
      if (!name) throw new Error("A did not expose an active Circle name.");

      await pageA.getByRole("button", { name: "Circle", exact: true }).click();
      await expect(pageA.getByRole("heading", { name, exact: true })).toBeVisible();
      await pageA.getByRole("button", { name: /Invite your people/ }).click();
      const inviteUrl = await pageA.getByLabel("Invitation link").inputValue();
      expect(inviteUrl).toMatch(/[?&]circleInvite=[a-f0-9]{48}$/);

      await signIn(pageB, "B");
      await completeOnboardingIfShown(pageB);
      const invite = new URL(inviteUrl);
      const switcher = pageB.getByLabel(/Switch Circle/);
      if (await switcher.isVisible().catch(() => false)) await switcher.click();
      await pageB.getByRole("button", { name: /Got an invite/ }).click();
      await pageB.locator("#circle-code").fill(invite.searchParams.get("circleInvite")!);
      await pageB.getByRole("button", { name: "Find my people" }).click();
      await expect(pageB.getByRole("heading", { name, exact: true })).toBeVisible();
      const accept = pageB.getByRole("button", { name: "Accept invitation" });
      if (await accept.isVisible().catch(() => false)) await accept.click();
      else await pageB.getByRole("button", { name: "Enter Circle" }).click();
      await expect(pageB.locator(".circle-context-header")).toContainText(name);

      await pageB.getByRole("button", { name: "Circle", exact: true }).click();
      await expect(pageB.getByRole("heading", { name, exact: true })).toBeVisible();
      await expect(pageB.locator(".circles-group-hero")).toContainText("2 people");
      await expect(pageB.locator(".circles-error")).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
