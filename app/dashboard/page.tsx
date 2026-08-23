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
    data: {
      user,
    },
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

  if (accountError) {
    console.error(
      "INSTAGRAM DASHBOARD ACCOUNT ERROR:",
      accountError
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
    <div className="px-10 py-10">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex items-start justify-between">

        <div>

          <p className="text-sm text-gray-500">
            Overview
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Dashboard
          </h1>

          <p className="mt-2 text-gray-400">
            Manage Instagram content, DMs and automations.
          </p>

        </div>

        {/* ====================================================
            HEADER ACTIONS
        ==================================================== */}

        <div className="flex items-center gap-3">

          {/* Existing account controls */}

          {account?.is_connected && (
            <>
              <SyncInstagramButton />

              <DisconnectInstagramButton />
            </>
          )}

          {/* ==================================================
              CONNECT / ADD INSTAGRAM ACCOUNT

              If there is already a connected account,
              this button becomes "Add Instagram Account".

              If there is no connected account, it remains
              "Connect Instagram".
          ================================================== */}

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

        <div
          className="
            mt-20
            mx-auto
            max-w-xl
            rounded-3xl
            border
            border-white/10
            bg-white/[0.04]
            p-12
            text-center
          "
        >

          <div className="text-5xl">
            ✨
          </div>

          <h2 className="mt-6 text-3xl font-bold">
            Connect your Instagram
          </h2>

          <p className="mt-4 text-gray-400">
            Connect your professional account to start managing comments,
            DMs and automations.
          </p>

          <div className="mt-8">

            <ConnectInstagramButton
              label="Connect Instagram"
            />

          </div>

        </div>

      ) : (

        <>

          {/* ==================================================
              CURRENT CONNECTED ACCOUNT
          ================================================== */}

          <div
            className="
              mt-8
              rounded-3xl
              border
              border-white/10
              bg-white/[0.04]
              p-6
            "
          >

            <div className="flex items-center justify-between">

              <div className="flex items-center gap-4">

                {account.profile_picture_url ? (

                  <img
                    src={
                      account.profile_picture_url
                    }
                    alt={
                      account.username
                        ? `@${account.username}`
                        : "Instagram profile"
                    }
                    className="
                      h-14
                      w-14
                      rounded-full
                      object-cover
                    "
                  />

                ) : (

                  <div
                    className="
                      flex
                      h-14
                      w-14
                      items-center
                      justify-center
                      rounded-full
                      bg-white/10
                      text-2xl
                    "
                  >
                    📸
                  </div>

                )}

                <div>

                  <p className="text-sm text-gray-500">
                    Connected Instagram Account
                  </p>

                  <h2 className="mt-1 text-xl font-semibold">
                    {account.username
                      ? `@${account.username}`
                      : "Instagram Account"}
                  </h2>

                </div>

              </div>

              <div
                className="
                  rounded-full
                  bg-green-500/10
                  px-4
                  py-2
                  text-sm
                  text-green-400
                "
              >
                ● Connected
              </div>

            </div>

          </div>

          {/* ==================================================
              ALL INSTAGRAM ACCOUNTS
              
              This appears only when more than one account
              exists in Supabase.
              
              The page does NOT delete old accounts.
          ================================================== */}

          {accounts.length > 1 && (

            <section className="mt-8">

              <h2 className="text-xl font-bold">
                Instagram Accounts
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                Instagram accounts connected to your workspace.
              </p>

              <div className="mt-4 space-y-3">

                {accounts.map(
                  (instagramAccount) => (

                    <div
                      key={
                        instagramAccount.id
                      }
                      className="
                        flex
                        items-center
                        justify-between
                        rounded-2xl
                        border
                        border-white/10
                        bg-white/[0.03]
                        p-4
                      "
                    >

                      <div className="flex items-center gap-3">

                        {instagramAccount.profile_picture_url ? (

                          <img
                            src={
                              instagramAccount.profile_picture_url
                            }
                            alt={
                              instagramAccount.username
                                ? `@${instagramAccount.username}`
                                : "Instagram account"
                            }
                            className="
                              h-10
                              w-10
                              rounded-full
                              object-cover
                            "
                          />

                        ) : (

                          <div
                            className="
                              flex
                              h-10
                              w-10
                              items-center
                              justify-center
                              rounded-full
                              bg-white/10
                            "
                          >
                            📸
                          </div>

                        )}

                        <div>

                          <p className="font-medium">
                            {instagramAccount.username
                              ? `@${instagramAccount.username}`
                              : "Instagram Account"}
                          </p>

                          <p className="text-xs text-gray-500">
                            {instagramAccount.is_connected
                              ? "Currently connected"
                              : "Saved account"}
                          </p>

                        </div>

                      </div>

                      {instagramAccount.is_connected ? (

                        <span
                          className="
                            rounded-full
                            bg-green-500/10
                            px-3
                            py-1
                            text-xs
                            text-green-400
                          "
                        >
                          Active
                        </span>

                      ) : (

                        <span
                          className="
                            rounded-full
                            bg-white/10
                            px-3
                            py-1
                            text-xs
                            text-white/40
                          "
                        >
                          Inactive
                        </span>

                      )}

                    </div>

                  )
                )}

              </div>

            </section>

          )}

          {/* ==================================================
              STATS
          ================================================== */}

          <div
            className="
              mt-10
              grid
              gap-5
              md:grid-cols-2
              lg:grid-cols-4
            "
          >

            <StatCard
              label="Followers"
              value={
                formatNumber(
                  account.followers_count
                )
              }
            />

            <StatCard
              label="Posts"
              value={
                String(
                  postsCount
                )
              }
            />

            <StatCard
              label="Following"
              value={
                formatNumber(
                  account.following_count
                )
              }
            />

            <StatCard
              label="Active Automations"
              value={
                String(
                  activeAutomations
                )
              }
            />

          </div>

          {/* ==================================================
              TOKEN
          ================================================== */}

          <div
            className="
              mt-8
              rounded-3xl
              border
              border-white/10
              bg-white/[0.04]
              p-6
            "
          >

            <p className="text-sm text-gray-500">
              Instagram Token
            </p>

            <p className="mt-3 text-2xl font-bold">

              {account.token_expires_at
                ? new Date(
                    account.token_expires_at
                  ).toLocaleDateString(
                    "en-IN",
                    {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }
                  )
                : "Managed automatically"}

            </p>

            <p className="mt-2 text-sm text-green-400">
              ● Long-lived token active
            </p>

          </div>

          {/* ==================================================
              POSTS
          ================================================== */}

          <section className="mt-10">

            <h2 className="text-2xl font-bold">
              Recent Posts
            </h2>

            <p className="mt-2 text-gray-500">
              Click a post to view media and description.
            </p>

            {posts.length === 0 ? (

              <div
                className="
                  mt-6
                  rounded-2xl
                  border
                  border-white/10
                  bg-white/[0.03]
                  p-10
                  text-center
                  text-gray-400
                "
              >

                No posts synced yet.

                <br />

                Click Sync Instagram.

              </div>

            ) : (

              <PostsGrid
                posts={posts}
              />

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

    <div
      className="
        rounded-2xl
        border
        border-white/10
        bg-white/[0.04]
        p-6
      "
    >

      <p className="text-sm text-gray-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold">
        {value}
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