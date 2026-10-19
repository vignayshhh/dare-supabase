/**
 * Supabase-backed server cache with a bounded process-local front cache.
 * PostgreSQL remains authoritative across server instances.
 */
class SupabaseCacheService {
  private readonly memory = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly maxMemoryEntries = 1_000;
  private stats = { hits: 0, memoryHits: 0, databaseHits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 };

  private async admin(): Promise<any> {
    if (typeof window !== "undefined") return null;
    const mod = await import("@/lib/supabase/admin");
    return mod.getPrivilegedSupabaseClient();
  }

  private remember(key: string, value: unknown, expiresAt: number): void {
    this.memory.delete(key);
    this.memory.set(key, { value, expiresAt });
    while (this.memory.size > this.maxMemoryEntries) {
      const oldestKey = this.memory.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.memory.delete(oldestKey);
    }
  }

  private readMemory<T>(key: string, now = Date.now()): T | null {
    const cached = this.memory.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
      this.memory.delete(key);
      return null;
    }
    this.memory.delete(key);
    this.memory.set(key, cached);
    this.stats.hits += 1;
    this.stats.memoryHits += 1;
    return cached.value as T;
  }

  async get<T>(key: string): Promise<T | null> {
    if (typeof window !== "undefined") return null;
    const fromMemory = this.readMemory<T>(key);
    if (fromMemory !== null) return fromMemory;
    try {
      const supabase = await this.admin();
      const { data, error } = await supabase.from("cache_entries").select("value,expires_at").eq("key", key).maybeSingle();
      if (error) throw error;
      const expiresAt = data?.expires_at ? Date.parse(data.expires_at) : Number.POSITIVE_INFINITY;
      if (!data || expiresAt <= Date.now()) {
        this.stats.misses += 1;
        return null;
      }
      this.remember(key, data.value, expiresAt);
      this.stats.hits += 1;
      this.stats.databaseHits += 1;
      return data.value as T;
    } catch {
      this.stats.errors += 1;
      return null;
    }
  }

  async getMany<T>(keys: string[]): Promise<Array<T | null>> {
    if (typeof window !== "undefined" || keys.length === 0) return [];
    const results = new Map<string, T | null>();
    const missingKeys: string[] = [];
    keys.forEach((key) => {
      const cached = this.readMemory<T>(key);
      if (cached === null) missingKeys.push(key);
      else results.set(key, cached);
    });

    if (missingKeys.length > 0) {
      try {
        const supabase = await this.admin();
        const { data, error } = await supabase.from("cache_entries").select("key,value,expires_at").in("key", missingKeys);
        if (error) throw error;
        const now = Date.now();
        const rows = new Map((data ?? []).map((row: any) => [String(row.key), row]));
        missingKeys.forEach((key) => {
          const row = rows.get(key) as any;
          const expiresAt = row?.expires_at ? Date.parse(row.expires_at) : Number.POSITIVE_INFINITY;
          if (!row || expiresAt <= now) {
            results.set(key, null);
            this.stats.misses += 1;
            return;
          }
          this.remember(key, row.value, expiresAt);
          results.set(key, row.value as T);
          this.stats.hits += 1;
          this.stats.databaseHits += 1;
        });
      } catch {
        this.stats.errors += 1;
        missingKeys.forEach((key) => results.set(key, null));
      }
    }
    return keys.map((key) => results.get(key) ?? null);
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (typeof window !== "undefined") return;
    const expiresAt = Date.now() + ttlSeconds * 1000;
    try {
      const supabase = await this.admin();
      const { error } = await supabase.from("cache_entries").upsert({ key, value, expires_at: new Date(expiresAt).toISOString(), updated_at: new Date().toISOString() });
      if (error) throw error;
      this.remember(key, value, expiresAt);
      this.stats.sets += 1;
    } catch {
      this.stats.errors += 1;
    }
  }

  async setMany(entries: Array<{ key: string; value: unknown; ttlSeconds?: number }>): Promise<void> {
    if (typeof window !== "undefined" || entries.length === 0) return;
    const unique = new Map(entries.filter((entry) => entry.key).map((entry) => [entry.key, entry]));
    for (const batch of Array.from(unique.values()).slice(0, 10000).reduce<Array<typeof entries>>((all, entry, index) => { const chunk = Math.floor(index / 100); (all[chunk] ||= []).push(entry); return all; }, [])) {
      const now = Date.now();
      const rows = batch.map((entry) => ({ key: entry.key, value: entry.value, expires_at: new Date(now + (entry.ttlSeconds ?? 300) * 1000).toISOString(), updated_at: new Date().toISOString() }));
      try { const supabase = await this.admin(); const { error } = await supabase.from("cache_entries").upsert(rows); if (error) throw error; rows.forEach((row) => this.remember(row.key, row.value, Date.parse(row.expires_at))); this.stats.sets += rows.length; }
      catch { this.stats.errors += 1; }
    }
  }

  async delete(key: string): Promise<void> {
    if (typeof window !== "undefined") return;
    this.memory.delete(key);
    try {
      const supabase = await this.admin();
      const { error } = await supabase.from("cache_entries").delete().eq("key", key);
      if (error) throw error;
      this.stats.deletes += 1;
    } catch {
      this.stats.errors += 1;
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (typeof window !== "undefined") return;
    const unique = [...new Set(keys.filter(Boolean))];
    unique.forEach((key) => this.memory.delete(key));
    for (let index = 0; index < unique.length; index += 100) {
      try { const supabase = await this.admin(); const { error } = await supabase.from("cache_entries").delete().in("key", unique.slice(index, index + 100)); if (error) throw error; this.stats.deletes += Math.min(100, unique.length - index); }
      catch { this.stats.errors += 1; }
    }
  }

  async incrementMany(keys: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (typeof window !== "undefined") return result;
    for (let index = 0; index < [...new Set(keys)].length; index += 100) {
      const batch = [...new Set(keys)].slice(index, index + 100);
      try {
        const supabase = await this.admin();
        const { data, error } = await supabase.rpc("increment_cache_entries", { p_keys: batch, p_ttl_ms: 300000, p_refresh_expiry: true });
        if (error) throw error;
        (data ?? []).forEach((row: any) => { const value = Number(row.value); result.set(String(row.key), value); this.remember(String(row.key), value, row.expires_at ? Date.parse(row.expires_at) : Date.now() + 300000); });
      } catch { this.stats.errors += 1; }
    }
    return result;
  }

  async increment(key: string): Promise<number | null> {
    if (typeof window !== "undefined") return null;
    try {
      const supabase = await this.admin();
      const { data, error } = await supabase.rpc("increment_cache_entry", { p_key: key, p_amount: 1, p_ttl_ms: 300_000, p_refresh_expiry: true });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const value = Number(row?.value ?? 0);
      const expiresAt = row?.expires_at ? Date.parse(row.expires_at) : Date.now() + 300_000;
      this.remember(key, value, expiresAt);
      return value;
    } catch {
      this.stats.errors += 1;
      return null;
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (typeof window !== "undefined") return;
    const sqlPattern = pattern.replaceAll("*", "%");
    const escapedParts = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const matcher = new RegExp(`^${escapedParts.join(".*")}$`);
    for (const key of this.memory.keys()) {
      if (matcher.test(key)) this.memory.delete(key);
    }
    try {
      const supabase = await this.admin();
      const { error } = await supabase.from("cache_entries").delete().like("key", sqlPattern);
      if (error) throw error;
    } catch {
      this.stats.errors += 1;
    }
  }

  getStats() {
    return { ...this.stats, memoryEntries: this.memory.size, backend: "supabase+memory" };
  }
}

export const redisCache = new SupabaseCacheService();
