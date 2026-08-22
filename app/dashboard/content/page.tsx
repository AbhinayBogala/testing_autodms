import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import SyncInstagramButton from "../SyncInstagramButton";

export default async function ContentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: account } = await supabase.from("instagram_accounts").select("id, username, is_connected").eq("user_id", user.id).maybeSingle();
  const admin = createAdminClient();
  const { data: posts } = account ? await admin.from("instagram_posts").select("id, media_url, media_type, caption, published_at, likes_count, comments_count, permalink").eq("instagram_account_id", account.id).order("published_at", { ascending: false }).limit(100) : { data: [] };
  return <div className="px-8 py-8"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Instagram content</p><h1 className="mt-1 text-3xl font-bold">Content</h1></div>{account?.is_connected && <SyncInstagramButton />}</div><div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">{(posts ?? []).map((post) => <a key={post.id} href={post.permalink ?? "#"} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-white/10 bg-white/5 hover:border-white/20">{post.media_url ? <img src={post.media_url} alt={post.caption ?? "Instagram post"} className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-black" />}<div className="p-3"><p className="line-clamp-2 text-xs text-gray-400">{post.caption || "No caption"}</p><p className="mt-2 text-[11px] text-gray-600">♥ {post.likes_count ?? 0} · 💬 {post.comments_count ?? 0}</p></div></a>)}</div></div>;
}
