import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import ConnectInstagramButton from "../ConnectInstagramButton";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: accounts, error: accountError } = await supabase
    .from("instagram_accounts")
    .select(
      "id, username, is_connected, token_expires_at, webhook_subscribed"
    )
    .eq("user_id", user.id)
    .order("updated_at", {
      ascending: false,
    });

  if (accountError) {
    console.error("SETTINGS INSTAGRAM ACCOUNT ERROR:", accountError);
  }

  const account =
    accounts?.find((item) => item.is_connected === true) ?? null;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto w-full max-w-5xl px-8 py-10">
        <header className="border-b border-white/[0.06] pb-8">
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">
            Settings
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Manage your Instagram connection and account.
          </p>
        </header>

        <section className="mt-10">
          <SectionHeader
            title="Instagram"
            description="Manage the Instagram account connected to DevilX."
          />

          <div className="mt-5 overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#0b0b0b]">
            <div className="flex items-center justify-between gap-6 p-7">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#ff1744]/15 bg-[#ff1744]/[0.06] text-xl text-[#ff1744]">
                  ◎
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                    Connected Instagram
                  </p>

                  <p className="mt-1 truncate text-lg font-semibold text-white">
                    {account?.username
                      ? `@${account.username}`
                      : "No Instagram account"}
                  </p>
                </div>
              </div>

              <Status connected={Boolean(account?.is_connected)} />
            </div>

            <div className="border-t border-white/[0.06]">
              <Row
                label="Connection status"
                value={
                  account?.is_connected
                    ? "Connected"
                    : "Not connected"
                }
                valueClass={
                  account?.is_connected
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              />

              <Row
                label="Token expiry"
                value={
                  account?.token_expires_at
                    ? new Date(
                        account.token_expires_at
                      ).toLocaleString("en-IN")
                    : "Not available"
                }
              />

              <Row
                label="Webhooks"
                value={
                  account?.webhook_subscribed
                    ? "Comments + messages enabled"
                    : "Not confirmed"
                }
                valueClass={
                  account?.webhook_subscribed
                    ? "text-emerald-400"
                    : "text-gray-500"
                }
              />
            </div>

            <div className="border-t border-white/[0.06] bg-white/[0.015] p-6">
              <ConnectInstagramButton
                label={
                  account?.is_connected
                    ? "Reconnect Instagram"
                    : "Connect Instagram"
                }
              />
            </div>
          </div>
        </section>

        {accounts && accounts.length > 1 && (
          <section className="mt-10">
            <SectionHeader
              title="Connected Accounts"
              description="All Instagram accounts saved in your workspace."
            />

            <div className="mt-5 overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#0b0b0b]">
              {accounts.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-4 px-6 py-5 ${
                    index !== accounts.length - 1
                      ? "border-b border-white/[0.05]"
                      : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-gray-500">
                      ◎
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.username
                          ? `@${item.username}`
                          : "Instagram account"}
                      </p>

                      <p className="mt-1 text-xs text-gray-600">
                        {item.is_connected
                          ? "Currently connected"
                          : "Saved account"}
                      </p>
                    </div>
                  </div>

                  {item.is_connected && (
                    <span className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-medium text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Connected
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <SectionHeader
            title="Account"
            description="Your DevilX account information."
          />

          <div className="mt-5 rounded-[24px] border border-white/[0.07] bg-[#0b0b0b] p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-sm font-bold text-gray-400">
                {user.email?.charAt(0).toUpperCase() ?? "U"}
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                  Email Address
                </p>

                <p className="mt-1 truncate text-sm text-gray-300">
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <SectionHeader
            title="Security"
            description="Keep your DevilX credentials secure."
          />

          <div className="mt-5 rounded-[24px] border border-red-500/10 bg-[#0b0b0b] p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff1744]/[0.06] text-[#ff1744]">
                !
              </div>

              <div>
                <p className="text-sm font-medium text-white">
                  Keep your credentials private
                </p>

                <p className="mt-2 text-xs leading-6 text-gray-600">
                  Instagram app secrets and Supabase service keys
                  must stay server-side. Never expose them in
                  client-side code or commit them to Git.
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-12 flex items-center justify-between border-t border-white/[0.06] pt-6">
          <div className="flex items-center">
            <span className="text-lg font-black tracking-[-0.07em] text-white">
              Devil
            </span>
            <span className="text-lg font-black tracking-[-0.07em] text-[#ff1744]">
              X
            </span>
          </div>

          <span className="text-[9px] uppercase tracking-[0.16em] text-gray-700">
            Instagram Automation
          </span>
        </footer>
      </div>
    </main>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff1744]" />

        <h2 className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
      </div>

      <p className="mt-1.5 text-xs text-gray-600">
        {description}
      </p>
    </div>
  );
}

function Status({
  connected,
}: {
  connected: boolean;
}) {
  return (
    <span
      className={
        connected
          ? "flex shrink-0 items-center gap-2 rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-medium text-emerald-400"
          : "flex shrink-0 items-center gap-2 rounded-full border border-red-500/10 bg-red-500/[0.05] px-3 py-1.5 text-[10px] font-medium text-red-400"
      }
    >
      <span
        className={
          connected
            ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
            : "h-1.5 w-1.5 rounded-full bg-red-400"
        }
      />

      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

function Row({
  label,
  value,
  valueClass = "text-gray-300",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex min-h-[58px] items-center justify-between gap-8 px-7 py-4">
      <span className="text-xs text-gray-600">{label}</span>

      <span className={`text-right text-sm ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}