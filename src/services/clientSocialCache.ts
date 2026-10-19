import { getActiveCircleId } from "@/lib/circleContext";
const entries = new Map<string, { value: unknown; expires: number }>();
/** Browser-only bounded cache. Never imports privileged server infrastructure. */
export const redisCache = {
  async get<T>(key: string): Promise<T | null> {
    const entry = entries.get(`${getActiveCircleId()}:${key}`);
    return entry && entry.expires > Date.now() ? (entry.value as T) : null;
  },
  async set(key: string, value: unknown, seconds: number) {
    if (entries.size >= 200) entries.delete(entries.keys().next().value!);
    entries.set(`${getActiveCircleId()}:${key}`, {
      value,
      expires: Date.now() + seconds * 1000,
    });
  },
};
