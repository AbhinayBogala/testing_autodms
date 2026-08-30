import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import AutomationLiveUpdates from "./AutomationLiveUpdates";
import DeleteAutomationButton from "./DeleteAutomationButton";
import DuplicateAutomationButton from "./DuplicateAutomationButton";

export const dynamic = "force-dynamic";

/* ============================================================
   TYPES
============================================================ */

type ScheduledAutomationPost = {
  id: string;
  automation_id: string | null;
  scheduled_at: string;
  status: string | null;
  instagram_media_id: string | null;
};

type Automation = {
  id: string;

  name?: string | null;

  instagram_account_id?: string | null;

  instagram_post_id: string | null;

  trigger_type: string | null;

  trigger_keyword?: string | null;

  trigger_keywords?: string[] | null;

  dm_message: string | null;

  is_active: boolean;

  created_at: string;

  updated_at?: string | null;

  button_name?: string | null;

  button_url?: string | null;

  reply_enabled?: boolean | null;

  reply_text?: string | null;

  post?: {
    id?: string;
    caption: string | null;
    media_url: string | null;
    media_type: string | null;
  } | null;
};

/* ============================================================
   DELETE AUTOMATION
============================================================ */

async function deleteAutomation(
  formData: FormData
) {
  "use server";

  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const automationId =
    String(
      formData.get(
        "automation_id"
      ) ?? ""
    );

  if (!automationId) {
    return;
  }

  const {
    error,
  } = await supabase
    .from(
      "instagram_automations"
    )
    .delete()
    .eq(
      "id",
      automationId
    )
    .eq(
      "user_id",
      user.id
    );

  if (error) {
    console.error(
      "DELETE AUTOMATION ERROR:",
      error
    );
  }
}

/* ============================================================
   AUTOMATION NAME
============================================================ */

function getAutomationName(
  automation: Automation
) {
  if (
    automation.name &&
    automation.name.trim()
  ) {
    return automation.name.trim();
  }

  const triggerType =
    automation.trigger_type
      ?.trim()
      .toLowerCase();

  if (
    triggerType ===
    "any_comment"
  ) {
    return "Any Comment → DM";
  }

  if (
    triggerType ===
      "keyword" ||
    triggerType ===
      "keywords"
  ) {
    const keywords =
      Array.isArray(
        automation.trigger_keywords
      )
        ? automation.trigger_keywords
            .map((keyword) =>
              String(
                keyword
              ).trim()
            )
            .filter(Boolean)
        : automation.trigger_keyword
          ? [
              automation.trigger_keyword.trim(),
            ]
          : [];

    if (
      keywords.length > 0
    ) {
      return `Keyword: ${keywords.join(
        ", "
      )}`;
    }

    return "Keyword → DM";
  }

  if (triggerType) {
    return triggerType
      .replace(
        /_/g,
        " "
      )
      .replace(
        /\b\w/g,
        (char) =>
          char.toUpperCase()
      );
  }

  return "Automation";
}

/* ============================================================
   TRIGGER LABEL
============================================================ */

