import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import ConnectInstagramButton from "./ConnectInstagramButton";
import SyncInstagramButton from "./SyncInstagramButton";
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

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select(`
      id,
      username,
      followers_count,
      following_count,
      media_count,
      is_connected,
      token_expires_at
    `)
    .eq("user_id", user.id)
    .maybeSingle();

  const admin = createAdminClient();

  const { data: automationData, error: automationError } = await admin
    .from("instagram_automations")
    .select("id,is_active")
    .eq("user_id", user.id);

  if (automationError) {
    console.error("AUTOMATION COUNT ERROR:", automationError);
  }

  const activeAutomations =
    (automationData ?? []).filter(
      (item) => item.is_active === true
    ).length;

  let posts: InstagramPost[] = [];

  if (account?.is_connected) {
    const { data } = await admin
      .from("instagram_posts")
      .select(`
        id,
        instagram_media_id,
        caption,
        media_type,
        media_url,
        permalink,
        published_at,
        likes_count,
        comments_count
      `)
      .eq("instagram_account_id", account.id)
      .order("published_at", { ascending: false })
      .limit(12);

    posts = (data ?? []) as InstagramPost[];
  }

  return (
    <div className="px-10 py-10">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-gray-500">Overview</p>
          <h1 className="mt-2 text-4xl font-bold">Dashboard</h1>
          <p className="mt-2 text-gray-400">
            Manage Instagram content, DMs and automations.
          </p>
        </div>

        {account?.is_connected && <SyncInstagramButton />}
      </div>

      {!account?.is_connected ? (
        <div className="mt-20 mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-12 text-center">
          <div className="text-5xl">✨</div>

          <h2 className="mt-6 text-3xl font-bold">
            Connect your Instagram
          </h2>

          <p className="mt-4 text-gray-400">
            Connect your professional account to start managing comments,
            DMs and automations.
          </p>

          <div className="mt-8">
            <ConnectInstagramButton label="Connect Instagram" />
          </div>
        </div>
      ) : (
        <>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Followers"
              value={formatNumber(account.followers_count)}
            />

            <StatCard
              label="Posts"
              value={formatNumber(account.media_count)}
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

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-500">
              Instagram Token
            </p>

            <p className="mt-3 text-2xl font-bold">
              {account.token_expires_at
                ? new Date(account.token_expires_at).toLocaleDateString(
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

          <section className="mt-10">
            <h2 className="text-2xl font-bold">
              Recent Posts
            </h2>

            <p className="mt-2 text-gray-500">
              Click a post to view media and description.
            </p>

            {posts.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-gray-400">
                No posts synced yet.
                <br />
                Click Sync Instagram.
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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

function formatNumber(value: number | null) {
  return new Intl.NumberFormat("en-IN").format(value ?? 0);
}