import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanText } from "../../_lib/socialMutations";
import { invalidateSocialCachesForUsers } from "../../_lib/socialCache";
export const DELETE=withSecurity({rateLimit:LIMITS.PROFILE_EDIT},async(req,ctx)=>{const other=cleanText(new URL(req.url).searchParams.get("userId"),128);if(!other||other===ctx.uid)return NextResponse.json({error:"bad user"},{status:400});const {error}=await (getSupabaseAdminClient() as any).from("friendships").delete().or(`and(requester_id.eq.${ctx.uid},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${ctx.uid})`);if(error)throw error;await invalidateSocialCachesForUsers([ctx.uid,other]);return NextResponse.json({ok:true});});
