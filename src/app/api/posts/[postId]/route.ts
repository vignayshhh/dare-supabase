import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { redisCache } from "@/services/redisCache.server";
import { removeFeedFanout } from "../../_lib/feedFanout";
const idOf=(req:Request)=>new URL(req.url).pathname.split("/").filter(Boolean).at(-1)||"";
export const DELETE=withSecurity({rateLimit:LIMITS.POST_DELETE},async(req,ctx)=>{const id=idOf(req),db=getSupabaseAdminClient() as any;if(!id)return NextResponse.json({error:"bad post id"},{status:400});const {data:post,error}=await db.from("posts").select("id,author_id").eq("id",id).maybeSingle();if(error)throw error;if(!post)return NextResponse.json({error:"not_found"},{status:404});if(post.author_id!==ctx.uid)return NextResponse.json({error:"forbidden"},{status:403});await db.from("posts").delete().eq("id",id);await removeFeedFanout({kind:"post",sourceId:id,actorId:ctx.uid});await Promise.all([redisCache.invalidatePattern(`engagement:${id}:*`),redisCache.delete(`likes:${ctx.uid}`)]);return NextResponse.json({ok:true,deleted:{likes:0,comments:0}});});
