import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SyncInstagramButton from "./SyncInstagramButton";
import PostsGrid from "./PostsGrid";
import ConnectInstagramButton from "./ConnectInstagramButton";
import type { InstagramComment } from "@/types/instagram";

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();

  const params = searchParams
    ? await searchParams
    : {};

  const instagramStatus =
    typeof params.instagram === "string"
      ? params.instagram
      : "";

  const statusMessage =
    typeof params.message === "string"
      ? params.message
      : "";

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: instagramAccount, error: accountError } = await supabase
    .from("instagram_accounts")
    .select("id, username, profile_picture_url, followers_count, following_count, media_count, is_connected, token_expires_at, webhook_subscribed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountError) console.error("DASHBOARD ACCOUNT ERROR:", accountError);

  let activeAutomations = 0;
  let posts: InstagramPost[] = [];
  let comments: InstagramComment[] = [];

  if (instagramAccount?.is_connected) {
    const admin = createAdminClient();

    const { count } = await admin
      .from("automations")
      .select("id", { count: "exact", head: true })
      .eq("instagram_account_id", instagramAccount.id)
      .eq("is_active", true);
    activeAutomations = count ?? 0;

    const { data: postData, error: postsError } = await admin
      .from("instagram_posts")
      .select("id, instagram_media_id, caption, media_type, media_url, permalink, published_at, likes_count, comments_count")
      .eq("instagram_account_id", instagramAccount.id)
      .order("published_at", { ascending: false })
      .limit(12);
    if (postsError) console.error("DASHBOARD POSTS ERROR:", postsError);
    posts = (postData ?? []) as InstagramPost[];

    if (posts.length) {
      const { data: commentData, error: commentsError } = await admin
        .from("instagram_comments")
        .select("id, instagram_post_id, instagram_comment_id, commenter_instagram_id, commenter_username, comment_text, parent_comment_id, public_reply_sent, public_reply_text, public_reply_at, dm_sent, created_at")
        .in("instagram_post_id", posts.map((p) => p.id))
        .order("created_at", { ascending: true });
      if (commentsError) console.error("DASHBOARD COMMENTS ERROR:", commentsError);
      comments = (commentData ?? []).map((comment) => ({ ...comment, replies: [] })) as InstagramComment[];
    }
  }

  const expiryText = instagramAccount?.token_expires_at
    ? new Date(instagramAccount.token_expires_at).toLocaleDateString("en-IN")
    : "Managed automatically";

  return (
    <div className="px-8 py-8">
      {instagramStatus === "connected" && (
        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
          Instagram connected successfully. Your account and token have been updated.
        </div>
      )}

      {instagramStatus === "error" && statusMessage && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          Instagram connection failed: {statusMessage}
        </div>
      )}

      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm text-gray-500">Overview</p>
          <h1 className="mt-1 text-3xl font-bold">Dashboard</h1>
          <p className="mt-2 text-gray-400">Manage Instagram content, comments, DMs and automations.</p>
        </div>
        <div className="flex items-center gap-3">
          {instagramAccount?.is_connected ? <SyncInstagramButton /> : <ConnectInstagramButton />}
          {instagramAccount?.is_connected && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
              {instagramAccount.profile_picture_url ? (
                <img src={instagramAccount.profile_picture_url} alt={instagramAccount.username ?? "Instagram"} className="h-8 w-8 rounded-full object-cover" />
              ) : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">◎</div>}
              <div>
                <p className="text-sm font-medium">@{instagramAccount.username}</p>
                <p className="text-xs text-green-400">● Connected</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {!instagramAccount?.is_connected && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold">Connect your Instagram account</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">Use Instagram Business Login to connect your professional Instagram account. The server will exchange the authorization token for a long-lived token and manage refreshes automatically.</p>
          <div className="mt-5"><ConnectInstagramButton label={instagramAccount ? "Reconnect Instagram" : "Connect Instagram"} /></div>
        </div>
      )}

      {instagramAccount?.is_connected && (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Followers" value={formatNumber(instagramAccount.followers_count)} />
            <StatCard label="Posts" value={formatNumber(instagramAccount.media_count)} />
            <StatCard label="Following" value={formatNumber(instagramAccount.following_count)} />
            <StatCard label="Active Automations" value={String(activeAutomations)} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <InfoCard label="Token status" value={`Long-lived · expires ${expiryText}`} />
            <InfoCard label="Webhook status" value={instagramAccount.webhook_subscribed ? "Comments + messages subscribed" : "Not subscribed — reconnect or check Meta settings"} />
          </div>

          <section className="mt-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Recent Posts</h2>
                <p className="mt-1 text-sm text-gray-500">Click a post to open threaded comments.</p>
              </div>
              <a href="/dashboard/content" className="text-sm text-gray-400 hover:text-white">View all →</a>
            </div>
            {posts.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-gray-500">No posts synced yet. Click Sync Instagram.</div>
            ) : <PostsGrid posts={posts} comments={comments} />}
          </section>

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <div><h2 className="text-xl font-semibold">Automations</h2><p className="mt-1 text-sm text-gray-500">Create post-specific, keyword or any-comment automations.</p></div>
              <a href="/dashboard/automations" className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-gray-200">Create Automation</a>
            </div>
            <p className="mt-5 text-2xl font-semibold">{activeAutomations}</p>
            <p className="text-sm text-gray-600">active automations</p>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5"><p className="text-sm text-gray-500">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p></div>;
}
function InfoCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-wide text-gray-600">{label}</p><p className="mt-2 text-sm text-gray-300">{value}</p></div>;
}
function formatNumber(value: number | null) { return new Intl.NumberFormat("en-IN").format(value ?? 0); }
