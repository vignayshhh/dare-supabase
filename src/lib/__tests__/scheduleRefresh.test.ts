import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";

describe("scheduleRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("coalesces burst events into one refresh", () => {
    const refresh = jest.fn();
    const scheduler = scheduleRefresh(refresh, 40);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    jest.advanceTimersByTime(39);
    expect(refresh).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels pending refresh when subscription closes", () => {
    const refresh = jest.fn();
    const scheduler = scheduleRefresh(refresh, 40);

    scheduler.schedule();
    scheduler.cancel();
    jest.advanceTimersByTime(40);

    expect(refresh).not.toHaveBeenCalled();
  });
});
