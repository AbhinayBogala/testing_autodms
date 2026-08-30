import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Automation = {
  id: string;
  instagram_post_id: string;
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
};

type InstagramPost = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  comments_count: number | null;
  likes_count: number | null;
};

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /**
   * ============================================================
   * GET CURRENT CONNECTED INSTAGRAM ACCOUNT
   * ============================================================
   */

  const { data: account, error: accountError } =
    await supabase
      .from("instagram_accounts")
      .select(
        `
        id,
        username,
        instagram_user_id,
        is_connected
        `
      )
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .order("connected_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1)
      .maybeSingle();

  if (accountError) {
    console.error(
      "ANALYTICS ACCOUNT ERROR:",
      accountError
    );
  }

  const admin = createAdminClient();

  /**
   * ============================================================
   * GET AUTOMATIONS
   * ============================================================
   *
   * IMPORTANT:
   *
   * We now use instagram_automations.
   *
   * The old table:
   *
   *     automations
   *
   * is no longer used.
   */

  let automations: Automation[] = [];

  if (account) {
    const {
      data: automationData,
      error: automationError,
    } = await admin
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
        reply_text
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "instagram_account_id",
        account.id
      )
      .order("updated_at", {
        ascending: false,
      });

    if (automationError) {
      console.error(
        "ANALYTICS AUTOMATIONS ERROR:",
        automationError
      );
    }

    automations =
      (automationData ?? []) as Automation[];
  }

  /**
   * ============================================================
   * GET POSTS USED BY AUTOMATIONS
   * ============================================================
   *
   * instagram_automations.instagram_post_id contains
   * the Instagram MEDIA ID.
   *
   * Example:
   *
   * 17943238854072307
   *
   * Therefore we match it against:
   *
   * instagram_posts.instagram_media_id
   */

  let posts: InstagramPost[] = [];

  if (
    account &&
    automations.length > 0
  ) {
    const mediaIds = [
      ...new Set(
        automations
          .map(
            (automation) =>
              automation.instagram_post_id
          )
          .filter(Boolean)
      ),
    ];

    if (mediaIds.length > 0) {
      const {
        data: postData,
        error: postError,
      } = await admin
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
          `
        )
        .eq(
          "instagram_account_id",
          account.id
        )
        .in(
          "instagram_media_id",
          mediaIds
        );

      if (postError) {
        console.error(
          "ANALYTICS POSTS ERROR:",
          postError
        );
      }

      posts =
        (postData ?? []) as InstagramPost[];
    }
  }

  /**
   * ============================================================
   * BASIC ANALYTICS
   * ============================================================
   */

  const activeAutomations =
    automations.filter(
      (automation) =>
        automation.is_active === true
    ).length;

  const inactiveAutomations =
    automations.length -
    activeAutomations;

  /**
   * ============================================================
   * POST COMMENT TOTAL
   * ============================================================
   *
   * IMPORTANT:
   *
   * This is the total number of comments on the
   * Instagram posts attached to automations.
   *
   * It is NOT necessarily the number of comments
   * processed by the automation.
   *
   * Your current instagram_automations table does
   * not contain a total_comments counter.
   */

  const totalPostComments =
    posts.reduce(
      (total, post) =>
        total +
        Number(
          post.comments_count ?? 0
        ),
      0
    );

  /**
   * ============================================================
   * TOTAL LIKES
   * ============================================================
   */

  const totalPostLikes =
    posts.reduce(
      (total, post) =>
        total +
        Number(
          post.likes_count ?? 0
        ),
      0
    );

  /**
   * ============================================================
   * DM TRACKING
   * ============================================================
   *
   * Your current instagram_automations table stores
   * the DM message, but NOT the number of DMs sent.
   *
   * Therefore we intentionally do not pretend that
   * a DM count exists.
   */

  const dmTrackingAvailable = false;

  /**
   * ============================================================
   * AUTOMATION TYPE COUNTS
   * ============================================================
   */

  const anyCommentAutomations =
    automations.filter(
      (automation) =>
        automation.trigger_type ===
        "any_comment"
    ).length;

  const keywordAutomations =
    automations.filter(
      (automation) =>
        automation.trigger_type ===
        "keyword"
    ).length;

  /**
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      {/* HEADER */}

      <div>
        <p className="text-sm text-gray-500">
          Performance
        </p>

        <h1 className="mt-1 text-3xl font-bold">
          Analytics
        </h1>

        <p className="mt-2 text-gray-400">
          Monitor your Instagram automation
          activity and performance.
        </p>
      </div>

      {/* NO ACCOUNT */}

      {!account ? (
        <div
          className="
            mt-8
            rounded-2xl
            border
            border-white/10
            bg-white/[0.04]
            p-5 sm:p-8
            text-center
          "
        >
          <div className="text-4xl">
            📊
          </div>

          <h2 className="mt-4 text-xl font-semibold">
            Connect Instagram
          </h2>

          <p className="mt-2 text-gray-500">
            Connect an Instagram account to
            view automation analytics.
          </p>
        </div>
      ) : (
        <>
          {/* CONNECTED ACCOUNT */}

          <div
            className="
              mt-8
              flex
              items-center
              justify-between
              rounded-2xl
              border
              border-white/10
              bg-white/[0.04]
              p-5
            "
          >
            <div>
              <p className="text-sm text-gray-500">
                Connected Instagram Account
              </p>

              <p className="mt-1 text-lg font-semibold">
                @{account.username}
              </p>
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

          {/* MAIN METRICS */}

          <div
            className="
              mt-8
              grid
              gap-4
              md:grid-cols-2
              lg:grid-cols-4
            "
          >
            <Metric
              label="Total Automations"
              value={
                automations.length
              }
            />

            <Metric
              label="Active Automations"
              value={
                activeAutomations
              }
            />

            <Metric
              label="Post Comments"
              value={
                totalPostComments
              }
            />

            <Metric
              label="Post Likes"
              value={
                totalPostLikes
              }
            />
          </div>

          {/* AUTOMATION TYPES */}

          <div
            className="
              mt-4
              grid
              gap-4
              md:grid-cols-3
            "
          >
            <Metric
              label="Any Comment"
              value={
                anyCommentAutomations
              }
            />

            <Metric
              label="Keyword"
              value={
                keywordAutomations
              }
            />

            <Metric
              label="Inactive"
              value={
                inactiveAutomations
              }
            />
          </div>

          {/* DM TRACKING NOTICE */}

          <div
            className="
              mt-8
              rounded-2xl
              border
              border-yellow-500/20
              bg-yellow-500/[0.05]
              p-5
            "
          >
            <p className="font-semibold text-yellow-400">
              DM analytics
            </p>

            <p className="mt-2 text-sm text-gray-400">
              Your current
              <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-white/70">
                instagram_automations
              </code>
              table stores the DM message but
              does not currently store the number
              of DMs sent.
            </p>

            <p className="mt-2 text-sm text-gray-500">
              DM count tracking should be added
              separately when we implement the
              webhook event logging.
            </p>
          </div>

          {/* AUTOMATION PERFORMANCE */}

          <div
            className="
              mt-8
              rounded-2xl
              border
              border-white/10
              bg-white/[0.04]
              p-6
            "
          >
            <div>
              <h2 className="font-semibold">
                Automation Performance
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Automations connected to your
                Instagram posts.
              </p>
            </div>

            {automations.length ===
            0 ? (
              <div
                className="
                  mt-6
                  rounded-xl
                  border
                  border-white/5
                  p-5 sm:p-8
                  text-center
                  text-gray-500
                "
              >
                No automations created yet.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {automations.map(
                  (automation) => {
                    const post =
                      posts.find(
                        (item) =>
                          item.instagram_media_id ===
                          automation.instagram_post_id
                      );

                    return (
                      <div
                        key={
                          automation.id
                        }
                        className="
                          rounded-xl
                          border
                          border-white/5
                          bg-white/[0.02]
                          p-4
                        "
                      >
                        <div
                          className="
                            flex
                            items-start
                            justify-between
                            gap-4
                          "
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold">
                                {automation.trigger_type ===
                                "keyword"
                                  ? "Keyword → DM"
                                  : "Any Comment → DM"}
                              </span>

                              <span
                                className={
                                  automation.is_active
                                    ? `
                                      rounded-full
                                      bg-green-500/10
                                      px-2.5
                                      py-1
                                      text-xs
                                      text-green-400
                                    `
                                    : `
                                      rounded-full
                                      bg-white/10
                                      px-2.5
                                      py-1
                                      text-xs
                                      text-gray-500
                                    `
                                }
                              >
                                {automation.is_active
                                  ? "Active"
                                  : "Inactive"}
                              </span>
                            </div>

                            <p className="mt-2 truncate text-sm text-gray-500">
                              {post?.caption ||
                                "Instagram post"}
                            </p>

                            <p className="mt-2 text-xs text-gray-600">
                              Media ID:{" "}
                              {
                                automation.instagram_post_id
                              }
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-sm text-gray-400">
                              {post?.comments_count ??
                                0}{" "}
                              comments
                            </p>

                            <p className="mt-1 text-sm text-gray-500">
                              {post?.likes_count ??
                                0}{" "}
                              likes
                            </p>
                          </div>
                        </div>

                        {/* KEYWORDS */}

                        {automation.trigger_type ===
                          "keyword" &&
                          automation.trigger_keywords &&
                          automation.trigger_keywords.length >
                            0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {automation.trigger_keywords.map(
                                (
                                  keyword
                                ) => (
                                  <span
                                    key={
                                      keyword
                                    }
                                    className="
                                      rounded-lg
                                      bg-blue-500/10
                                      px-2.5
                                      py-1
                                      text-xs
                                      text-blue-400
                                    "
                                  >
                                    {keyword}
                                  </span>
                                )
                              )}
                            </div>
                          )}

                        {/* DM */}

                        {automation.dm_message && (
                          <div className="mt-3 rounded-lg bg-white/[0.03] p-3">
                            <p className="text-xs text-gray-600">
                              DM message
                            </p>

                            <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                              {
                                automation.dm_message
                              }
                            </p>
                          </div>
                        )}

                        {/* PUBLIC REPLY */}

                        {automation.reply_enabled &&
                          automation.reply_text && (
                            <div className="mt-3 rounded-lg bg-white/[0.03] p-3">
                              <p className="text-xs text-gray-600">
                                Public reply
                              </p>

                              <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                                {
                                  automation.reply_text
                                }
                              </p>
                            </div>
                          )}
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Metric Card
 */
function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      className="
        rounded-2xl
        border
        border-white/10
        bg-[#0d0d0d]
        p-5
      "
    >
      <p className="text-sm text-gray-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold">
        {value.toLocaleString(
          "en-IN"
        )}
      </p>
    </div>
  );
}