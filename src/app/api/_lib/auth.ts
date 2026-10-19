import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface VerifiedSupabaseUser { uid: string; email?: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown>; }
export class AuthError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
const freshAuthByRequest = new WeakMap<Request, Promise<VerifiedSupabaseUser>>();

/** Validates the bearer token with Supabase Auth. Never trust a body user ID. */
export async function verifyRequestAuth(req: Request, opts: { requireAdmin?: boolean } = {}): Promise<VerifiedSupabaseUser> {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) throw new AuthError(401, "Missing Authorization: Bearer header");
  const token = header.slice(7).trim();
  if (!token) throw new AuthError(401, "Empty bearer token");
  let verification = freshAuthByRequest.get(req);
  if (!verification) {
    verification = (async () => {
      const { data, error } = await getSupabaseAdminClient().auth.getUser(token);
      if (error || !data.user) throw new AuthError(401, "Invalid or expired access token");
      return { uid: data.user.id, email: data.user.email, app_metadata: data.user.app_metadata, user_metadata: data.user.user_metadata };
    })();
    freshAuthByRequest.set(req, verification);
  }
  const user = await verification;
  if (opts.requireAdmin && user.app_metadata.role !== "admin") throw new AuthError(403, "Admin role required");
  return user;
}
