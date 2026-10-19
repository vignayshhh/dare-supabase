import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanText } from "../../_lib/socialMutations";
export const POST=withSecurity({rateLimit:LIMITS.BIRTHDAY_ROOM},async(req,ctx)=>{const b=await req.json().catch(()=>({})),id=cleanText(b.id,160),birthday=cleanText(b.birthdayUserId,128),local=cleanText(b.localDate,20),starts=Number(b.startsAtMs||0),ends=Number(b.endsAtMs||0);if(!id||!local||birthday!==ctx.uid||!Number.isFinite(starts)||!Number.isFinite(ends))return NextResponse.json({error:"bad room"},{status:400});const db=getSupabaseAdminClient() as any,status=["active","archived"].includes(String(b.status))?String(b.status):"preview",metadata={birthdayUsername:cleanText(b.birthdayUsername,40),birthdayDisplayName:cleanText(b.birthdayDisplayName,80),birthdayAvatarUrl:cleanText(b.birthdayAvatarUrl,2000),endsAtMs:ends};const {error}=await db.from("birthday_rooms").upsert({id,birthday_user_id:birthday,title:metadata.birthdayDisplayName||"Birthday room",expires_at:new Date(ends||Date.now()+86400000).toISOString(),local_date:local,starts_at:new Date(starts).toISOString(),status,is_preview:b.isPreview===true,metadata});if(error)throw error;return NextResponse.json({ok:true,roomId:id});});
