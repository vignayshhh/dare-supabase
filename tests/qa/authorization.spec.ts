import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

async function apiStatus(
  page: import("@playwright/test").Page,
  path: string,
  authorization?: string,
) {
  return page.evaluate(async ({ requestPath, requestAuthorization }) => {
    const response = await fetch(requestPath, {
      headers: requestAuthorization ? { Authorization: requestAuthorization } : {},
      credentials: "same-origin",
    });
    return response.status;
  }, { requestPath: path, requestAuthorization: authorization });
}

test("owner-only and admin-only routes reject unauthorized callers", async ({ browser }) => {
  const anonymous = await browser.newContext();
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto("/", { waitUntil: "networkidle" });
  await expect(await apiStatus(anonymousPage, "/api/users/me/email")).toBe(401);
  await anonymous.close();

  const accountC = await browser.newContext();
  const accountCPage = await accountC.newPage();
  const authenticatedFeed = accountCPage.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/posts/feed" &&
    request.headers().authorization?.startsWith("Bearer "),
  );
  await signIn(accountCPage, "C");
  await completeOnboardingIfShown(accountCPage);
  const authorization = (await authenticatedFeed).headers().authorization;
  expect(authorization?.startsWith("Bearer ")).toBe(true);
  await expect(await apiStatus(accountCPage, "/api/admin/ip-block", authorization)).toBe(403);
  await accountC.close();
});
