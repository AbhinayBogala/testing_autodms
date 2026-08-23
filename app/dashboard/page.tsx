import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import ConnectInstagramButton from "./ConnectInstagramButton";
import SyncInstagramButton from "./SyncInstagramButton";
import DisconnectInstagramButton from "./DisconnectInstagramButton";
import PostsGrid from "./PostsGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type InstagramPost = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  published_at: string | null;
  likes_count: number | null;
  comments_count: number | null;
};

type InstagramAccount = {
  id: string;
  username: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  following_count: number | null;
  media_count: number | null;
  is_connected: boolean;
  token_expires_at: string | null;
  connected_at: string | null;
  updated_at: string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ============================================================
  // GET ALL INSTAGRAM ACCOUNTS FOR CURRENT USER
  //
  // IMPORTANT:
  // We intentionally DO NOT filter by is_connected here.
  //
  // This allows the dashboard to keep multiple Instagram
  // accounts in Supabase.
  // ============================================================

  const {
    data: accountData,
    error: accountError,
  } = await supabase
    .from("instagram_accounts")
    .select(
      `
      id,
      username,
      profile_picture_url,
      followers_count,
      following_count,
      media_count,
      is_connected,
      token_expires_at,
      connected_at,
      updated_at
      `
    )
    .eq(
      "user_id",
      user.id
    )
    .order(
      "updated_at",
      {
        ascending: false,
        nullsFirst: false,
      }
    );

  // ============================================================
  // IMPROVED SUPABASE ERROR LOGGING
  // ============================================================

  if (accountError) {
    console.error(
      "INSTAGRAM DASHBOARD ACCOUNT ERROR:",
      {
        message: accountError.message,
        details: accountError.details,
        hint: accountError.hint,
        code: accountError.code,
      }
    );
  }

  const accounts: InstagramAccount[] =
    (accountData ?? []) as InstagramAccount[];

  // ============================================================
  // GET CURRENTLY CONNECTED INSTAGRAM ACCOUNT
  //
  // The account with is_connected = true is the account that
  // the dashboard currently operates on.
  // ============================================================

  const account =
    accounts.find(
      (item) =>
        item.is_connected === true
    ) ?? null;

  // ============================================================
  // ADMIN CLIENT
  // ============================================================

  const admin = createAdminClient();

  // ============================================================
  // GET AUTOMATIONS
  // ============================================================

  const {
    data: automationData,
  } = await admin
    .from("instagram_automations")
    .select(
      "id,is_active"
    )
    .eq(
      "user_id",
      user.id
    );

  const activeAutomations =
    (automationData ?? [])
      .filter(
        (item) =>
          item.is_active === true
      )
      .length;

  // ============================================================
  // POSTS
  //
  // Posts are loaded only for the currently connected account.
  // ============================================================

  let posts: InstagramPost[] = [];

  let postsCount = 0;

  if (account?.is_connected) {
    const {
      data: postData,
    } = await admin
      .from("instagram_posts")
      .select(
        `
        id,
        instagram_media_id,
        caption,
        media_type,
        media_url,
        permalink,
        published_at,
        likes_count,
        comments_count
        `
      )
      .eq(
        "instagram_account_id",
        account.id
      )
      .order(
        "published_at",
        {
          ascending: false,
        }
      )
      .limit(12);

    posts =
      (postData ?? []) as InstagramPost[];

    const {
      count,
    } = await admin
      .from("instagram_posts")
      .select(
        "*",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "instagram_account_id",
        account.id
      );

    postsCount = count ?? 0;
  }

  // ============================================================
  // DASHBOARD
  // ============================================================

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex flex-col gap-6 border-b border-white/[0.06] pb-8 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff1744]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              DevilX / Overview
            </p>
          </div>

          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] text-white">
            Dashboard
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Manage Instagram content, DMs and automations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {account?.is_connected && (
            <>
              <SyncInstagramButton />
              <DisconnectInstagramButton />
            </>
          )}

          <ConnectInstagramButton
            label={
              account?.is_connected
                ? "Add Instagram Account"
                : "Connect Instagram"
            }
          />
        </div>
      </div>

      {/* ======================================================
          NO CURRENTLY CONNECTED ACCOUNT
      ====================================================== */}

      {!account?.is_connected ? (
        <div className="mx-auto mt-20 max-w-xl rounded-[28px] border border-white/[0.08] bg-[#0b0b0b] p-12 text-center shadow-2xl shadow-black/30">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#ff1744]/15 bg-[#ff1744]/[0.06] text-2xl text-[#ff1744]">
            ◎
          </div>

          <h2 className="mt-7 text-3xl font-bold tracking-tight">
            Connect your Instagram
          </h2>

          <p className="mt-4 text-sm leading-6 text-gray-500">
            Connect your professional account to start managing comments,
            DMs and automations.
          </p>

          <div className="mt-8">
            <ConnectInstagramButton label="Connect Instagram" />
          </div>
        </div>
      ) : (
        <>
          {/* ==================================================
              ALL INSTAGRAM ACCOUNTS
          ================================================== */}

          {accounts.length > 1 && (
            <section className="mt-9">
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-[#ff1744]" />
                  <h2 className="text-lg font-semibold">
                    Instagram Accounts
                  </h2>
                </div>

                <p className="mt-1 text-xs text-gray-600">
                  Instagram accounts connected to your workspace.
                </p>
              </div>

              <div className="space-y-3">
                {accounts.map((instagramAccount) => (
                  <div
                    key={instagramAccount.id}
                    className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-[#0b0b0b] p-4 transition-colors duration-200 hover:border-white/[0.12] hover:bg-[#0d0d0d]"
                  >
                    <div className="flex items-center gap-4">
                      {instagramAccount.profile_picture_url ? (
                        <img
                          src={instagramAccount.profile_picture_url}
                          alt={
                            instagramAccount.username
                              ? `@${instagramAccount.username}`
                              : "Instagram account"
                          }
                          className="h-11 w-11 rounded-full object-cover ring-2 ring-white/[0.06]"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.04] text-gray-500">
                          ◎
                        </div>
                      )}

                      <div>
                        <p className="font-medium text-white">
                          {instagramAccount.username
                            ? `@${instagramAccount.username}`
                            : "Instagram Account"}
                        </p>

                        <p className="mt-1 text-xs text-gray-600">
                          {instagramAccount.is_connected
                            ? "Currently connected"
                            : "Saved account"}
                        </p>
                      </div>
                    </div>

                    {instagramAccount.is_connected ? (
                      <span className="flex items-center gap-2 rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-1.5 text-[11px] font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-gray-600">
                        Inactive
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ==================================================
              STATS
          ================================================== */}

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Followers"
              value={formatNumber(account.followers_count)}
            />

            <StatCard
              label="Posts"
              value={String(postsCount)}
            />

            <StatCard
              label="Following"
              value={formatNumber(account.following_count)}
            />

            <StatCard
              label="Active Automations"
              value={String(activeAutomations)}
            />
          </div>

          {/* ==================================================
              TOKEN
          ================================================== */}

          <div className="mt-6 rounded-[24px] border border-white/[0.07] bg-[#0b0b0b] p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff1744]/[0.07] text-xs text-[#ff1744]">
                    ◉
                  </span>

                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-gray-600">
                    Instagram Token
                  </p>
                </div>

                <p className="mt-4 text-2xl font-bold tracking-tight">
                  {account.token_expires_at
                    ? new Date(
                        account.token_expires_at
                      ).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "Managed automatically"}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400">
                  Long-lived token active
                </span>
              </div>
            </div>
          </div>

          {/* ==================================================
              POSTS
          ================================================== */}

          <section className="mt-10">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-[#ff1744]" />
                  <h2 className="text-xl font-semibold tracking-tight">
                    Recent Posts
                  </h2>
                </div>

                <p className="mt-1 text-xs text-gray-600">
                  Click a post to view media and description.
                </p>
              </div>

              <span className="hidden text-xs text-gray-600 sm:block">
                {postsCount} total
              </span>
            </div>

            {posts.length === 0 ? (
              <div className="rounded-[24px] border border-white/[0.07] bg-[#0b0b0b] p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-gray-500">
                  ▣
                </div>

                <p className="mt-5 text-sm font-medium text-gray-300">
                  No posts synced yet.
                </p>

                <p className="mt-1 text-xs text-gray-600">
                  Click Sync Instagram to load your latest posts.
                </p>
              </div>
            ) : (
              <PostsGrid posts={posts} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ============================================================
   STAT CARD
============================================================ */

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="group rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-6 transition-colors duration-200 hover:border-[#ff1744]/20">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
          {label}
        </p>

        <span className="h-1.5 w-1.5 rounded-full bg-[#ff1744]" />
      </div>

      <p className="mt-5 text-3xl font-bold tracking-[-0.03em] text-white">
        {value}
      </p>

      <div className="mt-5 h-px w-full bg-white/[0.05]" />

      <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-gray-700">
        DevilX Analytics
      </p>
    </div>
  );
}

/* ============================================================
   FORMAT NUMBER
============================================================ */

function formatNumber(
  value: number | null
) {

  return new Intl.NumberFormat(
    "en-IN"
  ).format(
    value ?? 0
  );

}