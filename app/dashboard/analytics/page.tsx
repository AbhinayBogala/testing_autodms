import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Automation = {
  id: string;
  instagram_post_id: string | null;
  trigger_type: string;
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
};

type InstagramPost = {
  id: string;
  instagram_media_id: string | null;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
};

type CommentRow = {
  id: string;
  automation_id: string | null;
  instagram_post_id: string | null;
  commenter_instagram_id: string | null;
  dm_sent: boolean | null;
  public_reply_sent: boolean | null;
  created_at: string;
};

type LinkClickRow = {
  id: string;
  automation_id: string | null;
  recipient_instagram_id: string;
  clicked_at: string | null;
  created_at: string;
};

type FollowupRow = {
  id: string;
  automation_id: string | null;
  link_click_id: string | null;
  recipient_instagram_id: string;
  due_at: string;
  sent_at: string | null;
  failed_at: string | null;
  last_error: string | null;
  processing_at: string | null;
  attempts: number | null;
  created_at: string;
};

function emptyUuid() {
  return "00000000-0000-0000-0000-000000000000";
}

function isSkippedFollowup(
  followup: FollowupRow,
  clickMap: Map<string, LinkClickRow>,
) {
  /*
   * Your current cron marks a follow-up as processed by setting
   * sent_at even when it skips the DM because the link was clicked.
   *
   * Therefore:
   * clicked_at <= due_at
   * means the follow-up was skipped.
   */
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
  if (automation.trigger_type === "keyword") {
    return "Keyword → DM";
  }

  return "Any Comment → DM";
}

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userId = user.id;
  const admin = createAdminClient();

  /*
   * ============================================================
   * CONNECTED INSTAGRAM ACCOUNT
   * ============================================================
   *
   * Do NOT match the webhook Instagram ID here.
   *
   * OAuth instagram_user_id and webhook_instagram_user_id can be
   * different. The account is owned by the authenticated user.
   */
  const { data: account, error: accountError } = await admin
    .from("instagram_accounts")
    .select(
      `
      id,
      username,
      instagram_user_id,
      webhook_instagram_user_id,
      is_connected
      `,
    )
    .eq("user_id", userId)
    .eq("is_connected", true)
    .order("connected_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  if (accountError) {
    console.error("ANALYTICS ACCOUNT ERROR:", accountError);
  }

  let automations: Automation[] = [];
  let posts: InstagramPost[] = [];
  let comments: CommentRow[] = [];
  let linkClicks: LinkClickRow[] = [];
  let followups: FollowupRow[] = [];

  if (account) {
    /*
     * ==========================================================
     * AUTOMATIONS
     * ==========================================================
     */
    const { data: automationData, error: automationError } = await admin
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
        followup_enabled
        `,
      )
      .eq("user_id", userId)
      .eq("instagram_account_id", account.id)
      .order("updated_at", { ascending: false });

    if (automationError) {
      console.error("ANALYTICS AUTOMATIONS ERROR:", automationError);
    }

    automations = (automationData ?? []) as Automation[];

    const automationIds = automations.map((automation) => automation.id);

    /*
     * ==========================================================
     * COMMENTS
     * ==========================================================
     *
     * Only comments that belong to this user's automations are
     * counted. This is "Comments Processed", not total Instagram
     * comments on every post.
     */
    const { data: commentData, error: commentError } = await admin
      .from("instagram_comments")
      .select(
        `
        id,
        automation_id,
        instagram_post_id,
        commenter_instagram_id,
        dm_sent,
        public_reply_sent,
        created_at
        `,
      )
      .in(
        "automation_id",
        automationIds.length ? automationIds : [emptyUuid()],
      )
      .order("created_at", { ascending: false });

    if (commentError) {
      console.error("ANALYTICS COMMENTS ERROR:", commentError);
    }

    comments = (commentData ?? []) as CommentRow[];

    /*
     * ==========================================================
     * TRACKED LINKS / CLICKS
     * ==========================================================
     */
    const { data: clickData, error: clickError } = await admin
      .from("instagram_automation_link_clicks")
      .select(
        `
        id,
        automation_id,
        recipient_instagram_id,
        clicked_at,
        created_at
        `,
      )
      .in(
        "automation_id",
        automationIds.length ? automationIds : [emptyUuid()],
      )
      .order("created_at", { ascending: false });

    if (clickError) {
      console.error("ANALYTICS LINK CLICKS ERROR:", clickError);
    }

    linkClicks = (clickData ?? []) as LinkClickRow[];

    /*
     * ==========================================================
     * FOLLOW-UPS
     * ==========================================================
     */
    const { data: followupData, error: followupError } = await admin
      .from("instagram_automation_followups")
      .select(
        `
        id,
        automation_id,
        link_click_id,
        recipient_instagram_id,
        due_at,
        sent_at,
        failed_at,
        last_error,
        processing_at,
        attempts,
        created_at
        `,
      )
      .in(
        "automation_id",
        automationIds.length ? automationIds : [emptyUuid()],
      )
      .order("created_at", { ascending: false });

    if (followupError) {
      console.error("ANALYTICS FOLLOWUPS ERROR:", followupError);
    }

    followups = (followupData ?? []) as FollowupRow[];

    /*
     * ==========================================================
     * POSTS
     * ==========================================================
     *
     * IMPORTANT FIX:
     * instagram_automations.instagram_post_id is the POST ROW ID,
     * not instagram_posts.instagram_media_id.
     *
     * The old Analytics page searched instagram_media_id using
     * the UUID stored in instagram_post_id, which is why post
     * information was showing as "Instagram post" / zero data.
     */
    const postIds = [
      ...new Set(
        automations
          .map((automation) => automation.instagram_post_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    if (postIds.length) {
      const { data: postData, error: postError } = await admin
        .from("instagram_posts")
        .select(
          `
          id,
          instagram_media_id,
          caption,
          media_type,
          media_url
          `,
        )
        .eq("instagram_account_id", account.id)
        .in("id", postIds);

      if (postError) {
        console.error("ANALYTICS POSTS ERROR:", postError);
      }

      posts = (postData ?? []) as InstagramPost[];
    }
  }

  /*
   * ============================================================
   * GLOBAL METRICS
   * ============================================================
   */

  const totalAutomations = automations.length;

  const activeAutomations = automations.filter(
    (automation) => automation.is_active,
  ).length;

  const inactiveAutomations =
    totalAutomations - activeAutomations;

  const commentsProcessed = comments.length;

  const initialDmsSent = comments.filter(
    (comment) => comment.dm_sent === true,
  ).length;

  const publicRepliesSent = comments.filter(
    (comment) => comment.public_reply_sent === true,
  ).length;

  const trackedLinks = linkClicks.length;

  const linkClicksTotal = linkClicks.filter(
    (click) => Boolean(click.clicked_at),
  ).length;

  const clickRate =
    trackedLinks > 0
      ? (linkClicksTotal / trackedLinks) * 100
      : 0;

  const clickMap = new Map(
    linkClicks.map((click) => [click.id, click]),
  );

  const skippedFollowups = followups.filter(
    (followup) => isSkippedFollowup(followup, clickMap),
  ).length;

  const failedFollowups = followups.filter(
    (followup) => Boolean(followup.failed_at),
  ).length;

  const sentFollowups = followups.filter((followup) => {
    if (!followup.sent_at || followup.failed_at) {
      return false;
    }

    return !isSkippedFollowup(followup, clickMap);
  }).length;

  /*
   * Pending means the follow-up has not been processed yet.
   *
   * We intentionally do NOT require due_at > now. If a cron run
   * is delayed and a due follow-up is still unprocessed, it should
   * still appear as pending rather than disappear from analytics.
   */
  const pendingFollowups = followups.filter(
    (followup) =>
      !followup.sent_at && !followup.failed_at,
  ).length;

  /*
   * ============================================================
   * PER-AUTOMATION METRICS
   * ============================================================
   */

  const commentsByAutomation = new Map<string, number>();
  const dmsByAutomation = new Map<string, number>();
  const publicRepliesByAutomation = new Map<string, number>();
  const trackedLinksByAutomation = new Map<string, number>();
  const clicksByAutomation = new Map<string, number>();
  const followupsSentByAutomation = new Map<string, number>();
  const followupsSkippedByAutomation = new Map<string, number>();
  const followupsFailedByAutomation = new Map<string, number>();
  const pendingFollowupsByAutomation = new Map<string, number>();

  for (const comment of comments) {
    if (!comment.automation_id) continue;

    commentsByAutomation.set(
      comment.automation_id,
      (commentsByAutomation.get(comment.automation_id) ?? 0) + 1,
    );

    if (comment.dm_sent) {
      dmsByAutomation.set(
        comment.automation_id,
        (dmsByAutomation.get(comment.automation_id) ?? 0) + 1,
      );
    }

    if (comment.public_reply_sent) {
      publicRepliesByAutomation.set(
        comment.automation_id,
        (publicRepliesByAutomation.get(comment.automation_id) ?? 0) + 1,
      );
    }
  }

  for (const click of linkClicks) {
    if (!click.automation_id) continue;

    trackedLinksByAutomation.set(
      click.automation_id,
      (trackedLinksByAutomation.get(click.automation_id) ?? 0) + 1,
    );

    if (click.clicked_at) {
      clicksByAutomation.set(
        click.automation_id,
        (clicksByAutomation.get(click.automation_id) ?? 0) + 1,
      );
    }
  }

  for (const followup of followups) {
    if (!followup.automation_id) continue;

    if (!followup.sent_at && !followup.failed_at) {
      pendingFollowupsByAutomation.set(
        followup.automation_id,
        (pendingFollowupsByAutomation.get(followup.automation_id) ?? 0) + 1,
      );
    }

    if (followup.failed_at) {
      followupsFailedByAutomation.set(
        followup.automation_id,
        (followupsFailedByAutomation.get(followup.automation_id) ?? 0) + 1,
      );
      continue;
    }

    if (!followup.sent_at) {
      continue;
    }

    if (isSkippedFollowup(followup, clickMap)) {
      followupsSkippedByAutomation.set(
        followup.automation_id,
        (followupsSkippedByAutomation.get(followup.automation_id) ?? 0) + 1,
      );
    } else {
      followupsSentByAutomation.set(
        followup.automation_id,
        (followupsSentByAutomation.get(followup.automation_id) ?? 0) + 1,
      );
    }
  }

  const postMap = new Map(
    posts.map((post) => [post.id, post]),
  );

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <div>
        <p className="text-sm text-gray-500">Performance</p>

        <h1 className="mt-1 text-3xl font-bold">
          Analytics
        </h1>

        <p className="mt-2 text-gray-400">
          Real performance data from your Instagram automations.
        </p>
      </div>

      {!account ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <div className="text-4xl">📊</div>

          <h2 className="mt-4 text-xl font-semibold">
            Connect Instagram
          </h2>

          <p className="mt-2 text-gray-500">
            Connect an Instagram account to view automation analytics.
          </p>
        </div>
      ) : (
        <>
          {/* CONNECTED ACCOUNT */}

          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-500">
                Connected Instagram Account
              </p>

              <p className="mt-1 text-lg font-semibold">
                @{account.username || "Instagram"}
              </p>

              <p className="mt-1 text-xs text-gray-600">
                Automation analytics for this connected account
              </p>
            </div>

            <div className="w-fit rounded-full bg-green-500/10 px-4 py-2 text-sm text-green-400">
              ● Connected
            </div>
          </div>

          {/* ==================================================
              PRIMARY METRICS
              ================================================== */}

          <div className="mt-8">
            <h2 className="text-lg font-semibold">
              Automation Overview
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Actual activity recorded by DevilX.
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Comments Processed"
              value={commentsProcessed}
              description="Comments handled by automations"
            />

            <Metric
              label="Initial DMs Sent"
              value={initialDmsSent}
              description="Successful comment-triggered DMs"
            />

            <Metric
              label="Tracked Links"
              value={trackedLinks}
              description="Links generated for automation DMs"
            />

            <Metric
              label="Link Clicks"
              value={linkClicksTotal}
              description="Tracked links opened"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Click Rate"
              value={Number(clickRate.toFixed(1))}
              suffix="%"
              description="Clicks ÷ tracked links"
            />

            <Metric
              label="Follow-ups Sent"
              value={sentFollowups}
              description="Follow-ups actually delivered"
            />

            <Metric
              label="Follow-ups Skipped"
              value={skippedFollowups}
              description="Skipped after link was clicked"
            />

            <Metric
              label="Follow-ups Failed"
              value={failedFollowups}
              description="Follow-ups rejected by Instagram/API"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Metric
              label="Pending Follow-ups"
              value={pendingFollowups}
              description="Not processed yet"
            />

            <Metric
              label="Public Replies Sent"
              value={publicRepliesSent}
              description="Successful public comment replies"
            />

            <Metric
              label="Total Automations"
              value={totalAutomations}
              description="Automations for this account"
            />
          </div>

          {/* AUTOMATION STATUS */}

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Metric
              label="Active Automations"
              value={activeAutomations}
              description="Currently enabled"
            />

            <Metric
              label="Inactive Automations"
              value={inactiveAutomations}
              description="Currently disabled"
            />

            <Metric
              label="Automation DMs"
              value={initialDmsSent}
              description="Total initial DMs sent"
            />
          </div>

          {/* ==================================================
              PER-AUTOMATION PERFORMANCE
              ================================================== */}

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold">
                Per-Automation Performance
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Every number below is calculated from the actual
                automation records in Supabase.
              </p>
            </div>

            {automations.length === 0 ? (
              <div className="mt-6 rounded-xl border border-white/5 p-8 text-center text-gray-500">
                No automations created yet.
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {automations.map((automation) => {
                  const post = automation.instagram_post_id
                    ? postMap.get(automation.instagram_post_id)
                    : null;

                  const automationComments =
                    commentsByAutomation.get(automation.id) ?? 0;

                  const automationDms =
                    dmsByAutomation.get(automation.id) ?? 0;

                  const automationPublicReplies =
                    publicRepliesByAutomation.get(automation.id) ?? 0;

                  const automationTrackedLinks =
                    trackedLinksByAutomation.get(automation.id) ?? 0;

                  const automationClicks =
                    clicksByAutomation.get(automation.id) ?? 0;

                  const automationClickRate =
                    automationTrackedLinks > 0
                      ? (
                          (automationClicks /
                            automationTrackedLinks) *
                          100
                        ).toFixed(1)
                      : "0.0";

                  const automationFollowupsSent =
                    followupsSentByAutomation.get(automation.id) ?? 0;

                  const automationFollowupsSkipped =
                    followupsSkippedByAutomation.get(automation.id) ?? 0;

                  const automationFollowupsFailed =
                    followupsFailedByAutomation.get(automation.id) ?? 0;

                  const automationPendingFollowups =
                    pendingFollowupsByAutomation.get(automation.id) ?? 0;

                  return (
                    <div
                      key={automation.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-5"
                    >
                      {/* HEADER */}

                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-semibold">
                              {getTriggerLabel(automation)}
                            </h3>

                            <span
                              className={
                                automation.is_active
                                  ? "rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400"
                                  : "rounded-full bg-white/10 px-3 py-1 text-xs text-gray-500"
                              }
                            >
                              {automation.is_active
                                ? "Active"
                                : "Inactive"}
                            </span>

                            {automation.followup_enabled && (
                              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
                                Follow-up ON
                              </span>
                            )}
                          </div>

                          {automation.trigger_type === "keyword" && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(automation.trigger_keywords?.length
                                ? automation.trigger_keywords
                                : automation.trigger_keyword
                                  ? [automation.trigger_keyword]
                                  : []
                              ).map((keyword) => (
                                <span
                                  key={keyword}
                                  className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-gray-400"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}

                          <p className="mt-3 text-sm text-gray-400">
                            {post?.caption || "Instagram post"}
                          </p>

                          {post?.instagram_media_id && (
                            <p className="mt-2 text-xs text-gray-600">
                              Instagram Media ID:{" "}
                              {post.instagram_media_id}
                            </p>
                          )}

                          <p className="mt-1 text-xs text-gray-700">
                            Automation ID: {automation.id}
                          </p>
                        </div>

                        <div className="shrink-0 text-xs text-gray-600">
                          Updated {formatDate(automation.updated_at)}
                        </div>
                      </div>

                      {/* METRICS */}

                      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <SmallMetric
                          label="Comments Processed"
                          value={automationComments}
                        />

                        <SmallMetric
                          label="Initial DMs Sent"
                          value={automationDms}
                        />

                        <SmallMetric
                          label="Tracked Links"
                          value={automationTrackedLinks}
                        />

                        <SmallMetric
                          label="Link Clicks"
                          value={automationClicks}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <SmallMetric
                          label="Click Rate"
                          value={`${automationClickRate}%`}
                        />

                        <SmallMetric
                          label="Follow-ups Sent"
                          value={automationFollowupsSent}
                        />

                        <SmallMetric
                          label="Follow-ups Skipped"
                          value={automationFollowupsSkipped}
                        />

                        <SmallMetric
                          label="Follow-ups Failed"
                          value={automationFollowupsFailed}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <SmallMetric
                          label="Pending Follow-ups"
                          value={automationPendingFollowups}
                        />

                        <SmallMetric
                          label="Public Replies Sent"
                          value={automationPublicReplies}
                        />

                        <SmallMetric
                          label="Button"
                          value={
                            automation.button_name
                              ? "Enabled"
                              : "None"
                          }
                        />

                        <SmallMetric
                          label="Follow-up"
                          value={
                            automation.followup_enabled
                              ? "Enabled"
                              : "Disabled"
                          }
                        />
                      </div>

                      {/* MESSAGES */}

                      {automation.dm_message && (
                        <div className="mt-4 rounded-lg bg-white/[0.03] p-4">
                          <p className="text-xs text-gray-600">
                            Initial DM
                          </p>

                          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-400">
                            {automation.dm_message}
                          </p>
                        </div>
                      )}

                      {automation.reply_enabled &&
                        automation.reply_text && (
                          <div className="mt-3 rounded-lg bg-white/[0.03] p-4">
                            <p className="text-xs text-gray-600">
                              Public Reply
                            </p>

                            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-400">
                              {automation.reply_text}
                            </p>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DATA SOURCE */}

          <div className="mt-6 rounded-2xl border border-green-500/20 bg-green-500/[0.04] p-5">
            <p className="font-semibold text-green-400">
              Analytics source
            </p>

            <p className="mt-2 text-sm leading-6 text-gray-400">
              Comments come from{" "}
              <code className="text-gray-300">
                instagram_comments
              </code>
              . Initial DMs and public replies use the recorded
              success flags. Tracked links and clicks come from{" "}
              <code className="text-gray-300">
                instagram_automation_link_clicks
              </code>
              . Follow-up delivery, skipped, failed and pending
              states come from{" "}
              <code className="text-gray-300">
                instagram_automation_followups
              </code>
              .
            </p>

            <p className="mt-2 text-xs text-gray-600">
              These are all-time totals for the data currently stored
              in Supabase.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  suffix = "",
  description,
}: {
  label: string;
  value: number;
  suffix?: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5">
      <p className="text-sm text-gray-500">{label}</p>

      <p className="mt-3 text-3xl font-bold">
        {value.toLocaleString("en-IN")}
        {suffix}
      </p>

      {description && (
        <p className="mt-2 text-xs text-gray-600">
          {description}
        </p>
      )}
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <p className="text-xs text-gray-600">{label}</p>

      <p className="mt-1 text-lg font-semibold text-gray-300">
        {typeof value === "number"
          ? value.toLocaleString("en-IN")
          : value}
      </p>
    </div>
  );
}
