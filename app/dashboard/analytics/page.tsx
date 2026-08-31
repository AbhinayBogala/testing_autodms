import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  automation_id?: string | string[];
};

type AnalyticsPageProps = {
  searchParams?: Promise<SearchParams>;
};

type Account = {
  id: string;
  username: string | null;
  instagram_user_id: string | null;
  is_connected: boolean | null;
};

type Automation = {
  id: string;
  instagram_post_id: string | null;
  trigger_type: string | null;
  trigger_keyword: string | null;
  trigger_keywords: string[] | null;
  dm_message: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  button_name: string | null;
  button_url: string | null;
  reply_enabled: boolean | null;
  reply_text: string | null;
  followup_enabled: boolean | null;
  followup_delay_minutes: number | null;
};

type InstagramPost = {
  id: string;
  instagram_media_id: string | null;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  comments_count: number | null;
  likes_count: number | null;
};

type CommentRow = {
  id: string;
  automation_id: string | null;
  instagram_post_id: string | null;
  dm_sent: boolean | null;
  public_reply_sent: boolean | null;
  created_at: string;
};

type LinkClickRow = {
  id: string;
  automation_id: string | null;
  clicked_at: string | null;
  created_at: string;
};

type FollowupRow = {
  id: string;
  automation_id: string | null;
  link_click_id: string | null;
  due_at: string;
  sent_at: string | null;
  failed_at: string | null;
  processing_at: string | null;
};

