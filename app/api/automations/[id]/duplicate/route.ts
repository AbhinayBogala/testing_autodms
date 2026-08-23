import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase.from("instagram_accounts").select("id").eq("user_id", user.id).maybeSingle();
  if (!account) return NextResponse.json({ error: "Instagram account not found" }, { status: 404 });

  const { data: source } = await supabase.from("automations").select("*").eq("id", id).eq("instagram_account_id", account.id).maybeSingle();
  if (!source) return NextResponse.json({ error: "Automation not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: copy, error } = await admin.from("automations").insert({
    instagram_account_id: account.id,
    name: `${source.name} Copy`,
    trigger_type: source.trigger_type,
    dm_enabled: source.dm_enabled,
    dm_text: source.dm_text,
    public_reply_enabled: source.public_reply_enabled,
    public_reply_text: source.public_reply_text,
    is_active: false,
    total_comments: 0,
    total_dms: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select("*").single();

  if (error || !copy) return NextResponse.json({ error: error?.message || "Duplicate failed" }, { status: 500 });

  const { data: posts } = await admin.from("automation_posts").select("instagram_post_id").eq("automation_id", id);
  if (posts?.length) await admin.from("automation_posts").insert(posts.map((p) => ({ automation_id: copy.id, instagram_post_id: p.instagram_post_id })));
  const { data: keywords } = await admin.from("automation_keywords").select("keyword").eq("automation_id", id);
  if (keywords?.length) await admin.from("automation_keywords").insert(keywords.map((k) => ({ automation_id: copy.id, keyword: k.keyword })));

  return NextResponse.json({ data: copy });
}
