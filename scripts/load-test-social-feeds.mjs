#!/usr/bin/env node

const baseUrl = process.env.LOAD_TEST_BASE_URL || "http://localhost:3000";
const tokens = (
  process.env.LOAD_TEST_SUPABASE_ACCESS_TOKENS ||
  process.env.LOAD_TEST_SUPABASE_ACCESS_TOKEN ||
  ""
)
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);
const users = Number.parseInt(process.env.LOAD_TEST_USERS || "100", 10);
const rounds = Number.parseInt(process.env.LOAD_TEST_ROUNDS || "3", 10);
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || "20", 10);
const includeMutations = process.env.LOAD_TEST_MUTATIONS === "true";
const csrfToken = `load-test-${Date.now()}`;

if (tokens.length === 0) {
  console.error(
    "Set LOAD_TEST_SUPABASE_ACCESS_TOKEN or LOAD_TEST_SUPABASE_ACCESS_TOKENS to valid Supabase access token(s).",
  );
  process.exit(1);
}

const paths = [
  "/api/posts/feed?limit=20",
  "/api/truth/feed?limit=50",
  "/api/dares/feed?limit=50",
];

async function request(path, token, options = {}) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.method && options.method !== "GET"
        ? {
            "content-type": "application/json",
            "x-csrf-token": csrfToken,
            cookie: `csrf-token=${encodeURIComponent(csrfToken)}`,
          }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return {
    path,
    method: options.method || "GET",
    ok: res.ok,
    status: res.status,
    latencyMs: Date.now() - started,
    bytes: Buffer.byteLength(text),
    json,
  };
}

async function worker(jobs, results) {
  while (jobs.length > 0) {
    const job = jobs.shift();
    if (!job) return;
    try {
      if (job.kind === "feed") {
        results.push(await request(job.path, job.token));
        continue;
      }

      const create = await request("/api/posts", job.token, {
        method: "POST",
        body: {
          content: `Load test post ${Date.now()} ${Math.random().toString(36).slice(2)}`,
          media_type: "TEXT",
          media_url: null,
        },
      });
      results.push(create);

      const postId = create.json?.post?.id;
      if (!postId) continue;

      results.push(
        await request(`/api/posts/${encodeURIComponent(postId)}/like`, job.token, {
          method: "POST",
        }),
      );
      results.push(
        await request(`/api/posts/${encodeURIComponent(postId)}`, job.token, {
          method: "DELETE",
        }),
      );
    } catch (error) {
      results.push({
        path: job.path || job.kind,
        method: job.method || "GET",
        ok: false,
        status: 0,
        latencyMs: 0,
        bytes: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const jobs = [];
for (let round = 0; round < rounds; round += 1) {
  for (let user = 0; user < users; user += 1) {
    const token = tokens[user % tokens.length];
    paths.forEach((path) => jobs.push({ kind: "feed", path, token }));
    if (includeMutations) jobs.push({ kind: "mutation", token });
  }
}

const results = [];
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, () =>
    worker(jobs, results),
  ),
);

const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const percentile = (p) =>
  latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] || 0;
const failures = results.filter((r) => !r.ok);
const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
const byRoute = results.reduce((acc, r) => {
  const key = `${r.method || "GET"} ${r.path}`;
  const item = acc[key] || { requests: 0, failures: 0, latencies: [] };
  item.requests += 1;
  if (!r.ok) item.failures += 1;
  item.latencies.push(r.latencyMs);
  acc[key] = item;
  return acc;
}, {});

for (const item of Object.values(byRoute)) {
  item.latencies.sort((a, b) => a - b);
  item.p95Ms =
    item.latencies[Math.min(item.latencies.length - 1, Math.floor(item.latencies.length * 0.95))] ||
    0;
  delete item.latencies;
}

console.log(
  JSON.stringify(
    {
      baseUrl,
      users,
      tokenCount: tokens.length,
      rounds,
      includeMutations,
      warning:
        tokens.length === 1
          ? "Only one Supabase access token supplied; this measures load shape, not true per-user auth distribution."
        : undefined,
      requests: results.length,
      failures: failures.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      avgBytes: results.length ? Math.round(totalBytes / results.length) : 0,
      failuresByStatus: failures.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {}),
      byRoute,
    },
    null,
    2,
  ),
);
