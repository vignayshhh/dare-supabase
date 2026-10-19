import {
  getResourceMetrics,
  instrumentSupabaseFetch,
  recordResourceMetric,
  resetResourceMetrics,
} from "@/lib/observability/resourceMetrics";

describe("resource metrics", () => {
  beforeEach(() => resetResourceMetrics());

  it("counts RPC requests and returned rows without consuming the response", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const mockedResponse = {
      ok: true,
      clone: () => ({ json: async () => rows }),
      json: async () => rows,
    } as unknown as Response;
    const fetcher = jest.fn(async () => mockedResponse) as unknown as typeof fetch;
    const instrumented = instrumentSupabaseFetch(fetcher);
    const response = await instrumented(
      "https://example.supabase.co/rest/v1/rpc/get_alert_page",
    );
    expect(await response.json()).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getResourceMetrics()).toMatchObject({
      supabase_rpcs: 1,
      supabase_rows: 2,
    });
  });

  it("resets independent API and Realtime counters", () => {
    recordResourceMetric("api_requests", 2);
    recordResourceMetric("realtime_joins");
    expect(getResourceMetrics()).toMatchObject({
      api_requests: 2,
      realtime_joins: 1,
    });
    resetResourceMetrics();
    expect(getResourceMetrics()).toMatchObject({
      api_requests: 0,
      realtime_joins: 0,
    });
  });
});
