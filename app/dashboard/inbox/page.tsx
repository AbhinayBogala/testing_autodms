import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function InboxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: account } = await supabase.from("instagram_accounts").select("id").eq("user_id", user.id).maybeSingle();
  const admin = createAdminClient();
  const { data: conversations } = account ? await admin.from("instagram_conversations").select("id, instagram_scoped_user_id, username, last_message_text, last_message_at, unread_count").eq("instagram_account_id", account.id).order("last_message_at", { ascending: false }).limit(100) : { data: [] };
  return <div className="px-8 py-8"><p className="text-sm text-gray-500">Customer conversations</p><h1 className="mt-1 text-3xl font-bold">Inbox</h1><p className="mt-2 text-gray-400">Incoming Instagram messages received through your webhook.</p><div className="mt-8 space-y-2">{(conversations ?? []).length === 0 ? <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-gray-500">No Instagram conversations have been received yet.</div> : (conversations ?? []).map((c) => <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="flex justify-between"><span className="font-semibold">@{c.username ?? "Instagram user"}</span><span className="text-xs text-gray-600">{c.last_message_at ? new Date(c.last_message_at).toLocaleString("en-IN") : ""}</span></div><p className="mt-2 text-sm text-gray-400">{c.last_message_text ?? "Attachment or unsupported message"}</p></div>)}</div></div>;
}
