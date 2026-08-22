import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConnectInstagramButton from "../ConnectInstagramButton";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: account } = await supabase.from("instagram_accounts").select("username, is_connected, token_expires_at, webhook_subscribed").eq("user_id", user.id).maybeSingle();
  return <div className="px-8 py-8"><p className="text-sm text-gray-500">Workspace settings</p><h1 className="mt-1 text-3xl font-bold">Settings</h1><div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="font-semibold">Instagram connection</h2><div className="mt-4 grid gap-3 text-sm"><Row label="Account" value={account?.username ? `@${account.username}` : "Not connected"}/><Row label="Status" value={account?.is_connected ? "Connected" : "Reconnect required"}/><Row label="Token expiry" value={account?.token_expires_at ? new Date(account.token_expires_at).toLocaleString("en-IN") : "Managed after connection"}/><Row label="Webhooks" value={account?.webhook_subscribed ? "Comments + messages enabled" : "Not confirmed"}/></div><div className="mt-5"><ConnectInstagramButton label={account?.is_connected ? "Reconnect Instagram" : "Connect Instagram"}/></div></div><div className="mt-6 rounded-2xl border border-red-500/10 bg-red-500/5 p-6"><h2 className="font-semibold text-red-300">Security</h2><p className="mt-2 text-sm text-gray-500">Instagram app secrets and Supabase service keys must stay server-side. Never expose them in client components or commit them to Git.</p></div></div>;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-white/5 py-3"><span className="text-gray-500">{label}</span><span className="text-gray-300">{value}</span></div>; }
