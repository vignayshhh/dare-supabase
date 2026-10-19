import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { qa } from "./qa-env";

const messagesPerAccount = 12;
const totalMessages = messagesPerAccount * 3;
const run = `${qa.runId}-${Date.now()}`;

type Account = "A" | "B" | "C";

function installProbe(page: Page) {
  return page.addInitScript(() => {
    (window as any).__DARE_QA__ = true;
    const encoder = new TextEncoder();
    const stats = {
      sockets: 0,
      opens: 0,
      closes: 0,
      outgoingFrames: 0,
      incomingFrames: 0,
      outgoingBytes: 0,
      incomingBytes: 0,
      broadcastMessages: 0,
      topics: [] as string[],
    };
    (window as any).__dareCircleQaRealtime = stats;
    const Native = window.WebSocket;
    const bytes = (value: unknown) => {
      if (typeof value === "string") return encoder.encode(value).byteLength;
      if (value instanceof ArrayBuffer) return value.byteLength;
      if (ArrayBuffer.isView(value)) return value.byteLength;
      return 0;
    };
    const inspect = (value: unknown, incoming: boolean) => {
      stats[incoming ? "incomingFrames" : "outgoingFrames"] += 1;
      stats[incoming ? "incomingBytes" : "outgoingBytes"] += bytes(value);
      if (typeof value !== "string") return;
      try {
        const payload = JSON.parse(value);
        if (typeof payload.topic === "string" && !stats.topics.includes(payload.topic)) stats.topics.push(payload.topic);
        if (incoming && payload.event === "broadcast" && payload.payload?.event === "message") stats.broadcastMessages += 1;
      } catch { /* Non-JSON WebSocket frames are not Supabase protocol frames. */ }
    };
    const Wrapped = function (this: WebSocket, ...args: ConstructorParameters<typeof WebSocket>) {
      const socket = new Native(...args);
      stats.sockets += 1;
      socket.addEventListener("open", () => { stats.opens += 1; });
      socket.addEventListener("close", () => { stats.closes += 1; });
      socket.addEventListener("message", (event) => inspect(event.data, true));
      const send = socket.send.bind(socket);
      socket.send = (value: string | ArrayBufferLike | Blob | ArrayBufferView) => {
        inspect(value, false);
        return send(value);
      };
      return socket;
    } as unknown as typeof WebSocket;
    (Wrapped as any).prototype = Native.prototype;
    window.WebSocket = Wrapped;
  });
}

async function circles(page: Page) {
  return page.evaluate(async () => {
    const client = (window as any).__DARE_QA_SUPABASE__;
    const { data, error } = await client.from("circles").select("id,name,circle_members(user_id)");
    if (error) throw new Error(error.message);
    return data as { id: string; name: string; circle_members: { user_id: string }[] }[];
  });
}

async function createCircle(page: Page, name: string) {
  return page.evaluate(async (circleName) => {
    const client = (window as any).__DARE_QA_SUPABASE__;
    const created = await client.rpc("create_circle", { p_name: circleName, p_avatar: "🧪" });
    if (created.error) throw new Error(created.error.message);
    const circleId = Array.isArray(created.data) ? created.data[0] : created.data;
    const invitation = await client.rpc("create_circle_invitation", { p_circle: circleId, p_max_uses: 3 });
    if (invitation.error) throw new Error(invitation.error.message);
    const row = Array.isArray(invitation.data) ? invitation.data[0] : invitation.data;
    return { circleId: String(circleId), secret: String(row.token || row.code) };
  }, name);
}

