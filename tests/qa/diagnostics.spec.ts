import { test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";

test("authenticated feed captures sanitized request diagnostics", async ({ page }) => {
  const failures: Array<{ status: number; path: string }> = [];
  const feedPages: Array<{ status: number; cached: boolean; containsQaMarker: boolean }> = [];
  let restOrigin = "";
  let publicApiKey = "";
  page.on("response", async (response) => {
    const status = response.status();
    const url = new URL(response.url());
    if (status >= 400 && (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/api/"))) {
      failures.push({ status, path: url.pathname });
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      restOrigin = url.origin;
      publicApiKey = response.request().headers()["apikey"] || publicApiKey;
    }
    if (url.pathname === "/api/posts/feed") {
      const payload = await response.json().catch(() => null) as { cached?: unknown; items?: Array<{ content?: unknown }> } | null;
      feedPages.push({
        status,
        cached: payload?.cached === true,
        containsQaMarker: (payload?.items ?? []).some((item) => typeof item.content === "string" && item.content.includes("DARE-QA-")),
      });
    }
  });
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  await page.waitForTimeout(3_000);
  const markerStorageCheck = restOrigin && publicApiKey
    ? await page.evaluate(async ({ origin, apiKey }) => {
        const authValue = Object.values(localStorage)
          .map((value) => {
            try { return JSON.parse(value) as { access_token?: unknown }; } catch { return null; }
          })
          .find((value): value is { access_token: string } => typeof value?.access_token === "string");
        if (!authValue) return { status: 0, count: -1 };
        const marker = "DARE-QA-20261013-a1c-feed-01";
        const response = await fetch(`${origin}/rest/v1/posts?select=id&content=eq.${encodeURIComponent(marker)}`, {
          headers: { apikey: apiKey, Authorization: `Bearer ${authValue.access_token}` },
        });
        const rows = await response.json().catch(() => []);
        return { status: response.status, count: Array.isArray(rows) ? rows.length : -1 };
      }, { origin: restOrigin, apiKey: publicApiKey })
    : { status: 0, count: -1 };
  const visibleButtons = await page.getByRole("button").evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const style = window.getComputedStyle(button);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((button) => button.getAttribute("aria-label") || button.textContent?.trim() || "")
      .filter(Boolean)
      .slice(0, 80),
  );
  console.log("QA_NETWORK_DIAGNOSTICS", JSON.stringify({ failures, feedPages, markerStorageCheck, visibleButtons }));
});
