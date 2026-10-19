import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../../../_lib/rateLimit";
import { cleanText } from "../../../_lib/socialMutations";
import { VOTE_VALUES } from "../../../_lib/drama";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
const idOf=(req:Request)=>new URL(req.url).pathname.split("/").slice(-2)[0]||"";
export const POST=withSecurity({rateLimit:LIMITS.LIKE},async(req,ctx)=>{const id=idOf(req),b=(await req.json().catch(()=>({}))) as {vote?:unknown;remove?:unknown},remove=b.remove===true,vote=cleanText(b.vote,20),db=(getSupabaseAdminClient() as any);const {data:post,error}=await db.from("drama_posts").select("id,kind,resolution").eq("id",id).maybeSingle();if(error)throw error;if(!post)return NextResponse.json({error:"not_found"},{status:404});if(post.resolution)return NextResponse.json({error:"already_resolved"},{status:400});if(!remove&&!(VOTE_VALUES[post.kind as keyof typeof VOTE_VALUES]||[]).includes(vote as never))return NextResponse.json({error:"bad_vote"},{status:400});
  // withSecurity has verified this bearer token. The RPC derives its voter
  // from auth.uid(), so it must run with the caller rather than service role.
  const {url,key}=getSupabasePublicConfig();
  const caller=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:req.headers.get("authorization")!}}});
  const {error:rpcError}=await caller.rpc("set_drama_vote",{p_post_id:id,p_vote:remove?null:vote,p_remove:remove});if(rpcError)throw rpcError;return NextResponse.json({ok:true,...(remove?{removed:true}:{})});});
