import fs from "node:fs";
import path from "node:path";

export type QaAccount = "A" | "B" | "C";

function localValues(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.qa.local");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2]]] : [];
  }));
}

const values = { ...localValues(), ...process.env };

export const qa = {
  runId: values.DARE_QA_RUN_ID ?? "unconfigured",
  // Write tests never run merely because credentials exist.
  writeEnabled: values.DARE_QA_ALLOW_WRITES === "true",
  postWriteEnabled: values.DARE_QA_ALLOW_POST_WRITE_ONCE === "true",
  realtimeWriteEnabled: values.DARE_QA_ALLOW_REALTIME_WRITE_ONCE === "true",
  messageWriteEnabled: values.DARE_QA_ALLOW_MESSAGE_WRITE_ONCE === "true",
  messagePerfEnabled: values.DARE_QA_ALLOW_MESSAGE_PERF_ONCE === "true",
  gameWriteEnabled: values.DARE_QA_ALLOW_GAME_WRITE_ONCE === "true",
  chatInviteWriteEnabled: values.DARE_QA_ALLOW_CHAT_INVITE_WRITE_ONCE === "true",
  dareAcceptEnabled: values.DARE_QA_ALLOW_DARE_ACCEPT_ONCE === "true",
  dareProofWriteEnabled: values.DARE_QA_ALLOW_DARE_PROOF_WRITE_ONCE === "true",
  dareChickenOutEnabled: values.DARE_QA_ALLOW_DARE_CHICKEN_OUT_ONCE === "true",
  commentWriteEnabled: values.DARE_QA_ALLOW_COMMENT_WRITE_ONCE === "true",
  communityJoinWriteEnabled: values.DARE_QA_ALLOW_COMMUNITY_JOIN_ONCE === "true",
  communityProofWriteEnabled: values.DARE_QA_ALLOW_COMMUNITY_PROOF_WRITE_ONCE === "true",
  communityChatWriteEnabled: values.DARE_QA_ALLOW_COMMUNITY_CHAT_WRITE_ONCE === "true",
  communityCommentWriteEnabled: values.DARE_QA_ALLOW_COMMUNITY_COMMENT_WRITE_ONCE === "true",
  circleWriteEnabled: values.DARE_QA_ALLOW_CIRCLE_WRITE_ONCE === "true",
  truthWriteEnabled: values.DARE_QA_ALLOW_TRUTH_WRITE_ONCE === "true",
  verdictWriteEnabled: values.DARE_QA_ALLOW_VERDICT_WRITE_ONCE === "true",
  storyWriteEnabled: values.DARE_QA_ALLOW_STORY_WRITE_ONCE === "true",
  storyInteractionWriteEnabled: values.DARE_QA_ALLOW_STORY_INTERACTION_WRITE_ONCE === "true",
  dramaWriteEnabled: values.DARE_QA_ALLOW_DRAMA_WRITE_ONCE === "true",
  profileEditWriteEnabled: values.DARE_QA_ALLOW_PROFILE_EDIT_WRITE_ONCE === "true",
  account(account: QaAccount) {
    const prefix = `DARE_QA_${account}_`;
    const email = values[`${prefix}EMAIL`];
    const password = values[`${prefix}PASSWORD`];
    const username = values[`${prefix}USERNAME`];
    if (!email || !password || !username) throw new Error(`Missing local QA configuration for account ${account}.`);
    return { email, password, username };
  },
};
