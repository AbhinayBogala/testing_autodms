import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function CommentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: account } = await supabase.from("instagram_accounts").select("id").eq("user_id", user.id).maybeSingle();
  const admin = createAdminClient();
  const { data: comments } = account ? await admin.from("instagram_comments").select("id, instagram_comment_id, commenter_username, comment_text, parent_comment_id, public_reply_sent, dm_sent, created_at").eq("instagram_account_id", account.id).order("created_at", { ascending: false }).limit(200) : { data: [] };
  return <div className="px-8 py-8"><p className="text-sm text-gray-500">Instagram moderation</p><h1 className="mt-1 text-3xl font-bold">Comments</h1><p className="mt-2 text-gray-400">All synced comments, including parent/child replies.</p><div className="mt-8 space-y-2">{(comments ?? []).map((c) => <div key={c.id} className={`rounded-xl border border-white/10 bg-white/5 p-4 ${c.parent_comment_id ? "ml-8" : ""}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">@{c.commenter_username ?? "Instagram user"}</span><span className="text-xs text-gray-600">{c.created_at ? new Date(c.created_at).toLocaleString("en-IN") : ""}</span></div><p className="mt-2 text-sm text-gray-300">{c.comment_text || ""}</p><div className="mt-2 text-xs text-gray-600">{c.parent_comment_id ? "↳ Reply" : "Top-level comment"} · {c.public_reply_sent ? "public reply sent" : "no public reply"} · {c.dm_sent ? "DM sent" : "no DM"}</div></div>)}</div></div>;
}
