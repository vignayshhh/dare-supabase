import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("Dares navigation records browser errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: Array<{ path: string; error: string | null; resourceType: string }> = [];
  const avatarResponses: number[] = [];
  const badResponses: Array<{ path: string; status: number }> = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
  });
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 500)));
  page.on("requestfailed", (request) => failedRequests.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText || null, resourceType: request.resourceType() }));
  page.on("response", (response) => {
    if (response.url().includes("/storage/v1/object/sign/avatars/")) avatarResponses.push(response.status());
    if (response.status() >= 400) badResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
  });

  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  await page.waitForTimeout(2_000);

  const errorBoundary = await page.getByRole("heading", { name: /This page couldn/i }).isVisible().catch(() => false);
  console.log("QA_DARES_NAVIGATION", JSON.stringify({ consoleErrors, pageErrors, failedRequests, avatarResponses, badResponses, errorBoundary }));
  expect(errorBoundary).toBe(false);
});
