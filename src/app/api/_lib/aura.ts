import { circleRequestContext } from "@/lib/supabase/requestContext";
import "server-only";
import { createHash } from "node:crypto";
type Transaction = unknown;
import { getSupabaseAdminClient, getPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { INITIAL_AURA, normalizeAuraBalance } from "@/lib/auraPolicy";
export { INITIAL_AURA };
export type AuraEventKind="dare_real"|"dare_fake"|"dare_exceptional"|"prediction_correct"|"rumour_confirmed"|"deal_completed"|"promise_fulfilled"|"court_won"|"jail_sentence"|"game_major_win"|"post_like_milestone"|"dare_streak_milestone"|"moderation_deduction";
export type AuraMutationInput={userId:string;kind:AuraEventKind;amount:number;sourceType:string;sourceId:string;qualifier?:string;title:string;message:string;metadata?:Record<string,unknown>};
export type AuraMutationResult={eventId:string;userId:string;awarded:boolean;amount:number;currentAura:number;lifetimeAura:number};
export function auraEventId(input:AuraMutationInput){return createHash("sha256").update([input.userId,input.kind,input.sourceType,input.sourceId,input.qualifier||""].join("|")).digest("hex");}
export async function applyAuraEventsInTransaction(_tx:Transaction,inputs:AuraMutationInput[]):Promise<AuraMutationResult[]>{const circleId=circleRequestContext.getStore()?.circleId;if(!circleId)throw new Error("Circle required for Aura");const db=getPrivilegedSupabaseClient() as any;const out:AuraMutationResult[]=[];for(const input of Array.from(new Map(inputs.map(x=>[auraEventId(x),x])).values())){const sourceId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.sourceId)?input.sourceId:null;const {data,error}=await db.rpc("apply_circle_aura_event",{p_circle:circleId,p_event_id:auraEventId(input),p_user_id:input.userId,p_kind:input.kind,p_amount:input.amount,p_source_type:input.sourceType,p_source_id:sourceId,p_qualifier:input.qualifier||null,p_title:input.title,p_message:input.message,p_metadata:input.metadata||{}});if(error)throw error;out.push({eventId:String(data.eventId),userId:String(data.userId),awarded:Boolean(data.awarded),amount:Number(data.amount)||0,currentAura:normalizeAuraBalance(data.currentAura),lifetimeAura:normalizeAuraBalance(data.lifetimeAura)});}return out;}
export async function ensureAuraProfile(userId:string){const {data,error}=await (getSupabaseAdminClient() as any).from("circle_aura").select("current_aura,lifetime_aura").eq("circle_id",circleRequestContext.getStore()?.circleId).eq("user_id",userId).maybeSingle();if(error)throw error;return {currentAura:normalizeAuraBalance(data?.current_aura),lifetimeAura:normalizeAuraBalance(data?.lifetime_aura)};}
export async function readAuraProfile(userId:string){return ensureAuraProfile(userId);}
