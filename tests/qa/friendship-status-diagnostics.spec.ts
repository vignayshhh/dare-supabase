import { test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("friendship notification rehydration records sanitized diagnostics", async ({ page }) => {
  const responses: Array<{ path: string; status: number; itemTypes?: string[] }> = [];
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!url.pathname.includes("get_alert_page") && !url.pathname.includes("friendships")) return;
    const payload = await response.json().catch(() => null) as { items?: Array<{ type?: unknown }>; friendship?: { status?: unknown } } | null;
    responses.push({
      path: url.pathname,
      status: response.status(),
      itemTypes: Array.isArray(payload?.items)
        ? payload.items.map((item) => typeof item.type === "string" ? item.type : "missing")
        : payload?.friendship?.status ? [String(payload.friendship.status)] : undefined,
    });
  });

  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await page.waitForTimeout(2_000);
  const buttons = await page.getByRole("button").allTextContents();
  console.log("QA_FRIENDSHIP_REHYDRATION", JSON.stringify({ responses, buttons }));
});