function getTriggerLabel(
  automation: Automation
) {
  const triggerType =
    automation.trigger_type
      ?.trim()
      .toLowerCase();

  if (
    triggerType ===
    "any_comment"
  ) {
    return "Any Comment";
  }

  if (
    triggerType ===
      "keyword" ||
    triggerType ===
      "keywords"
  ) {
    return "Keyword";
  }

  if (!triggerType) {
    return "Comment";
  }

  return triggerType
    .replace(
      /_/g,
      " "
    )
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

/* ============================================================
   PAGE
============================================================ */

export default async function AutomationsPage() {
  const supabase =
    await createClient();

  /* ==========================================================
     AUTH
  ========================================================== */

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
        Authentication required
      </main>
    );
  }

  /* ==========================================================
     LOAD AUTOMATIONS
  ========================================================== */

  const {
    data: automationData,
    error: automationError,
  } = await supabase
    .from(
      "instagram_automations"
    )
    .select(
      `
        id,
        name,
        instagram_account_id,
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
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (automationError) {
    console.error(
      "AUTOMATIONS PAGE LOAD ERROR:",
      automationError
    );
  }

  const automations =
    automationData ?? [];

  /* ==========================================================
     LOAD POSTS
  ========================================================== */

  /*
   * Only use non-null Instagram post IDs.
   *
   * Scheduler-created automations intentionally have:
   *
   * instagram_post_id = NULL
   *
   * until the scheduled post is actually published.
   */

  const ids =
    automations
      .map(
        (item) =>
          item.instagram_post_id
      )
      .filter(
        (
          id
        ): id is string =>
          Boolean(id)
      );

  const uuidIds = ids.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  );

  const instagramMediaIds = ids.filter(
    (id) => !uuidIds.includes(id)
  );

  /*
   * IMPORTANT:
   *
   * instagram_automations.instagram_post_id can contain either
   * an instagram_posts UUID or an external Instagram media ID.
   *
   * Do not send an external Instagram media ID to the UUID
   * column instagram_posts.id. That causes PostgreSQL 22P02.
   */

  let postData: Array<{
    id: string;
    instagram_media_id?: string | null;
    caption: string | null;
    media_url: string | null;
    media_type: string | null;
  }> = [];

  let postError: {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  } | null = null;

  if (uuidIds.length > 0) {
    const {
      data,
      error,
    } = await supabase
      .from("instagram_posts")
      .select(
        `
          id,
          instagram_media_id,
          caption,
          media_url,
          media_type
        `
      )
      .in(
        "id",
        uuidIds
      );

    if (error) {
      postError = error;
    } else if (data) {
      postData.push(...data);
    }
  }

  if (
    !postError &&
    instagramMediaIds.length > 0
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("instagram_posts")
      .select(
        `
          id,
          instagram_media_id,
          caption,
          media_url,
          media_type
        `
      )
      .in(
        "instagram_media_id",
        instagramMediaIds
      );

    if (error) {
      postError = error;
    } else if (data) {
      postData.push(...data);
    }
  }

  if (postError) {
    console.error(
      "AUTOMATIONS POSTS LOAD ERROR:",
      postError
    );
  }

  const posts =
    postData ?? [];

  /* ==========================================================
     LOAD SCHEDULED AUTOMATION POSTS
  ========================================================== */

  /*
   * A scheduler-created automation has no Instagram post ID
   * until Instagram actually publishes the scheduled post.
   *
   * Therefore the Automation page must use scheduled_posts to
   * distinguish:
   *
   *   scheduled + not published -> SCHEDULED
   *   published/linked           -> ON
   *   no scheduled post          -> normal ON/OFF state
   */

  const automationIds = automations.map(
    (automation) => automation.id,
  );

  const {
    data: scheduledAutomationPostsData,
    error: scheduledAutomationPostsError,
  } =
    automationIds.length > 0
      ? await supabase
          .from("scheduled_posts")
          .select(
            `
              id,
              automation_id,
              scheduled_at,
              status,
              instagram_media_id
            `,
          )
          .eq(
            "user_id",
            user.id,
          )
          .in(
            "automation_id",
            automationIds,
          )
      : {
          data: [] as ScheduledAutomationPost[],
          error: null,
        };

  if (scheduledAutomationPostsError) {
    console.error(
      "AUTOMATIONS SCHEDULED POSTS LOAD ERROR:",
      scheduledAutomationPostsError,
    );
  }

  const scheduledAutomationPosts =
    (scheduledAutomationPostsData ??
      []) as ScheduledAutomationPost[];

  /* ==========================================================
     BUILD LIST
  ========================================================== */

  /*
   * ==========================================================
   * BUILD LIST
   * ==========================================================
   *
   * IMPORTANT:
   *
   * instagram_automations.instagram_post_id is TEXT in the
   * current database. It may contain either:
   *
   * 1. instagram_posts.id (Supabase UUID), or
   * 2. Instagram's external media ID.
   *
   * Scheduled automations are special:
   *
   * - Before publishing:
   *     scheduled_posts.automation_id -> automation.id
   *     status = "scheduled"
   *
   * - After publishing:
   *     scheduled_posts.automation_id -> automation.id
   *     instagram_media_id = Instagram media ID
   *
   * The Automation page must therefore resolve the published
   * scheduled post by its Instagram media ID as a fallback.
   */

  const list: Automation[] =
    automations.map(
      (item) => {
        const scheduledPost =
          scheduledAutomationPosts.find(
            (post) =>
              post.automation_id ===
              item.id
          );

        /*
         * First try the normal UUID relationship.
         */
        let post =
          item.instagram_post_id
            ? posts.find(
                (candidate) =>
                  candidate.id ===
                  item.instagram_post_id
              ) ?? null
            : null;

        /*
         * If the automation was created from Scheduler and
         * instagram_post_id contains an Instagram media ID,
         * resolve it using instagram_posts.instagram_media_id.
         */
        if (
          !post &&
          item.instagram_post_id
        ) {
          post =
            posts.find(
              (candidate) =>
                candidate.instagram_media_id ===
                item.instagram_post_id
            ) ?? null;
        }

        /*
         * Final scheduled-post fallback.
         *
         * This handles the permanent scheduler relationship:
         *
         * scheduled_posts.automation_id
         *        +
         * scheduled_posts.instagram_media_id
         *
         * After publishing, the scheduler has the Instagram
         * media ID even if an older automation row still stores
         * that media ID in instagram_post_id.
         */
        if (
          !post &&
          scheduledPost?.instagram_media_id
        ) {
          post =
            posts.find(
              (candidate) =>
                candidate.instagram_media_id ===
                scheduledPost.instagram_media_id
            ) ?? null;
        }

        return {
          ...item,
          post,
        };
      }
    );

  /* ==========================================================
     STATS
  ========================================================== */

  const active =
    list.filter(
      (item) =>
        item.is_active
    ).length;

  const inactive =
    list.length -
    active;

  /* ==========================================================
     PAGE
  ========================================================== */

  return (
    <main className="min-h-screen bg-[#050505] text-white">

      <AutomationLiveUpdates />

      {/* ====================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-white/[0.06] bg-[#070707]">

        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-7">

          <div>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 transition-colors hover:text-white"
            >
              <span className="text-base">
                ←
              </span>

              Dashboard
            </Link>

            <div className="mt-4 flex items-center gap-2">

              <span className="h-1.5 w-1.5 rounded-full bg-[#ff1744]" />

              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-600">
                DevilX / Automation Engine
              </p>

            </div>

            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
              Automations
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Manage Instagram comment-to-DM automations.
            </p>

          </div>

          {/* NEW AUTOMATION */}

          <Link
            href="/dashboard/automations/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff1744] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#ff1744]/10 transition-colors hover:bg-[#e9143d]"
          >
            <span className="text-lg leading-none">
              +
            </span>

            New Automation
          </Link>

        </div>
      </header>

      {/* ====================================================
          CONTENT
      ==================================================== */}

      <div className="mx-auto max-w-7xl px-8 py-9">

        {/* ==================================================
            STATS
        ================================================== */}

        <div className="grid gap-4 sm:grid-cols-3">

          <Stat
            title="Total Automations"
            value={String(
              list.length
            )}
            accent="default"
          />

          <Stat
            title="Active"
            value={String(
              active
            )}
            accent="green"
          />

          <Stat
            title="Inactive"
            value={String(
              inactive
            )}
            accent="muted"
          />

        </div>

        {/* ==================================================
            AUTOMATION LIST
        ================================================== */}

        <div className="mt-8">

          <div className="mb-4 flex items-center justify-between">

            <div>

              <div className="flex items-center gap-2">

                <span className="h-1 w-1 rounded-full bg-[#ff1744]" />

                <h2 className="text-lg font-semibold">
                  Your Automations
                </h2>

              </div>

              <p className="mt-1 text-xs text-gray-600">
                Comment triggers and automatic DM responses.
              </p>

            </div>

            <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 text-[10px] font-medium text-gray-500">
              {list.length} total
            </span>

          </div>

          <div className="space-y-3">

            {/* ==================================================
                EMPTY STATE
            ================================================== */}

            {list.length === 0 ? (

              <div className="rounded-[24px] border border-white/[0.07] bg-[#0b0b0b] px-6 py-16 text-center">

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#ff1744]/10 bg-[#ff1744]/[0.05] text-xl text-[#ff1744]">
                  ⚡
                </div>

                <h3 className="mt-5 text-lg font-semibold">
                  No automations yet
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-600">
                  Create your first comment-to-DM automation to start automatically responding to Instagram comments.
                </p>

                <Link
                  href="/dashboard/automations/new"
                  className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#ff1744] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#e9143d]"
                >
                  <span className="text-lg">
                    +
                  </span>

                  Create Automation
                </Link>

              </div>

            ) : (

              /* ==================================================
                 AUTOMATION CARDS
              ================================================== */

              list.map(
                (
                  automation
                ) => {

                  const automationName =
                    getAutomationName(
                      automation
                    );

                  const triggerLabel =
                    getTriggerLabel(
                      automation
                    );

                  /*
                   * Scheduled automation:
                   * - belongs to a scheduled post
                   * - scheduled post is still scheduled
                   * - Instagram has not returned a media ID yet
                   */
                  const scheduledPost =
                    scheduledAutomationPosts.find(
                      (post) =>
                        post.automation_id ===
                          automation.id &&
                        post.status ===
                          "scheduled" &&
                        !post.instagram_media_id,
                    );

                  const isScheduledAutomation =
                    Boolean(scheduledPost);

                  return (
                    <div
                      key={
                        automation.id
                      }
                      className="group rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-5 transition-colors duration-200 hover:border-white/[0.12] hover:bg-[#0d0d0d]"
                    >

                      <div className="flex flex-col gap-5 xl:flex-row xl:items-center">

                        {/* ======================================
                            POST PREVIEW
                        ====================================== */}

                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-black">

                          {automation.post?.media_url ? (

                            automation.post.media_type?.toUpperCase() ===
                            "VIDEO" ? (

                              <video
                                src={
                                  automation
                                    .post
                                    .media_url
                                }
                                className="h-full w-full object-cover"
                                muted
                                playsInline
                              />

                            ) : (

                              <img
                                src={
                                  automation
                                    .post
                                    .media_url
                                }
                                className="h-full w-full object-cover"
                                alt={
                                  automationName
                                }
                              />

                            )

                          ) : (

                            <div className="flex h-full items-center justify-center text-gray-600">
                              ⚡
                            </div>

                          )}

                        </div>

                        {/* ======================================
                            AUTOMATION INFO
                        ====================================== */}

                        <div className="min-w-0 flex-1">

                          <div className="flex flex-wrap items-center gap-3">

                            <div className="flex min-w-0 items-center gap-2">

                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#ff1744]/[0.06] text-xs text-[#ff1744]">
                                ⚡
                              </span>

                              <h2 className="truncate font-semibold text-white">
                                {automationName}
                              </h2>

                            </div>

                            {/* STATUS */}

                            <span
                              className={
                                isScheduledAutomation
                                  ? "rounded-full border border-[#ff1744]/10 bg-[#ff1744]/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#ff6b86]"
                                  : automation.is_active
                                    ? "rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400"
                                    : "rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600"
                              }
                            >

                              <span className="mr-1.5">
                                ●
                              </span>

                              {isScheduledAutomation
                                ? "SCHEDULED"
                                : automation.is_active
                                  ? "ON"
                                  : "OFF"}

                            </span>

                          </div>

                          {/* TRIGGER */}

                          <div className="mt-3 flex flex-wrap items-center gap-2">

                            <span className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[9px] uppercase tracking-wider text-gray-600">
                              Trigger
                            </span>

                            <span className="text-xs text-gray-400">
                              {triggerLabel}
                            </span>

                            {automation.trigger_type ===
                              "keyword" &&
                              automation.trigger_keywords &&
                              automation.trigger_keywords.length >
                                0 && (
                                <span className="truncate text-xs text-gray-600">
                                  •{" "}
                                  {automation.trigger_keywords.join(
                                    ", "
                                  )}
                                </span>
                              )}

                          </div>

                          {/* CAPTION */}

                          <p className="mt-3 line-clamp-2 text-sm leading-5 text-gray-500">
                            {automation.post?.caption ||
                              "No Instagram post is connected yet."}
                          </p>

                          {/* DM */}

                          <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">

                            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-gray-700">
                              Automatic DM
                            </p>

                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">
                              {automation.dm_message ||
                                "No DM message configured."}
                            </p>

                          </div>

                          {/* REPLY */}

                          {automation.reply_enabled &&
                            automation.reply_text && (
                              <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">

                                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-gray-700">
                                  Public Reply
                                </p>

                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">
                                  {
                                    automation.reply_text
                                  }
                                </p>

                              </div>
                            )}

                          {/* BUTTON */}

                          {automation.button_name &&
                            automation.button_url && (

                              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#ff1744]/10 bg-[#ff1744]/[0.04] px-3 py-1.5 text-[10px] font-medium text-[#ff6b86]">

                                <span>
                                  ↗
                                </span>

                                Button:{" "}
                                {
                                  automation.button_name
                                }

                              </div>

                            )}

                        </div>

                        {/* ======================================
                            ACTIONS
                        ====================================== */}

                        <div className="flex shrink-0 items-center gap-2 xl:flex-col">

                          {/* EDIT */}

                          <Link
                            href={`/dashboard/automations/${automation.id}/edit`}
                            className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-xs font-medium text-gray-400 transition-colors hover:border-white/[0.15] hover:bg-white/[0.05] hover:text-white"
                          >
                            Edit
                          </Link>

                          {/* DUPLICATE */}

                          <DuplicateAutomationButton
                            automationId={
                              automation.id
                            }
                          />

                          {/* DELETE */}

                          <form
                            action={
                              deleteAutomation
                            }
                          >
                            <input
                              type="hidden"
                              name="automation_id"
                              value={
                                automation.id
                              }
                            />

                            <DeleteAutomationButton />
                          </form>

                        </div>

                      </div>

                    </div>
                  );
                }
              )

            )}

          </div>
        </div>
      </div>
    </main>
  );
}

/* ============================================================
   STAT
============================================================ */

function Stat({
  title,
  value,
  accent = "default",
}: {
  title: string;
  value: string;
  accent?:
    | "default"
    | "green"
    | "muted";
}) {
  const valueClass =
    accent === "green"
      ? "text-emerald-400"
      : accent === "muted"
        ? "text-gray-400"
        : "text-white";

  return (
    <div className="rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] p-6">

      <div className="flex items-center justify-between">

        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          {title}
        </p>

        <span
          className={
            accent === "green"
              ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
              : "h-1.5 w-1.5 rounded-full bg-[#ff1744]"
          }
        />

      </div>

      <p
        className={`mt-5 text-3xl font-bold tracking-[-0.04em] ${valueClass}`}
      >
        {value}
      </p>

      <div className="mt-5 h-px bg-white/[0.05]" />

      <p className="mt-3 text-[9px] uppercase tracking-[0.14em] text-gray-700">
        DevilX Automation Engine
      </p>

    </div>
  );
}