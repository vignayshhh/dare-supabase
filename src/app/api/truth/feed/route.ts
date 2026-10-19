import "server-only";
import { NextResponse } from "next/server";
import type { TruthPost } from "@/middleware/adapters/data-adapters";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { redisCache } from "@/services/redisCache.server";
import { getFeedCacheKey } from "../../_lib/socialCache";
import { getChallengeFeed } from "../../_lib/challengeFeed";
export const GET=withSecurity({rateLimit:LIMITS.TRUTH_FEED_FETCH,skipCsrf:true},async(req,ctx)=>{const u=new URL(req.url),n=Math.max(1,Math.min(20,Number(u.searchParams.get("limit"))||20)),key=await getFeedCacheKey("truth-feed",ctx.uid,n);if(u.searchParams.get("refresh")!=="1"){const cached=await redisCache.get<TruthPost[]>(key);if(Array.isArray(cached)&&cached.length)return NextResponse.json({ok:true,cached:true,truths:cached});}const items=await getChallengeFeed(ctx.uid,"truth",n) as TruthPost[];await redisCache.set(key,items,items.length?120:30);return NextResponse.json({ok:true,cached:false,truths:items});});

