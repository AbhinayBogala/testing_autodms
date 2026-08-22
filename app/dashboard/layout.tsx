import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConnectInstagramButton from "./ConnectInstagramButton";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: "⌂" },
  { name: "Content", href: "/dashboard/content", icon: "▣" },
  { name: "Automations", href: "/dashboard/automations", icon: "⚡" },
  { name: "Inbox", href: "/dashboard/inbox", icon: "✉" },
  { name: "Comments", href: "/dashboard/comments", icon: "◌" },
  { name: "Analytics", href: "/dashboard/analytics", icon: "◒" },
  { name: "Settings", href: "/dashboard/settings", icon: "⚙" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: instagramAccount, error } = await supabase
    .from("instagram_accounts")
    .select("username, profile_picture_url, is_connected, token_expires_at, webhook_subscribed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("DASHBOARD LAYOUT ACCOUNT ERROR:", error);
  }

  const connected = Boolean(instagramAccount?.is_connected);

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <div className="flex min-h-screen">
        <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-white/10 bg-[#0d0d0d]">
          <div className="flex h-20 items-center border-b border-white/10 px-6">
            <div>
              <div className="text-xl font-bold tracking-tight">AUTO DM</div>
              <div className="mt-0.5 text-xs text-gray-500">Instagram Automation</div>
            </div>
          </div>

          <div className="mx-4 mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
            {instagramAccount ? (
              <div className="flex items-center gap-3">
                {instagramAccount.profile_picture_url ? (
                  <img
                    src={instagramAccount.profile_picture_url}
                    alt={instagramAccount.username ?? "Instagram"}
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">◎</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    @{instagramAccount.username ?? "Instagram"}
                  </p>
                  <p className={connected ? "text-xs text-green-400" : "text-xs text-red-400"}>
                    ● {connected ? "Connected" : "Reconnect required"}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-400">No Instagram account</p>
                <div className="mt-3">
                  <ConnectInstagramButton label="Connect" />
                </div>
              </div>
            )}

            {instagramAccount && !connected && (
              <div className="mt-3">
                <ConnectInstagramButton label="Reconnect Instagram" />
              </div>
            )}
          </div>

          <nav className="mt-6 flex-1 overflow-y-auto px-3">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
              Workspace
            </p>

            <div className="space-y-1">
              {navigation.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 transition hover:bg-white/5 hover:text-white"
                >
                  <span className="w-5 text-center text-base">{item.icon}</span>
                  {item.name}
                </a>
              ))}
            </div>
          </nav>

          <div className="border-t border-white/10 p-4">
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          </div>
        </aside>

        <main className="ml-64 min-h-screen flex-1">{children}</main>
      </div>
    </div>
  );
}
