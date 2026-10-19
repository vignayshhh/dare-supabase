process.on("uncaughtException", (e) => {
  console.error(e.message);
  process.exit(1);
});
import { PGlite } from "../../.tmp/circle-db/node_modules/@electric-sql/pglite/dist/index.js";
import { pgcrypto } from "../../.tmp/circle-db/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js";
import fs from "node:fs";
import { pg_trgm } from "../../.tmp/circle-db/node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js";
const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
alter default privileges in schema public grant all on tables to authenticated,service_role;
alter default privileges in schema public grant all on sequences to authenticated,service_role;
create publication supabase_realtime;
create schema auth; create schema extensions; create schema storage; create schema realtime;
create extension pgcrypto with schema extensions;
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin return; end $$;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb,created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',auth.uid(),'role',auth.role()) $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
create table realtime.messages(id bigint,topic text,extension text);
create function realtime.topic() returns text language sql as $$ select ''::text $$;
create function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$ begin return; end $$;
create function realtime.broadcast_changes(text,text,text,text,text,record,record) returns void language plpgsql as $$ begin return; end $$;
grant usage on schema public,auth,extensions,storage,realtime to authenticated,anon,service_role;
`);
for (const name of fs
  .readdirSync("supabase/migrations")
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  try {
    await db.exec(fs.readFileSync("supabase/migrations/" + name, "utf8"));
  } catch (e) {
    console.error(name, e.message);
    process.exit(1);
  }
}
console.log("All migrations applied");
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const users = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
];
for (let i = 0; i < users.length; i++)
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [
      users[i],
      "person" + i + "@example.com",
      JSON.stringify({ username: "person" + i, display_name: "Person " + i }),
    ],
  );
async function actor(user, circle = null, role = "authenticated") {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false),set_config('request.headers',$3,false)",
    [user || "", role, JSON.stringify(circle ? { "x-circle-id": circle } : {})],
  );
  await db.exec("set role " + role);
}
async function one(sql, args = []) {
  return (await db.query(sql, args)).rows[0];
}
async function rejects(fn, label) {
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  assert(failed, label);
  console.log("PASS", label);
}
await actor(users[0]);
const a = (await one("select create_circle('Besties','??') id")).id;
const b = (await one("select create_circle('College','??') id")).id;
await one("select create_circle('School','?')");
await rejects(
  () => one("select create_circle('Fourth','??')"),
  "three creation slots enforced",
);
await actor(users[1]);
const c = (await one("select create_circle('Other world','??') id")).id;
const invitation = await one("select * from create_circle_invitation($1)", [c]);
await rejects(
  () =>
    one("select accept_circle_invitation($1,$2)", [invitation.code, users[0]]),
  "direct code acceptance RPC blocked",
);
await actor(null, null, "service_role");
assert(
  (
    await one("select preview_circle_invitation($1,$2) preview", [
      invitation.code,
      users[0],
    ])
  ).preview.name === "Other world",
  "preview",
);
await one("select accept_circle_invitation($1,$2)", [
  invitation.code,
  users[0],
]);
await one("select accept_circle_invitation($1,$2)", [
  invitation.code,
  users[0],
]);
await actor(users[0], a);
assert(
  (await one("select count(*)::int n from circles")).n === 4,
  "joined Circles do not consume creation slots",
);
console.log("PASS unlimited joined Circles, idempotent acceptance");
await one(
  "insert into posts(author_id,body) values($1,'Only Besties') returning id",
  [users[0]],
);
assert(
  (await one("select count(*)::int n from posts")).n === 1,
  "active feed read",
);
await actor(users[0], b);
assert(
  (await one("select count(*)::int n from posts")).n === 0,
  "switch must hide previous circle content",
);
console.log("PASS active-Circle isolation, including shared owner");
await actor(users[2], a);
assert(
  (await one("select count(*)::int n from posts")).n === 0,
  "outsider reads",
);
await rejects(
  () =>
    one("insert into posts(author_id,body) values($1,'intrusion')", [users[2]]),
  "outsider cannot write to another Circle",
);
await actor(users[0], a);
const post = (await one("select id from posts limit 1")).id;
await actor(users[2], a);
await rejects(
  () => one("select set_post_like($1,true,$2)", [post, users[2]]),
  "definer RPC cannot bypass Circle privacy",
);
await actor(users[0], c);
await one("select manage_circle($1,'leave')", [c]);
await actor(null, null, "service_role");
await rejects(
  () =>
    one("select accept_circle_invitation($1,$2)", [invitation.code, users[0]]),
  "used invitation cannot rejoin after leaving",
);
await actor(users[1], c);
await one("select revoke_circle_invitation($1)", [invitation.id]);
await actor(null, null, "service_role");
await rejects(
  () =>
    one("select preview_circle_invitation($1,$2)", [invitation.code, users[2]]),
  "revoked invitation rejected",
);
await actor(users[0], a);
const open = await one("select * from create_circle_invitation($1)", [a]);
await actor(null, null, "service_role");
await one("select accept_circle_invitation($1,$2)", [open.token, users[2]]);
await actor(users[2], a);
assert(
  (await one("select count(*)::int n from posts")).n === 1,
  "nonfriend member sees posts",
);
const feed = (await one("select get_ranked_feed_page($1) feed", [users[2]]))
  .feed;
assert(feed.items.length === 1, "nonfriend feed");
console.log("PASS non-friend member feed");
await rejects(
  () => one("select create_circle_invitation($1)", [a]),
  "owner-only invite permission",
);
await actor(users[0], a);
await one("select manage_circle($1,'invite_permission','members')", [a]);
await actor(users[2], a);
await one("select create_circle_invitation($1)", [a]);
console.log("PASS member invite permission");
const conversation = (
  await one("select get_or_create_direct_conversation($1) c", [users[0]])
).c;
assert(!!conversation.id, "member conversation");
await actor(users[0], b);
const otherInvite = await one("select * from create_circle_invitation($1)", [
  b,
]);
await actor(null, null, "service_role");
await one("select accept_circle_invitation($1,$2)", [
  otherInvite.token,
  users[2],
]);
await actor(users[2], b);
const otherConversation = (
  await one("select get_or_create_direct_conversation($1) c", [users[0]])
).c;
assert(
  conversation.id !== otherConversation.id,
  "conversations separate by circle",
);
console.log("PASS separate conversations for overlapping members");
await actor(users[0], a);
const event = (
  await one(
    "insert into circle_events(circle_id,creator_id,name) values($1,$2,'Friday') returning id",
    [a, users[0]],
  )
).id;
await db.query("select set_config('request.headers',$1,false)", [
  JSON.stringify({ "x-circle-id": a, "x-event-id": event }),
]);
const eventPost = await one(
  "insert into posts(author_id,body) values($1,'Friday memory') returning circle_id,event_id",
  [users[0]],
);
assert(
  eventPost.circle_id === a && eventPost.event_id === event,
  "inherit event",
);
await actor(users[0], b);
await rejects(
  () =>
    one(
      "insert into posts(author_id,body,event_id) values($1,'wrong event',$2)",
      [users[0], event],
    ),
  "cross-circle event rejected",
);
console.log("PASS automatic Event inheritance");
await actor(users[0], a);
const eventConversation = (
  await one("select get_circle_event_conversation($1) id", [event])
).id;
await one("select send_message($1,'Meet at seven',null,null,null)", [
  eventConversation,
]);
await actor(users[2], a);
assert(
  (await one("select get_circle_event_conversation($1) id", [event])).id ===
    eventConversation,
  "same event chat",
);
assert(
  (
    await one("select count(*)::int n from messages where conversation_id=$1", [
      eventConversation,
    ])
  ).n === 1,
  "event messages visible to member",
);
await actor(users[1], c);
await rejects(
  () => one("select get_circle_event_conversation($1)", [event]),
  "outsider cannot enter Event chat",
);
console.log("PASS shared Event conversation");
await actor(null, null, "service_role");
const aura = (
  await one(
    "select apply_circle_aura_event($1,'test-award',$2,'dare_real',25,'dare',null,null,'Nice','Done','{}') result",
    [a, users[0]],
  )
).result;
assert(aura.currentAura === 125, "circle aura award");
await actor(users[0], b);
assert(
  (await one("select count(*)::int n from circle_aura")).n === 0,
  "aura does not cross circles",
);
await actor(users[0], a);
assert(
  (await one("select current_aura from profiles where id=$1", [users[0]]))
    .current_aura === 100,
  "global identity untouched",
);
console.log("PASS circle-specific Aura");
await one("select manage_circle($1,'remove',$2)", [a, users[2]]);
await actor(users[2], a);
assert(
  (await one("select count(*)::int n from posts")).n === 0,
  "removed member content",
);
assert(
  (await one("select count(*)::int n from conversations")).n === 0,
  "removed member conversations",
);
console.log("PASS removal revokes content and conversation reads");
await actor(users[1], c);
const expired = await one("select * from create_circle_invitation($1)", [c]);
await actor(null, null, "service_role");
await db.query(
  "update circle_invitations set expires_at=now()-interval '1 second' where id=$1",
  [expired.id],
);
await rejects(
  () =>
    one("select preview_circle_invitation($1,$2)", [expired.code, users[2]]),
  "expired invitation rejected",
);
console.log("Circle database tests passed");
await db.exec("reset role");
fs.writeFileSync(
  ".tmp/circle-functions.json",
  JSON.stringify(
    (
      await db.query(
        "select proname,oid::regprocedure::text signature,pg_get_functiondef(oid) definition,prosrc,has_function_privilege('authenticated',oid,'execute') allowed from pg_proc where pronamespace='public'::regnamespace",
      )
    ).rows,
    null,
    2,
  ),
);
await db.close();
