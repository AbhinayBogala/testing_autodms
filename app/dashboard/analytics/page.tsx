import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: account } = await supabase.from("instagram_accounts").select("id").eq("user_id", user.id).maybeSingle();
  const admin = createAdminClient();
  const { data: automations } = account ? await admin.from("automations").select("id, name, is_active, total_comments, total_dms").eq("instagram_account_id", account.id).order("updated_at", { ascending: false }) : { data: [] };
  const totalComments = (automations ?? []).reduce((s, a) => s + Number(a.total_comments ?? 0), 0);
  const totalDms = (automations ?? []).reduce((s, a) => s + Number(a.total_dms ?? 0), 0);
  return <div className="px-8 py-8"><p className="text-sm text-gray-500">Performance</p><h1 className="mt-1 text-3xl font-bold">Analytics</h1><div className="mt-8 grid gap-4 md:grid-cols-3"><Metric label="Automation comments" value={totalComments}/><Metric label="Automation DMs" value={totalDms}/><Metric label="Active automations" value={(automations ?? []).filter((a) => a.is_active).length}/></div><div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="font-semibold">Automation performance</h2><div className="mt-4 space-y-2">{(automations ?? []).map((a) => <div key={a.id} className="flex items-center justify-between rounded-lg border border-white/5 p-4"><span>{a.name}</span><span className="text-sm text-gray-500">{a.total_comments ?? 0} comments · {a.total_dms ?? 0} DMs</span></div>)}</div></div></div>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5"><p className="text-sm text-gray-500">{label}</p><p className="mt-3 text-3xl font-bold">{value.toLocaleString("en-IN")}</p></div>; }
