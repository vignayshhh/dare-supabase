/** Bootstrap an admin in a fresh Supabase project.
 * Usage: SUPABASE_SECRET_KEY=... NEXT_PUBLIC_SUPABASE_URL=... tsx scripts/set-admin.ts <auth-user-uuid>
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const uid = process.argv[2];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !secret) throw new Error("Usage: set Supabase env vars and pass an auth user UUID");
  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.updateUserById(uid, { app_metadata: { role: "admin" } });
  if (error) throw error;
  console.log(`Granted admin role to ${uid}. User must sign in again.`);
}
main().catch((error) => { console.error(error); process.exit(1); });
