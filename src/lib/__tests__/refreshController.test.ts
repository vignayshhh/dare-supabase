import { createRefreshController } from "@/lib/realtime/createRefreshController";

describe("createRefreshController", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("coalesces requests and runs one trailing refresh", async () => {
    let resolve!: (value: number) => void;
    const loader = jest.fn(() => new Promise<number>((done) => { resolve = done; }));
    const results: number[] = [];
    const controller = createRefreshController(loader, (value: unknown) => results.push(value as number), 10);
    controller.requestRefresh(); controller.requestRefresh();
    jest.advanceTimersByTime(10);
    expect(loader).toHaveBeenCalledTimes(1);
    controller.requestRefresh();
    resolve(1);
    await Promise.resolve();
    jest.advanceTimersByTime(10);
    expect(loader).toHaveBeenCalledTimes(2);
    controller.dispose();
    expect(results).toEqual([1]);
  });

  it("stops hidden and disposed refreshes", () => {
    const loader = jest.fn(async () => 1);
    const controller = createRefreshController(loader, () => undefined, 10);
    controller.setVisible(false); controller.requestRefresh(); jest.advanceTimersByTime(20);
    expect(loader).not.toHaveBeenCalled();
    controller.dispose(); controller.setVisible(true); controller.requestRefresh(); jest.advanceTimersByTime(20);
    expect(loader).not.toHaveBeenCalled();
  });

  it("passes the strongest coalesced reason to the loader", async () => {
    const reasons: string[] = [];
    const loader = jest.fn(async (_signal: AbortSignal, reason?: string) => { reasons.push(reason ?? ""); return 1; });
    const controller = createRefreshController(loader, () => undefined, 10);
    controller.requestRefresh("degraded");
    controller.requestRefresh("revision-gap");
    jest.advanceTimersByTime(10);
    await Promise.resolve();
    expect(reasons).toEqual(["revision-gap"]);
    controller.dispose();
  });

  it("promotes queued degraded recovery when a stronger event arrives", async () => {
    const loader = jest.fn(async () => 1);
    const controller = createRefreshController(loader, () => undefined, 10);
    controller.requestRefresh("degraded");
    jest.advanceTimersByTime(100);
    expect(loader).not.toHaveBeenCalled();
    controller.requestRefresh("interaction");
    jest.advanceTimersByTime(10);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});
