import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test("C can reach and vote on an approved direct Dare after a fresh A/C friendship", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Relationship setup requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(90_000);
  const accountA = await browser.newContext();
  const accountC = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageC = await accountC.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.getByRole("button", { name: "DARE QA A", exact: true }).first().click();
    await pageA.getByLabel("Find people", { exact: true }).click();
    const profileSearch = pageA.waitForResponse((candidate) =>
      candidate.url().includes("/rest/v1/rpc/search_profiles"),
    );
    await pageA.getByPlaceholder("Search by username or display name").fill(qa.account("C").username);
    const profileSearchResponse = await profileSearch;
    const profiles = profileSearchResponse.json() as Promise<Array<{ id?: string; username?: string }>>;
    const cProfile = (await profiles).find((profile) => profile.username?.replace(/^@/, "") === qa.account("C").username.replace(/^@/, ""));
    expect(cProfile?.id).toBeTruthy();

    const searchUrl = new URL(profileSearchResponse.url());
    const apiKey = profileSearchResponse.request().headers().apikey;
    expect(apiKey).toBeTruthy();
    const session = await pageA.request.post(
      `${searchUrl.protocol}//${searchUrl.host}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: apiKey!, "content-type": "application/json" },
        data: { email: qa.account("A").email, password: qa.account("A").password },
      },
    );
    expect(session.status()).toBe(200);
    const accessToken = (await session.json() as { access_token?: string }).access_token;
    expect(accessToken).toBeTruthy();
    const cleanup = await pageA.evaluate(async ({ userId, token, key }) => {
      const csrf = document.cookie.match(/(?:^|;\\s*)csrf-token=([^;]+)/)?.[1];
      const response = await fetch(`/api/friends/between?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: key,
          "x-csrf-token": csrf ? decodeURIComponent(csrf) : "",
        },
      });
      return { status: response.status, body: await response.text() };
    }, { userId: cProfile!.id!, token: accessToken!, key: apiKey! });
    expect(cleanup.status, cleanup.body).toBe(200);

    await pageA.reload({ waitUntil: "networkidle" });
    await pageA.getByRole("button", { name: "DARE QA A", exact: true }).first().click();
    await pageA.getByLabel("Find people", { exact: true }).click();
    await pageA.getByPlaceholder("Search by username or display name").fill(qa.account("C").username);
    await pageA.getByText("DARE QA C", { exact: true }).click();
    const addFriend = pageA.getByRole("button", { name: /Add friend|Send Friend Request/ }).first();
    await expect(addFriend).toBeVisible({ timeout: 10_000 });
    const response = pageA.waitForResponse((candidate) =>
      candidate.request().method() === "POST" && new URL(candidate.url()).pathname === "/api/friends/request",
    );
    await addFriend.click();
    const createdRequest = await response;
    expect(createdRequest.status()).toBe(200);
    const friendshipId = ((await createdRequest.json()) as { friendship?: { id?: string } }).friendship?.id;
    expect(friendshipId).toBeTruthy();

    await signIn(pageC, "C");
    await completeOnboardingIfShown(pageC);
    await pageC.getByLabel("Notifications", { exact: true }).click();
    // The alert presents the actor as @username rather than display name.
    await expect(pageC.getByText(/sent you a friend request/i).first()).toBeVisible();
    const requestCard = pageC.locator(`.alerts-card[data-entity-id="${friendshipId}"]`);
    const accept = requestCard.getByRole("button", { name: "Accept", exact: true });
    await expect(accept).toBeVisible();
    const accepted = pageC.waitForResponse((candidate) =>
      candidate.request().method() === "PATCH" && /^\/api\/friends\/[^/]+$/.test(new URL(candidate.url()).pathname),
    );
    await accept.click();
    expect((await accepted).status()).toBe(200);

    const cSession = await pageC.request.post(
      `${searchUrl.protocol}//${searchUrl.host}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: apiKey!, "content-type": "application/json" },
        data: { email: qa.account("C").email, password: qa.account("C").password },
      },
    );
    expect(cSession.status()).toBe(200);
    const cAccessToken = (await cSession.json() as { access_token?: string }).access_token;
    expect(cAccessToken).toBeTruthy();
    const feed = await pageC.evaluate(async ({ token, key }) => {
      const response = await fetch("/api/dares/feed?limit=20&refresh=1", {
        headers: { Authorization: `Bearer ${token}`, apikey: key },
      });
      const body = await response.json() as {
        dares?: Array<{
          state?: string;
          proof?: { url?: string };
          challenger?: { nickname?: string };
          receiver?: { nickname?: string };
        }>;
      };
      return {
        status: response.status,
        hasPublishableFixture: (body.dares || []).some(
          (dare) =>
            dare.state === "ACCEPTED_REAL" &&
            Boolean(dare.proof?.url) &&
            [dare.challenger?.nickname, dare.receiver?.nickname].some((name) =>
              /DARE QA A|DARE QA B/.test(name || ""),
            ),
        ),
      };
    }, { token: cAccessToken!, key: apiKey! });
    expect(feed.status).toBe(200);
    expect(feed.hasPublishableFixture).toBe(true);

    await pageC.reload({ waitUntil: "networkidle" });
    await pageC.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
    await expect(pageC.getByText("No approved dares yet", { exact: true })).not.toBeVisible();
    const activeEntry = pageC.locator('[data-reel-index="0"]');
    await expect(activeEntry).toBeVisible({ timeout: 20_000 });
    await activeEntry.locator(".pop-dare-cover-card").dblclick();
    await expect
      .poll(() =>
        activeEntry.locator(".pop-dare-proof-card").evaluate(
          (element) => getComputedStyle(element).pointerEvents,
        ),
      )
      .toBe("auto");
    const realVote = activeEntry.locator(".pop-dare-proof-card .dare-real-btn");
    await expect(realVote).toBeVisible({ timeout: 20_000 });
    const vote = pageC.waitForResponse((candidate) =>
      candidate.request().method() === "POST" && /^\/api\/dares\/[^/]+\/vote$/.test(new URL(candidate.url()).pathname),
    );
    await realVote.click();
    const confirm = pageC.getByRole("button", { name: "You think this is Real", exact: true });
    await expect(confirm).toBeVisible();
    await confirm.click();
    expect((await vote).status()).toBe(200);
    await expect(confirm).toBeVisible();
  } finally {
    await accountC.close();
    await accountA.close();
  }
});