function emptyUuid() {
  return "00000000-0000-0000-0000-000000000000";
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function getTriggerLabel(automation: Automation) {
  if (
    automation.trigger_type === "keyword" ||
    automation.trigger_type === "keywords"
  ) {
    return "Specific keywords";
  }

  return "Any comment";
}

function getFollowupDelayLabel(minutes: number | null) {
  const value = Number(minutes ?? 360);

  if (value === 60) return "1 hour";
  if (value === 180) return "3 hours";
  if (value === 360) return "6 hours";
  if (value === 720) return "12 hours";
  if (value === 1380) return "23 hours";

  if (value % 60 === 0) {
    const hours = value / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `${value} minutes`;
}

function wasSkipped(
  followup: FollowupRow,
  clickMap: Map<string, LinkClickRow>,
) {
  if (!followup.sent_at || !followup.link_click_id) {
    return false;
  }

  const click = clickMap.get(followup.link_click_id);

  if (!click?.clicked_at) {
    return false;
  }

  return (
    new Date(click.clicked_at).getTime() <=
    new Date(followup.due_at).getTime()
  );
}

function Metric({
  label,
  value,
  suffix = "",
  valueLabel,
}: {
  label: string;
  value: number;
  suffix?: string;
  valueLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b0b] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600">
        {label}
      </p>

      <p className="mt-4 text-3xl font-bold tracking-[-0.04em]">
        {valueLabel ??
          `${value.toLocaleString("en-IN")}${suffix}`}
      </p>
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-600">
        {label}
      </p>

      <p className="mt-1 text-lg font-semibold text-gray-300">
        {value.toLocaleString("en-IN")}
      </p>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = searchParams
    ? await searchParams
    : {};

  const rawAutomationId =
    params.automation_id;

  const automationId = Array.isArray(
    rawAutomationId,
  )
    ? rawAutomationId[0]
    : rawAutomationId;

  const admin = createAdminClient();

  /*
   * ============================================================
   * CONNECTED INSTAGRAM ACCOUNT
   * ============================================================
   */

  const { data: accountData } = await admin
    .from("instagram_accounts")
    .select(
      `
      id,
      username,
      instagram_user_id,
      is_connected
      `,
    )
    .eq("user_id", user.id)
    .eq("is_connected", true)
    .order("connected_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  const account =
    accountData as Account | null;

  if (!account) {
    return (
      <main className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-8 text-center">
            <div className="text-4xl">📊</div>

            <h1 className="mt-4 text-2xl font-semibold">
              Instagram not connected
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Connect Instagram to view analytics.
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ============================================================
   * ACCOUNT-WIDE DATA
   *
   * These queries are used when the user opens:
   *
   * /dashboard/analytics
   * ============================================================
   */

  const { data: automationData } =
    await admin
      .from("instagram_automations")
      .select(
        `
        id,
        instagram_post_id,
        trigger_type,
        trigger_keyword,
        trigger_keywords,
        dm_message,
        is_active,
        created_at,
        updated_at,
        button_name,
        button_url,
        reply_enabled,
        reply_text,
        followup_enabled,
        followup_delay_minutes
        `,
      )
      .eq("user_id", user.id)
      .eq("instagram_account_id", account.id)
      .order("updated_at", {
        ascending: false,
      });

  const allAutomations =
    (automationData ?? []) as Automation[];

  const allAutomationIds =
    allAutomations.map(
      (automation) => automation.id,
    );

  const safeAutomationIds =
    allAutomationIds.length > 0
      ? allAutomationIds
      : [emptyUuid()];

  const { data: allCommentsData } =
    await admin
      .from("instagram_comments")
      .select(
        `
        id,
        automation_id,
        instagram_post_id,
        dm_sent,
        public_reply_sent,
        created_at
        `,
      )
      .in(
        "automation_id",
        safeAutomationIds,
      );

  const allComments =
    (allCommentsData ?? []) as CommentRow[];

  const { data: allClicksData } =
    await admin
      .from(
        "instagram_automation_link_clicks",
      )
      .select(
        `
        id,
        automation_id,
        clicked_at,
        created_at
        `,
      )
      .in(
        "automation_id",
        safeAutomationIds,
      );

  const allClicks =
    (allClicksData ?? []) as LinkClickRow[];

  const { data: allFollowupsData } =
    await admin
      .from(
        "instagram_automation_followups",
      )
      .select(
        `
        id,
        automation_id,
        link_click_id,
        due_at,
        sent_at,
        failed_at,
        processing_at
        `,
      )
      .in(
        "automation_id",
        safeAutomationIds,
      );

  const allFollowups =
    (allFollowupsData ?? []) as FollowupRow[];

  /*
   * ============================================================
   * ACCOUNT METRICS
   * ============================================================
   */

  const totalAutomations =
    allAutomations.length;

  const activeAutomations =
    allAutomations.filter(
      (automation) =>
        automation.is_active,
    ).length;

  const totalComments =
    allComments.length;

  const totalDms =
    allComments.filter(
      (comment) => comment.dm_sent,
    ).length;

  const totalPublicReplies =
    allComments.filter(
      (comment) =>
        comment.public_reply_sent,
    ).length;

  const totalTrackedLinks =
    allClicks.length;

  const totalLinkClicks =
    allClicks.filter(
      (click) => Boolean(click.clicked_at),
    ).length;

  const accountClickRate =
    totalTrackedLinks > 0
      ? (
          (totalLinkClicks /
            totalTrackedLinks) *
          100
        )
      : 0;

  const allClickMap = new Map(
    allClicks.map((click) => [
      click.id,
      click,
    ]),
  );

  const totalFollowupsSkipped =
    allFollowups.filter((followup) =>
      wasSkipped(
        followup,
        allClickMap,
      ),
    ).length;

  const totalFollowupsFailed =
    allFollowups.filter(
      (followup) =>
        Boolean(followup.failed_at),
    ).length;

  const totalFollowupsSent =
    allFollowups.filter((followup) => {
      if (
        !followup.sent_at ||
        followup.failed_at
      ) {
        return false;
      }

      return !wasSkipped(
        followup,
        allClickMap,
      );
    }).length;

  const totalPendingFollowups =
    allFollowups.filter(
      (followup) =>
        !followup.sent_at &&
        !followup.failed_at,
    ).length;

  /*
   * ============================================================
   * ACCOUNT POST DATA
   * ============================================================
   */

  const allPostIds = [
    ...new Set(
      allAutomations
        .map(
          (automation) =>
            automation.instagram_post_id,
        )
        .filter(Boolean),
    ),
  ];

  let allPosts: InstagramPost[] = [];

  if (allPostIds.length > 0) {
    const { data: postData } =
      await admin
        .from("instagram_posts")
        .select(
          `
          id,
          instagram_media_id,
          caption,
          media_type,
          media_url,
          comments_count,
          likes_count
          `,
        )
        .eq(
          "instagram_account_id",
          account.id,
        )
        .in("id", allPostIds);

    allPosts =
      (postData ?? []) as InstagramPost[];
  }

  const postMap = new Map(
    allPosts.map((post) => [
      post.id,
      post,
    ]),
  );

  /*
   * ============================================================
   * ACCOUNT VIEW
   * ============================================================
   */

  if (!automationId) {
    return (
      <main className="min-h-screen bg-[#050505] text-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-600">
              DevilX / Analytics
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">
              Account Analytics
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Complete analytics across your Instagram automations.
            </p>
          </div>

          {/* ACCOUNT */}

          <section className="mt-7 rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                  Instagram Account
                </p>

                <p className="mt-2 text-lg font-semibold">
                  @{account.username || "Instagram"}
                </p>

                <p className="mt-1 text-xs text-gray-600">
                  All account automation analytics
                </p>
              </div>

              <span className="w-fit rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                ● Connected
              </span>

            </div>
          </section>

          {/* MAIN TOTALS */}

          <section className="mt-7">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">
                Account Overview
              </h2>

              <p className="mt-1 text-xs text-gray-600">
                Totals across all your automation activity.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              <Metric
                label="Total Automations"
                value={totalAutomations}
              />

              <Metric
                label="Active Automations"
                value={activeAutomations}
              />

              <Metric
                label="Comments"
                value={totalComments}
              />

              <Metric
                label="Initial DMs"
                value={totalDms}
              />

            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              <Metric
                label="Public Replies"
                value={totalPublicReplies}
              />

              <Metric
                label="Tracked Links"
                value={totalTrackedLinks}
              />

              <Metric
                label="Link Clicks"
                value={totalLinkClicks}
              />

              <Metric
                label="Click Rate"
                value={Number(
                  accountClickRate.toFixed(1),
                )}
                suffix="%"
              />

            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              <Metric
                label="Follow-ups Sent"
                value={totalFollowupsSent}
              />

              <Metric
                label="Follow-ups Skipped"
                value={totalFollowupsSkipped}
              />

              <Metric
                label="Follow-ups Failed"
                value={totalFollowupsFailed}
              />

              <Metric
                label="Pending Follow-ups"
                value={totalPendingFollowups}
              />

            </div>
          </section>

          {/* POSTS */}

          <section className="mt-8 rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

            <div>
              <h2 className="text-lg font-semibold">
                Post Performance
              </h2>

              <p className="mt-1 text-xs text-gray-600">
                Every post connected to an automation.
              </p>
            </div>

            {allAutomations.length === 0 ? (
              <div className="mt-6 rounded-xl border border-white/[0.05] p-8 text-center text-sm text-gray-600">
                No automations created yet.
              </div>
            ) : (
              <div className="mt-6 space-y-4">

                {allAutomations.map(
                  (automation) => {
                    const post =
                      automation.instagram_post_id
                        ? postMap.get(
                            automation.instagram_post_id,
                          )
                        : null;

                    const comments =
                      allComments.filter(
                        (comment) =>
                          comment.automation_id ===
                          automation.id,
                      ).length;

                    const dms =
                      allComments.filter(
                        (comment) =>
                          comment.automation_id ===
                            automation.id &&
                          comment.dm_sent,
                      ).length;

                    const clicks =
                      allClicks.filter(
                        (click) =>
                          click.automation_id ===
                            automation.id &&
                          click.clicked_at,
                      ).length;

                    return (
                      <div
                        key={automation.id}
                        className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row">

                          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-black">
                            {post?.media_url ? (
                              post.media_type?.toUpperCase() ===
                              "VIDEO" ? (
                                <video
                                  src={
                                    post.media_url
                                  }
                                  className="h-full w-full object-cover"
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={
                                    post.media_url
                                  }
                                  alt="Instagram post"
                                  className="h-full w-full object-cover"
                                />
                              )
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-gray-700">
                                No image
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">

                            <div className="flex flex-wrap items-center gap-2">

                              <span className="font-semibold">
                                {getTriggerLabel(
                                  automation,
                                )}
                              </span>

                              <span
                                className={
                                  automation.is_active
                                    ? "rounded-full bg-emerald-500/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase text-emerald-400"
                                    : "rounded-full bg-white/[0.04] px-2.5 py-1 text-[9px] font-semibold uppercase text-gray-600"
                                }
                              >
                                {automation.is_active
                                  ? "ON"
                                  : "OFF"}
                              </span>

                            </div>

                            <p className="mt-2 line-clamp-2 text-sm text-gray-500">
                              {post?.caption ||
                                "Instagram post"}
                            </p>

                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">

                              <SmallMetric
                                label="Likes"
                                value={
                                  post?.likes_count ??
                                  0
                                }
                              />

                              <SmallMetric
                                label="Comments"
                                value={
                                  post?.comments_count ??
                                  0
                                }
                              />

                              <SmallMetric
                                label="DMs"
                                value={dms}
                              />

                              <SmallMetric
                                label="Clicks"
                                value={clicks}
                              />

                            </div>

                            <div className="mt-4">
                              <a
                                href={`/dashboard/analytics?automation_id=${encodeURIComponent(
                                  automation.id,
                                )}`}
                                className="inline-flex items-center rounded-xl border border-[#ff1744]/20 bg-[#ff1744]/[0.04] px-4 py-2 text-xs font-medium text-[#ff6b86] transition-colors hover:border-[#ff1744]/40 hover:bg-[#ff1744]/[0.08] hover:text-white"
                              >
                                View Post Analytics →
                              </a>
                            </div>

                          </div>
                        </div>
                      </div>
                    );
                  },
                )}

              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  /*
   * ============================================================
   * POST ANALYTICS VIEW
   * ============================================================
   */

  const automation =
    allAutomations.find(
      (item) =>
        item.id === automationId,
    ) ?? null;

  if (!automation) {
    return (
      <main className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-8 text-center">
            <h1 className="text-2xl font-semibold">
              Post analytics not found
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              This automation does not exist or does not belong to this account.
            </p>

            <a
              href="/dashboard/analytics"
              className="mt-6 inline-flex rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-xs text-gray-400 hover:bg-white/[0.05] hover:text-white"
            >
              ← Account Analytics
            </a>
          </div>
        </div>
      </main>
    );
  }

  const post =
    automation.instagram_post_id
      ? postMap.get(
          automation.instagram_post_id,
        ) ?? null
      : null;

  const comments =
    allComments.filter(
      (comment) =>
        comment.automation_id ===
        automation.id,
    );

  const clicks =
    allClicks.filter(
      (click) =>
        click.automation_id ===
        automation.id,
    );

  const followups =
    allFollowups.filter(
      (followup) =>
        followup.automation_id ===
        automation.id,
    );

  const commentsProcessed =
    comments.length;

  const initialDmsSent =
    comments.filter(
      (comment) => comment.dm_sent,
    ).length;

  const publicRepliesSent =
    comments.filter(
      (comment) =>
        comment.public_reply_sent,
    ).length;

  const trackedLinks =
    clicks.length;

  const linkClicks =
    clicks.filter(
      (click) =>
        Boolean(click.clicked_at),
    ).length;

  const clickRate =
    trackedLinks > 0
      ? (linkClicks /
          trackedLinks) *
        100
      : 0;

  const clickMap = new Map(
    clicks.map((click) => [
      click.id,
      click,
    ]),
  );

  const followupsSkipped =
    followups.filter((followup) =>
      wasSkipped(
        followup,
        clickMap,
      ),
    ).length;

  const followupsFailed =
    followups.filter(
      (followup) =>
        Boolean(followup.failed_at),
    ).length;

  const followupsSent =
    followups.filter((followup) => {
      if (
        !followup.sent_at ||
        followup.failed_at
      ) {
        return false;
      }

      return !wasSkipped(
        followup,
        clickMap,
      );
    }).length;

  const pendingFollowups =
    followups.filter(
      (followup) =>
        !followup.sent_at &&
        !followup.failed_at,
    ).length;

  const keywords =
    automation.trigger_keywords
      ?.length
      ? automation.trigger_keywords
      : automation.trigger_keyword
        ? [automation.trigger_keyword]
        : [];

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* HEADER */}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-600">
              DevilX / Analytics
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">
              Post Analytics
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Performance for this Instagram post.
            </p>
          </div>

          <a
            href="/dashboard/analytics"
            className="inline-flex w-fit items-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-xs font-medium text-gray-400 transition-colors hover:border-white/[0.15] hover:bg-white/[0.05] hover:text-white"
          >
            ← Account Analytics
          </a>

        </div>

        {/* ACCOUNT */}

        <section className="mt-7 rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                Instagram Account
              </p>

              <p className="mt-2 text-lg font-semibold">
                @{account.username || "Instagram"}
              </p>
            </div>

            <span className="w-fit rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              ● Connected
            </span>

          </div>

        </section>

        {/* POST */}

        <section className="mt-5 rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

          <div className="flex flex-col gap-5 md:flex-row">

            <div className="h-56 w-full shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-black md:h-64 md:w-64">

              {post?.media_url ? (
                post.media_type?.toUpperCase() ===
                "VIDEO" ? (
                  <video
                    src={post.media_url}
                    className="h-full w-full object-cover"
                    controls
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={post.media_url}
                    alt="Instagram post"
                    className="h-full w-full object-cover"
                  />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-600">
                  Post preview unavailable
                </div>
              )}

            </div>

            <div className="min-w-0 flex-1">

              <div className="flex flex-wrap items-center gap-2">

                <span className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[9px] uppercase tracking-wider text-gray-600">
                  Post
                </span>

                <span
                  className={
                    automation.is_active
                      ? "rounded-full bg-emerald-500/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400"
                      : "rounded-full bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500"
                  }
                >
                  {automation.is_active
                    ? "ON"
                    : "OFF"}
                </span>

              </div>

              <h2 className="mt-4 text-xl font-semibold">
                {getTriggerLabel(
                  automation,
                )}
              </h2>

              {(automation.trigger_type ===
                "keyword" ||
                automation.trigger_type ===
                  "keywords") &&
                keywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {keywords.map(
                      (keyword) => (
                        <span
                          key={keyword}
                          className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-gray-400"
                        >
                          {keyword}
                        </span>
                      ),
                    )}
                  </div>
                )}

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-400">
                {post?.caption ||
                  "No caption available."}
              </p>

              <div className="mt-5 flex flex-wrap gap-5 text-xs text-gray-600">
                <span>
                  Created:{" "}
                  {formatDate(
                    automation.created_at,
                  )}
                </span>

                <span>
                  Updated:{" "}
                  {formatDate(
                    automation.updated_at,
                  )}
                </span>
              </div>

            </div>
          </div>
        </section>

        {/* POST PERFORMANCE */}

        <section className="mt-7">

          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              Post Performance
            </h2>

            <p className="mt-1 text-xs text-gray-600">
              Instagram numbers for this post.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">

            <Metric
              label="Post Likes"
              value={
                post?.likes_count ?? 0
              }
            />

            <Metric
              label="Post Comments"
              value={
                post?.comments_count ?? 0
              }
            />

          </div>

        </section>

        {/* AUTOMATION PERFORMANCE */}

        <section className="mt-7">

          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              Automation Performance
            </h2>

            <p className="mt-1 text-xs text-gray-600">
              Activity generated by this post automation.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <Metric
              label="Comments Processed"
              value={commentsProcessed}
            />

            <Metric
              label="Initial DMs Sent"
              value={initialDmsSent}
            />

            <Metric
              label="Public Replies"
              value={publicRepliesSent}
            />

            <Metric
              label="Tracked Links"
              value={trackedLinks}
            />

          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <Metric
              label="Link Clicks"
              value={linkClicks}
            />

            <Metric
              label="Click Rate"
              value={Number(
                clickRate.toFixed(1),
              )}
              suffix="%"
            />

            <Metric
              label="Follow-ups Sent"
              value={followupsSent}
            />

            <Metric
              label="Follow-ups Skipped"
              value={followupsSkipped}
            />

          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">

            <Metric
              label="Follow-ups Failed"
              value={followupsFailed}
            />

            <Metric
              label="Pending Follow-ups"
              value={pendingFollowups}
            />

          </div>

        </section>

        {/* FOLLOW-UP */}

        <section className="mt-7 rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                Follow-up
              </p>

              <h2 className="mt-2 text-lg font-semibold">
                {automation.followup_enabled
                  ? "Follow-up is ON"
                  : "Follow-up is OFF"}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {automation.followup_enabled
                  ? `Configured for ${getFollowupDelayLabel(
                      automation.followup_delay_minutes,
                    )}.`
                  : "No follow-up will be sent."}
              </p>
            </div>

            <span
              className={
                automation.followup_enabled
                  ? "w-fit rounded-full bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400"
                  : "w-fit rounded-full bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500"
              }
            >
              {automation.followup_enabled
                ? "ON"
                : "OFF"}
            </span>

          </div>

        </section>

        {/* MESSAGES */}

        <section className="mt-7 rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

          <h2 className="text-lg font-semibold">
            Automation Messages
          </h2>

          {automation.dm_message && (
            <div className="mt-5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-gray-700">
                Initial DM
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-400">
                {automation.dm_message}
              </p>
            </div>
          )}

          {automation.reply_enabled &&
            automation.reply_text && (
              <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-gray-700">
                  Public Reply
                </p>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-400">
                  {automation.reply_text}
                </p>
              </div>
            )}

          {automation.button_name &&
            automation.button_url && (
              <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-gray-700">
                  Button
                </p>

                <p className="mt-2 text-sm text-gray-400">
                  {automation.button_name}
                </p>

                <p className="mt-1 break-all text-xs text-gray-600">
                  {automation.button_url}
                </p>
              </div>
            )}

        </section>

      </div>
    </main>
  );
}
