import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ============================================================
 * GET CONNECTED INSTAGRAM ACCOUNT
 * ============================================================
 */

async function getAccount(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("instagram_accounts")
    .select(
      `
      id,
      username,
      instagram_user_id,
      is_connected,
      connected_at
      `
    )
    .eq("user_id", userId)
    .eq("is_connected", true)
    .order("connected_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * ============================================================
 * GET
 *
 * Load one automation.
 * ============================================================
 */

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const account = await getAccount(user.id);

    if (!account) {
      return NextResponse.json(
        {
          error: "Instagram account not found",
        },
        {
          status: 404,
        }
      );
    }

    const admin = createAdminClient();

    const {
      data: automation,
      error,
    } = await admin
      .from("instagram_automations")
      .select(
        `
        id,
        name,
        user_id,
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
        reply_text,
        reply_texts,
        followup_enabled,
        followup_delay_minutes,
        followup_message
        `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("instagram_account_id", account.id)
      .maybeSingle();

    if (error) {
      console.error(
        "INSTAGRAM AUTOMATION GET DATABASE ERROR:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!automation) {
      return NextResponse.json(
        {
          error: "Automation not found",
        },
        {
          status: 404,
        }
      );
    }

    /**
     * ========================================================
     * FIND INSTAGRAM POST
     * ========================================================
     *
     * instagram_automations.instagram_post_id should contain
     * the Supabase instagram_posts.id UUID.
     *
     * Older rows may contain instagram_media_id, so we also
     * support that as a fallback.
     */

    let post = null;

    const {
      data: postById,
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
      .eq(
        "id",
        automation.instagram_post_id
      )
      .maybeSingle();

    post = postById;

    /*
     * Backwards compatibility:
     * Try Instagram media ID.
     */

    if (
      !post &&
      automation.instagram_post_id
    ) {
      const {
        data: postByMediaId,
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
        .eq(
          "instagram_media_id",
          automation.instagram_post_id
        )
        .maybeSingle();

      post = postByMediaId;
    }

    return NextResponse.json({
      data: {
        ...automation,

        post: post ?? null,

        postIds: post
          ? [post.id]
          : automation.instagram_post_id
            ? [automation.instagram_post_id]
            : [],

        keywords:
          automation.trigger_keywords ??
          (
            automation.trigger_keyword
              ? [automation.trigger_keyword]
              : []
          ),
      },

      account,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM AUTOMATION GET ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load automation",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * ============================================================
 * POST
 *
 * DUPLICATE AUTOMATION
 *
 * Normal:
 *
 * Course Launch
 *      ↓
 * Course Launch (Copy)
 *
 * Scheduler:
 *
 * Course Launch
 *      ↓
 * Course Launch — Scheduled Aug 30, 2026
 *
 * The original automation is NEVER modified.
 * ============================================================
 */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Automation ID is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    let body: {
      source?: string;
      schedulerMode?: boolean;
      scheduledDate?: string | null;
      scheduledPostId?: string | null;
      instagramPostId?: string | null;
      scheduledMediaUrl?: string | null;
      scheduledMediaType?: string | null;
      postIds?: unknown;
    } = {};

    try {
      const parsed = await request.json();

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        body = parsed;
      }
    } catch {
      body = {};
    }

    const source =
      typeof body.source === "string"
        ? body.source.trim().toLowerCase()
        : "";

    const isSchedulerDuplicate =
      source === "scheduler" ||
      body.schedulerMode === true;

    const admin = createAdminClient();

    /*
     * ----------------------------------------------------------
     * Find the currently connected Instagram account.
     * ----------------------------------------------------------
     */
    const account = await getAccount(user.id);

    if (!account) {
      return NextResponse.json(
        { error: "Instagram account not found" },
        { status: 404 },
      );
    }

    /*
     * ----------------------------------------------------------
     * Find the original automation.
     *
     * We intentionally verify user ownership first, then verify
     * the account below. This prevents an automation from another
     * Instagram account from being treated as valid.
     * ----------------------------------------------------------
     */
    const {
      data: originalAutomation,
      error: findError,
    } = await admin
      .from("instagram_automations")
      .select(
        `
        id,
        user_id,
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
        reply_text,
        reply_texts,
        followup_enabled,
        followup_delay_minutes,
        followup_message
        `,
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findError) {
      console.error(
        "INSTAGRAM AUTOMATION DUPLICATE FIND ERROR:",
        findError,
      );

      return NextResponse.json(
        { error: findError.message },
        { status: 500 },
      );
    }

    if (!originalAutomation) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 },
      );
    }

    /*
     * ----------------------------------------------------------
     * The original automation must belong to the currently
     * connected Instagram account.
     * ----------------------------------------------------------
     */
    if (
      originalAutomation.instagram_account_id !== account.id
    ) {
      return NextResponse.json(
        {
          error:
            "Automation does not belong to the connected Instagram account.",
        },
        { status: 403 },
      );
    }

    /*
     * ----------------------------------------------------------
     * Build the new name.
     * ----------------------------------------------------------
     */
    const originalName =
      typeof originalAutomation.name === "string"
        ? originalAutomation.name.trim()
        : "";

    let duplicateName: string;

    if (isSchedulerDuplicate) {
      let scheduledDateLabel = "Post";

      if (body.scheduledDate) {
        const parsedDate = new Date(body.scheduledDate);

        if (!Number.isNaN(parsedDate.getTime())) {
          scheduledDateLabel =
            parsedDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
        }
      }

      duplicateName = originalName
        ? `${originalName} — Scheduled ${scheduledDateLabel}`
        : `Scheduled ${scheduledDateLabel}`;
    } else {
      duplicateName = originalName
        ? `${originalName} (Copy)`
        : "Automation (Copy)";
    }

    duplicateName = duplicateName
      .trim()
      .slice(0, 100);

    /*
     * ----------------------------------------------------------
     * Determine instagram_post_id.
     *
     * SCHEDULER:
     *     NULL
     *
     * NORMAL DUPLICATE:
     *     Preserve the original post unless postIds was
     *     explicitly supplied.
     * ----------------------------------------------------------
     */
    let instagramPostId: string | null =
      isSchedulerDuplicate
        ? null
        : typeof originalAutomation.instagram_post_id === "string"
          ? originalAutomation.instagram_post_id
          : null;

    /*
     * ----------------------------------------------------------
     * NORMAL DUPLICATION:
     *
     * If postIds was explicitly supplied, validate it and use
     * the first selected post.
     * ----------------------------------------------------------
     */
    if (
      !isSchedulerDuplicate &&
      Array.isArray(body.postIds)
    ) {
      const requestedPostIds = [
        ...new Set(
          body.postIds
            .map((value: unknown) =>
              String(value).trim(),
            )
            .filter(Boolean),
        ),
      ];

      if (requestedPostIds.length === 0) {
        return NextResponse.json(
          {
            error:
              "Select at least one Instagram post.",
          },
          { status: 400 },
        );
      }

      const {
        data: postsById,
        error: postsByIdError,
      } = await admin
        .from("instagram_posts")
        .select(
          `
          id,
          instagram_media_id,
          instagram_account_id
          `,
        )
        .eq(
          "instagram_account_id",
          account.id,
        )
        .in(
          "id",
          requestedPostIds,
        );

      if (postsByIdError) {
        console.error(
          "NORMAL DUPLICATE POST LOOKUP ERROR:",
          postsByIdError,
        );

        return NextResponse.json(
          { error: postsByIdError.message },
          { status: 500 },
        );
      }

      let selectedPosts = postsById ?? [];

      /*
       * Fallback for callers that provide Instagram media IDs.
       */
      if (selectedPosts.length === 0) {
        const {
          data: postsByMediaId,
          error: postsByMediaIdError,
        } = await admin
          .from("instagram_posts")
          .select(
            `
            id,
            instagram_media_id,
            instagram_account_id
            `,
          )
          .eq(
            "instagram_account_id",
            account.id,
          )
          .in(
            "instagram_media_id",
            requestedPostIds,
          );

        if (postsByMediaIdError) {
          return NextResponse.json(
            {
              error:
                postsByMediaIdError.message,
            },
            { status: 500 },
          );
        }

        selectedPosts = postsByMediaId ?? [];
      }

      if (selectedPosts.length === 0) {
        return NextResponse.json(
          {
            error:
              "Selected Instagram post was not found.",
          },
          { status: 400 },
        );
      }

      instagramPostId = selectedPosts[0].id;
    }

    /*
     * ----------------------------------------------------------
     * SCHEDULER:
     *
     * Never attach the old Instagram post to the scheduled
     * automation. The scheduled media belongs to scheduled_posts.
     *
     * Even if an old frontend sends instagramPostId, it is ignored.
     * ----------------------------------------------------------
     */
    if (isSchedulerDuplicate) {
      instagramPostId = null;

      if (body.scheduledDate) {
        const scheduledDate =
          new Date(body.scheduledDate);

        if (
          Number.isNaN(
            scheduledDate.getTime(),
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Invalid scheduled date.",
            },
            { status: 400 },
          );
        }
      }
    }

    /*
     * ----------------------------------------------------------
     * Create duplicate.
     * ----------------------------------------------------------
     */
    const now = new Date().toISOString();

    const duplicateAutomation = {
      user_id: user.id,

      instagram_account_id: account.id,

      instagram_post_id: instagramPostId,

      name: duplicateName,

      trigger_type:
        originalAutomation.trigger_type,

      trigger_keyword:
        originalAutomation.trigger_keyword,

      trigger_keywords:
        originalAutomation.trigger_keywords,

      dm_message:
        originalAutomation.dm_message,

      /*
       * A duplicated automation starts inactive.
       */
      is_active: false,

      button_name:
        originalAutomation.button_name,

      button_url:
        originalAutomation.button_url,

      followup_enabled:
        Boolean(originalAutomation.followup_enabled),

      followup_delay_minutes:
        originalAutomation.followup_delay_minutes ?? 360,

      followup_message:
        originalAutomation.followup_message ?? null,

      reply_enabled:
        originalAutomation.reply_enabled,

      reply_text:
        originalAutomation.reply_text,

      // Preserve the complete public-reply rotation when duplicating.
      reply_texts:
        Array.isArray(originalAutomation.reply_texts) &&
        originalAutomation.reply_texts.length > 0
          ? originalAutomation.reply_texts
          : originalAutomation.reply_text
            ? [originalAutomation.reply_text]
            : [],

      created_at: now,

      updated_at: now,
    };

    console.log(
      "DUPLICATING INSTAGRAM AUTOMATION:",
      {
        originalAutomationId:
          originalAutomation.id,

        accountId:
          account.id,

        source:
          isSchedulerDuplicate
            ? "scheduler"
            : "automation_page",

        originalName,

        duplicateName,

        originalPostId:
          originalAutomation.instagram_post_id,

        newPostId:
          instagramPostId,

        scheduledPostId:
          body.scheduledPostId ?? null,

        scheduledMediaUrl:
          body.scheduledMediaUrl ?? null,

        scheduledMediaType:
          body.scheduledMediaType ?? null,
      },
    );

    const {
      data: duplicated,
      error: duplicateError,
    } = await admin
      .from("instagram_automations")
      .insert(duplicateAutomation)
      .select(
        `
        id,
        user_id,
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
        reply_text,
        reply_texts
        `,
      )
      .single();

    if (
      duplicateError ||
      !duplicated
    ) {
      console.error(
        "INSTAGRAM AUTOMATION DUPLICATE DATABASE ERROR:",
        duplicateError,
      );

      return NextResponse.json(
        {
          error:
            duplicateError?.message ||
            "Failed to duplicate automation.",
        },
        { status: 500 },
      );
    }

    /*
     * ----------------------------------------------------------
     * Safety check:
     *
     * A scheduler automation must NEVER contain an Instagram
     * post ID.
     * ----------------------------------------------------------
     */
    if (
      isSchedulerDuplicate &&
      duplicated.instagram_post_id !== null
    ) {
      console.error(
        "SCHEDULER DUPLICATE HAS UNEXPECTED INSTAGRAM POST ID:",
        {
          automationId: duplicated.id,
          instagramPostId:
            duplicated.instagram_post_id,
        },
      );

      await admin
        .from("instagram_automations")
        .delete()
        .eq("id", duplicated.id)
        .eq("user_id", user.id);

      return NextResponse.json(
        {
          error:
            "Scheduler automation was created with an Instagram post. Creation was rolled back.",
        },
        { status: 500 },
      );
    }

    console.log(
      "INSTAGRAM AUTOMATION DUPLICATED:",
      {
        originalAutomationId:
          originalAutomation.id,

        newAutomationId:
          duplicated.id,

        name:
          duplicated.name,

        accountId:
          duplicated.instagram_account_id,

        instagramPostId:
          duplicated.instagram_post_id,

        source:
          isSchedulerDuplicate
            ? "scheduler"
            : "automation_page",
      },
    );

    /*
     * ----------------------------------------------------------
     * SchedulerClient expects:
     *
     * result.data.id
     *
     * ----------------------------------------------------------
     */
    return NextResponse.json(
      {
        success: true,

        data: duplicated,

        automation: duplicated,

        meta: {
          source:
            isSchedulerDuplicate
              ? "scheduler"
              : "automation_page",

          name:
            duplicated.name,

          scheduledPostId:
            body.scheduledPostId ?? null,

          scheduledMediaUrl:
            body.scheduledMediaUrl ?? null,

          scheduledMediaType:
            body.scheduledMediaType ?? null,

          instagramPostId:
            duplicated.instagram_post_id,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "INSTAGRAM AUTOMATION DUPLICATE EXCEPTION:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to duplicate automation",
      },
      { status: 500 },
    );
  }
}

/**
 * ============================================================
 * PATCH
 *
 * Update an existing automation.
 * ============================================================
 */

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const account = await getAccount(user.id);

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Instagram account not found",
        },
        {
          status: 404,
        }
      );
    }

    const admin = createAdminClient();

    /**
     * ========================================================
     * FIND EXISTING AUTOMATION
     * ========================================================
     */

    const {
      data: existingAutomation,
      error: existingError,
    } = await admin
      .from("instagram_automations")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq(
        "instagram_account_id",
        account.id
      )
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error:
            existingError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!existingAutomation) {
      return NextResponse.json(
        {
          error:
            "Automation not found",
        },
        {
          status: 404,
        }
      );
    }

    const body =
      await request.json();

    /**
     * ========================================================
     * NAME
     * ========================================================
     */

    let automationName =
      typeof existingAutomation.name ===
      "string"
        ? existingAutomation.name.trim()
        : "";

    if ("name" in body) {
      automationName =
        String(
          body.name ?? ""
        ).trim();

      if (!automationName) {
        return NextResponse.json(
          {
            error:
              "Automation name is required.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        automationName.length > 100
      ) {
        return NextResponse.json(
          {
            error:
              "Automation name must be 100 characters or less.",
          },
          {
            status: 400,
          }
        );
      }
    }

    /**
     * ========================================================
     * TRIGGER TYPE
     * ========================================================
     */

    let triggerType =
      existingAutomation.trigger_type ??
      "any_comment";

    if (
      "triggerType" in body ||
      "trigger_type" in body
    ) {
      const value =
        body.triggerType ??
        body.trigger_type;

      triggerType =
        value === "keyword" ||
        value === "keywords"
          ? "keyword"
          : "any_comment";
    }

    /**
     * ========================================================
     * KEYWORDS
     * ========================================================
     */

    let keywords: string[] =
      Array.isArray(
        existingAutomation.trigger_keywords
      )
        ? existingAutomation.trigger_keywords
            .map(
              (value: unknown) =>
                String(value)
            )
            .map(
              (value: string) =>
                value
                  .trim()
                  .toLowerCase()
            )
            .filter(Boolean)
        : [];

    if (
      Array.isArray(
        body?.keywords
      )
    ) {
      keywords =
        Array.from(
          new Set<string>(
            body.keywords
              .map(
                (value: unknown) =>
                  String(value)
              )
              .map(
                (value: string) =>
                  value
                    .trim()
                    .toLowerCase()
              )
              .filter(Boolean)
          )
        );
    }

    if (
      triggerType === "keyword" &&
      keywords.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Keyword automation requires at least one keyword.",
        },
        {
          status: 400,
        }
      );
    }

    /**
     * ========================================================
     * DM
     * ========================================================
     */

    let dmEnabled =
      Boolean(
        existingAutomation.dm_message
      );

    if (
      "dmEnabled" in body ||
      "dm_enabled" in body
    ) {
      dmEnabled =
        Boolean(
          body.dmEnabled ??
          body.dm_enabled
        );
    }

    let dmMessage =
      existingAutomation.dm_message ??
      "";

    if (
      "dmText" in body ||
      "dm_text" in body ||
      "dmMessage" in body
    ) {
      const value =
        body.dmText ??
        body.dm_text ??
        body.dmMessage ??
        "";

      dmMessage = dmEnabled
        ? String(value)
            .trim()
            .slice(0, 2000)
        : "";
    }

    if (
      dmEnabled &&
      !dmMessage
    ) {
      return NextResponse.json(
        {
          error:
            "DM message is required when DM is enabled.",
        },
        {
          status: 400,
        }
      );
    }

    /**
     * ========================================================
     * PUBLIC REPLY
     * ========================================================
     */

    let replyEnabled =
      Boolean(
        existingAutomation.reply_enabled
      );

    if (
      "publicReplyEnabled" in body ||
      "public_reply_enabled" in body ||
      "replyEnabled" in body
    ) {
      replyEnabled =
        Boolean(
          body.publicReplyEnabled ??
          body.public_reply_enabled ??
          body.replyEnabled
        );
    }

    let replyText =
      existingAutomation.reply_text ??
      "";

    let replyTexts: string[] =
      Array.isArray(existingAutomation.reply_texts)
        ? existingAutomation.reply_texts
            .map((value: unknown) => String(value).trim())
            .filter(Boolean)
        : existingAutomation.reply_text?.trim()
          ? [existingAutomation.reply_text.trim()]
          : [];

    if (
      "publicReplyTexts" in body ||
      "replyTexts" in body ||
      "reply_texts" in body
    ) {
      const rawReplyTexts =
        body.publicReplyTexts ??
        body.replyTexts ??
        body.reply_texts;

      replyTexts = Array.isArray(rawReplyTexts)
        ? Array.from(
            new Set(
              rawReplyTexts
                .map((value: unknown) => String(value).trim())
                .filter(Boolean)
                .slice(0, 20),
            ),
          )
        : [];
    }

    if (replyEnabled && replyTexts.length === 0 && replyText) {
      replyTexts = [replyText];
    }

    if (replyEnabled && replyTexts.length > 0) {
      replyText = replyTexts[0];
    }

    if (
      "publicReplyText" in body ||
      "public_reply_text" in body ||
      "replyText" in body
    ) {
      const value =
        body.publicReplyText ??
        body.public_reply_text ??
        body.replyText ??
        "";

      replyText = replyEnabled
        ? String(value)
            .trim()
            .slice(0, 1000)
        : "";
    }

    if (
      replyEnabled &&
      !replyText
    ) {
      return NextResponse.json(
        {
          error:
            "Public reply text is required when public reply is enabled.",
        },
        {
          status: 400,
        }
      );
    }

    /**
     * ========================================================
     * BUTTON
     * ========================================================
     */

    let buttonName =
      existingAutomation.button_name ??
      null;

    if (
      "buttonName" in body ||
      "button_name" in body
    ) {
      const value =
        body.buttonName ??
        body.button_name;

      buttonName = value
        ? String(value)
            .trim()
            .slice(0, 100)
        : null;
    }

    let buttonUrl =
      existingAutomation.button_url ??
      null;

    if (
      "buttonUrl" in body ||
      "button_url" in body
    ) {
      const value =
        body.buttonUrl ??
        body.button_url;

      buttonUrl = value
        ? String(value)
            .trim()
            .slice(0, 2000)
        : null;
    }

    /**
     * ========================================================
     * ACTIVE STATUS
     * ========================================================
     */

    let isActive =
      existingAutomation.is_active !==
      false;

    if (
      "isActive" in body ||
      "is_active" in body
    ) {
      isActive =
        Boolean(
          body.isActive ??
          body.is_active
        );
    }

    /**
     * ========================================================
     * POST
     * ========================================================
     */

    let instagramPostId =
      existingAutomation.instagram_post_id;

    if (
      Array.isArray(
        body?.postIds
      )
    ) {
      const requestedPostIds =
        [
          ...new Set(
            body.postIds
              .map(
                (value: unknown) =>
                  String(value).trim()
              )
              .filter(Boolean)
          ),
        ];

      if (
        requestedPostIds.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "Select at least one Instagram post.",
          },
          {
            status: 400,
          }
        );
      }

      let selectedPosts: Array<{
        id: string;
        instagram_media_id: string;
      }> = [];

      /**
       * First try UUID.
       */

      const {
        data: postsById,
      } = await admin
        .from("instagram_posts")
        .select(
          `
          id,
          instagram_media_id
          `
        )
        .eq(
          "instagram_account_id",
          account.id
        )
        .in(
          "id",
          requestedPostIds
        );

      selectedPosts =
        postsById ?? [];

      /**
       * Then try Instagram media ID.
       */

      if (
        selectedPosts.length === 0
      ) {
        const {
          data: postsByMediaId,
        } = await admin
          .from("instagram_posts")
          .select(
            `
            id,
            instagram_media_id
            `
          )
          .eq(
            "instagram_account_id",
            account.id
          )
          .in(
            "instagram_media_id",
            requestedPostIds
          );

        selectedPosts =
          postsByMediaId ?? [];
      }

      if (
        selectedPosts.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "Selected Instagram post was not found.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * Your current database structure uses one
       * instagram_post_id per automation.
       */

      instagramPostId =
        selectedPosts[0].id;
    }

    /**
     * ========================================================
     * NORMALIZE LEGACY POST ID
     * ========================================================
     */

    if (
      instagramPostId &&
      !Array.isArray(
        body?.postIds
      )
    ) {
      const {
        data: legacyPost,
      } = await admin
        .from("instagram_posts")
        .select("id")
        .eq(
          "instagram_account_id",
          account.id
        )
        .eq(
          "instagram_media_id",
          instagramPostId
        )
        .maybeSingle();

      if (legacyPost?.id) {
        instagramPostId =
          legacyPost.id;
      }
    }

    /**
     * ========================================================
     * UPDATE
     * ========================================================
     */

    const updates = {
      /*
       * NAME
       */
      name:
        automationName,

      /*
       * POST
       */
      instagram_post_id:
        instagramPostId,

      /*
       * TRIGGER
       */
      trigger_type:
        triggerType,

      trigger_keyword:
        keywords.length > 0
          ? keywords[0]
          : "",

      trigger_keywords:
        keywords,

      /*
       * DM
       */
      dm_message:
        dmEnabled
          ? dmMessage
          : "",

      /*
       * STATUS
       */
      is_active:
        isActive,

      /*
       * BUTTON
       */
      button_name:
        buttonName,

      button_url:
        buttonUrl,

      /*
       * PUBLIC REPLY
       */
      reply_enabled:
        replyEnabled,

      reply_text:
        replyEnabled
          ? replyText
          : "",

      reply_texts:
        replyEnabled
          ? replyTexts
          : [],

      /*
       * UPDATED
       */
      updated_at:
        new Date().toISOString(),
    };

    console.log(
      "UPDATING INSTAGRAM AUTOMATION:",
      {
        automationId: id,

        accountId:
          account.id,

        updates,
      }
    );

    const {
      data: updated,
      error: updateError,
    } = await admin
      .from(
        "instagram_automations"
      )
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .eq(
        "instagram_account_id",
        account.id
      )
      .select("*")
      .single();

    if (updateError) {
      console.error(
        "INSTAGRAM AUTOMATION UPDATE ERROR:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            updateError.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      data: updated,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM AUTOMATION PATCH ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update automation",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * ============================================================
 * DELETE
 * ============================================================
 */

export async function DELETE(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } =
      await context.params;

    const supabase =
      await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const account =
      await getAccount(user.id);

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Instagram account not found",
        },
        {
          status: 404,
        }
      );
    }

    const admin =
      createAdminClient();

    /**
     * ========================================================
     * VERIFY AUTOMATION
     * ========================================================
     */

    const {
      data: automation,
      error: findError,
    } = await admin
      .from(
        "instagram_automations"
      )
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq(
        "instagram_account_id",
        account.id
      )
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        {
          error:
            findError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!automation) {
      return NextResponse.json(
        {
          error:
            "Automation not found",
        },
        {
          status: 404,
        }
      );
    }

    /**
     * ========================================================
     * DELETE
     * ========================================================
     */

    const {
      error: deleteError,
    } = await admin
      .from(
        "instagram_automations"
      )
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .eq(
        "instagram_account_id",
        account.id
      );

    if (deleteError) {
      console.error(
        "INSTAGRAM AUTOMATION DELETE ERROR:",
        deleteError
      );

      return NextResponse.json(
        {
          error:
            deleteError.message,
        },
        {
          status: 500,
        }
      );
    }

    console.log(
      "INSTAGRAM AUTOMATION DELETED:",
      {
        automationId: id,
        accountId:
          account.id,
      }
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM AUTOMATION DELETE EXCEPTION:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete automation",
      },
      {
        status: 500,
      }
    );
  }
}