async function acceptCircle(page: Page, secret: string) {
  return page.evaluate(async (inviteSecret) => {
    const client = (window as any).__DARE_QA_SUPABASE__;
    const session = (await client.auth.getSession()).data.session;
    if (!session) throw new Error("Missing QA session.");
    const csrf = crypto.randomUUID();
    document.cookie = `csrf-token=${csrf}; Path=/; SameSite=Lax`;
    const response = await fetch("/api/circles/invitations", {
      method: "POST",
      headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ action: "accept", secret: inviteSecret }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Circle acceptance failed (${response.status}): ${body}`);
    return JSON.parse(body).circleId as string;
  }, secret);
}

async function enter(page: Page, account: Account, circleId: string) {
  const userId = await page.evaluate(async () => (await (window as any).__DARE_QA_SUPABASE__.auth.getUser()).data.user.id);
  await page.evaluate(({ id, target }) => localStorage.setItem(`dare-active-circle:${id}`, target), { id: userId, target: circleId });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page.locator(".circle-chat-entry").click();
  await expect(page.getByLabel("Connected", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Message your Circle")).toBeVisible();
}

async function realtime(page: Page) {
  return page.evaluate(() => {
    const client = (window as any).__DARE_QA_SUPABASE__;
    return {
      ...(window as any).__dareCircleQaRealtime,
      activeTopics: (client?.realtime?.getChannels?.() ?? []).map((channel: any) => channel.topic).filter(Boolean),
    };
  });
}

test("A/B/C Circle chat sustained message envelope uses one room channel and no receiver history reads", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Requires the authorized bounded QA write flag.");
  test.setTimeout(240_000);
  const accounts: Account[] = ["A", "B", "C"];
  const contexts = await Promise.all(accounts.map(() => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const calls = Object.fromEntries(accounts.map(account => [account, { epochReads: 0, historyReads: 0, sends: 0 }]));
  const latencies: number[] = [];
  try {
    for (const page of pages) await installProbe(page);
    await Promise.all(pages.map((page, index) => signIn(page, accounts[index])));
    const registries = await Promise.all(pages.map(circles));
    let shared = registries[0]
      .filter(circle => registries.slice(1).every(registry => registry.some(candidate => candidate.id === circle.id)))
      .sort((left, right) => left.circle_members.length - right.circle_members.length)[0];
    let createdFixture: string | null = null;
    if (!shared) {
      let fixture: { circleId: string; secret: string } | null = null;
      const failures: string[] = [];
      for (let index = 0; index < pages.length && !fixture; index += 1) {
        try { fixture = await createCircle(pages[index], `QA group load ${run}`); }
        catch (error) { failures.push(`${accounts[index]}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      expect(fixture, `Could not create the authorized disposable A/B/C group fixture: ${failures.join(" | ")}`).toBeTruthy();
      // The creator can see the new Circle; the two other QA participants accept its one-time fixture invitation.
      for (const page of pages) {
        const ownsFixture = await page.evaluate(async (circleId) => {
          const client = (window as any).__DARE_QA_SUPABASE__;
          const { data } = await client.from("circles").select("id").eq("id", circleId);
          return Boolean(data?.length);
        }, fixture!.circleId);
        if (!ownsFixture) await acceptCircle(page, fixture!.secret);
      }
      createdFixture = fixture!.circleId;
      shared = { id: fixture!.circleId, name: `QA group load ${run}`, circle_members: [] };
    }
    for (const page of pages) {
      page.on("request", request => {
        const url = request.url();
        const account = accounts[pages.indexOf(page)];
        const select = new URL(url).searchParams.get("select");
        if (request.method() === "GET" && url.includes("/rest/v1/circles") && select === "chat_epoch") calls[account].epochReads += 1;
        if (request.method() === "GET" && url.includes("/rest/v1/circle_chat_messages")) calls[account].historyReads += 1;
        if (request.method() === "POST" && url.includes("/rpc/send_circle_chat")) calls[account].sends += 1;
      });
    }
    await Promise.all(pages.map((page, index) => enter(page, accounts[index], shared.id)));
    const marker = (index: number, account: Account) => `CIRCLE-LOAD-${run}-${account}-${String(index).padStart(2, "0")}`;
    for (let index = 0; index < totalMessages; index += 1) {
      const senderIndex = index % pages.length;
      const sender = pages[senderIndex];
      const text = marker(index + 1, accounts[senderIndex]);
      const started = Date.now();
      await sender.getByLabel("Message your Circle").fill(text);
      await sender.getByRole("button", { name: "Send message", exact: true }).click();
      await Promise.all(pages.filter((_, pageIndex) => pageIndex !== senderIndex).map(page => expect(page.locator(".circle-chat-message").filter({ hasText: text })).toBeVisible({ timeout: 12_000 })));
      latencies.push(Date.now() - started);
    }
    const report = {
      messagesPerAccount,
      totalMessages,
      createdFixture,
      calls,
      realtime: Object.fromEntries(await Promise.all(pages.map(async (page, index) => [accounts[index], await realtime(page)]))),
      latencyMs: (() => { const sorted = [...latencies].sort((a, b) => a - b); return { min: sorted[0], p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) }; })(),
    };
    console.log("DARE_CIRCLE_CHAT_RESOURCE_ENVELOPE", JSON.stringify(report));
    for (const account of accounts) {
      expect(calls[account].historyReads, `${account} only reads the bounded snapshot at room entry`).toBe(1);
      expect(calls[account].sends).toBe(messagesPerAccount);
      expect(calls[account].epochReads, `${account} reuses the chat-list epoch on ordinary room entry`).toBe(0);
    }
    expect(report.realtime.A.activeTopics.filter((topic: string) => topic.startsWith("realtime:circle-chat:")).length).toBe(1);
    expect(report.realtime.B.activeTopics.filter((topic: string) => topic.startsWith("realtime:circle-chat:")).length).toBe(1);
    expect(report.realtime.C.activeTopics.filter((topic: string) => topic.startsWith("realtime:circle-chat:")).length).toBe(1);
    expect(report.realtime.A.closes + report.realtime.B.closes + report.realtime.C.closes).toBe(0);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
