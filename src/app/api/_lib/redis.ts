/** Supabase-backed replacement for the old Upstash command surface. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
function client(): SupabaseClient { const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SECRET_KEY; if(!url||!key) throw new Error("Supabase server configuration is missing"); cachedClient ??= createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}); return cachedClient; }
function expiry(ms:number) { return new Date(Date.now()+ms).toISOString(); }
async function read(key:string) { const {data,error}=await client().from("cache_entries").select("value,expires_at").eq("key",key).maybeSingle(); if(error) throw error; if(!data) return null; if(data.expires_at && Date.parse(data.expires_at)<=Date.now()) { await client().from("cache_entries").delete().eq("key",key); return null; } return data.value; }
async function write(key:string,value:any,ttlMs?:number) { const {error}=await client().from("cache_entries").upsert({key,value,expires_at:ttlMs?expiry(ttlMs):null,updated_at:new Date().toISOString()}); if(error) throw error; return "OK"; }
export class SupabaseUnavailableError extends Error { constructor(public readonly feature:string){super(`Supabase is required for ${feature}`);this.name="SupabaseUnavailableError";} }
export class RedisUnavailableError extends SupabaseUnavailableError {}
export const redisAvailable = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
export function requireRedisAvailable(feature:string){if(!redisAvailable) throw new RedisUnavailableError(feature);}
export const redis = {
  async get<T=unknown>(key:string):Promise<T|null>{return await read(key) as T|null;},
  async set(key:string,value:any,options?:any){const ttl=typeof options==="number"?options:options?.px;return write(key,value,ttl);},
  async del(key:string){const {error}=await client().from("cache_entries").delete().eq("key",key);if(error)throw error;return 1;},
  async incrementWithExpiry(key:string,amount:number,ttlMs:number|null,refreshExpiry=false){const {data,error}=await client().rpc("increment_cache_entry",{p_key:key,p_amount:amount,p_ttl_ms:ttlMs,p_refresh_expiry:refreshExpiry});if(error)throw error;const row=Array.isArray(data)?data[0]:data;const expiresAt=typeof row?.expires_at==="string"?Date.parse(row.expires_at):null;return {value:Number(row?.value??0),ttlMs:expiresAt===null?-1:Math.max(0,expiresAt-Date.now())};},
  async incr(key:string){return (await this.incrementWithExpiry(key,1,null)).value;},
  async incrby(key:string,amount:number){return (await this.incrementWithExpiry(key,amount,null)).value;},
  async pexpire(key:string,ms:number){const {data,error}=await client().from("cache_entries").update({expires_at:expiry(ms),updated_at:new Date().toISOString()}).eq("key",key).select("key").maybeSingle();if(error)throw error;return data?1:0;},
  async expire(key:string,seconds:number){return this.pexpire(key,seconds*1000);},
  async pttl(key:string){const {data}=await client().from("cache_entries").select("expires_at").eq("key",key).maybeSingle();return data?.expires_at?Math.max(0,Date.parse(data.expires_at)-Date.now()):-1;},
  async sadd(key:string,value:string){const {error}=await client().rpc("mutate_cache_set",{p_key:key,p_value:value,p_add:true,p_ttl_ms:null});if(error)throw error;return 1;},
  async srem(key:string,value:string){const {error}=await client().rpc("mutate_cache_set",{p_key:key,p_value:value,p_add:false,p_ttl_ms:null});if(error)throw error;return 1;},
  async sismember(key:string,value:string){const values=await read(key);return Array.isArray(values)&&values.includes(value)?1:0;},
  async smembers(key:string){const values=await read(key);return Array.isArray(values)?values:[];},
  async mget<T=unknown>(keys:string[]){return Promise.all(keys.map((key)=>read(key) as Promise<T|null>));},
};
