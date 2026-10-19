import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";

export const POST = withSecurity(
  { rateLimit: { bucket: "circle-invitation", max: 10, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = await req.json().catch(() => null);
    if (
      !body ||
      !["preview", "accept"].includes(body.action) ||
      typeof body.secret !== "string" ||
      !/^(\d{6}|[a-f0-9]{48})$/.test(body.secret)
    ) {
      return NextResponse.json(
        { error: "Enter a valid six-digit code or invitation link." },
        { status: 400 },
      );
    }
    const client = getSupabaseAdminClient() as any;
    const { data, error } = await client.rpc(
      body.action === "accept"
        ? "accept_circle_invitation"
        : "preview_circle_invitation",
      { p_secret: body.secret, p_user: ctx.uid },
    );
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(
      body.action === "accept" ? { circleId: data } : { preview: data },
    );
  },
);
