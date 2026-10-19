jest.mock("../redis", () => ({
  redis: { incrementWithExpiry: jest.fn() },
  redisAvailable: true,
  requireRedisAvailable: jest.fn(),
}));

import { enforceRateLimit } from "../rateLimit";
import { redis } from "../redis";

const incrementWithExpiry = redis.incrementWithExpiry as jest.Mock;

describe("enforceRateLimit", () => {
  beforeEach(() => {
    incrementWithExpiry.mockReset();
  });

  it("uses one atomic backend operation for an allowed request", async () => {
    incrementWithExpiry.mockResolvedValue({ value: 2, ttlMs: 4_000 });

    await expect(
      enforceRateLimit(
        { bucket: "test", max: 3, windowMs: 5_000 },
        "user-1",
      ),
    ).resolves.toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 });

    expect(incrementWithExpiry).toHaveBeenCalledTimes(1);
    expect(incrementWithExpiry).toHaveBeenCalledWith(
      "rl:test:user-1",
      1,
      5_000,
      false,
    );
  });

  it("returns the expiry from the same atomic operation when blocked", async () => {
    incrementWithExpiry.mockResolvedValue({ value: 4, ttlMs: 3_200 });

    await expect(
      enforceRateLimit(
        { bucket: "test", max: 3, windowMs: 5_000 },
        "user-1",
      ),
    ).resolves.toEqual({ allowed: false, remaining: 0, retryAfterMs: 3_200 });

    expect(incrementWithExpiry).toHaveBeenCalledTimes(1);
  });
});
