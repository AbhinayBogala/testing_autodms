import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ============================================================
 * GET CONNECTED INSTAGRAM ACCOUNT
 * ============================================================
 */
async function getAccount(
  userId: string,
  requestedAccountId?: string,
) {
  const supabase = await createClient();

  let query = supabase
    .from("instagram_accounts")
    .select(
      `
      id,
      username,
      is_connected,
      instagram_user_id,
      connected_at
      `,
    )
    .eq("user_id", userId)
    .eq("is_connected", true);

  if (requestedAccountId) {
    query = query.eq("id", requestedAccountId);
  } else {
    query = query
      .order("connected_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * ============================================================
 * GET
 * ============================================================
 */
export async function GET() {
  try {
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
        },
      );
    }

    const account = await getAccount(user.id);

    if (!account) {
      return NextResponse.json({
        data: [],
        account: null,
        connected: false,
      });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
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
        reply_text
        `,
      )
      .eq("user_id", user.id)
      .eq("instagram_account_id", account.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "INSTAGRAM AUTOMATIONS GET DATABASE ERROR:",
        error,
      );

      return NextResponse.json(
        {
          error: error.message,
          connected: true,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      data: data ?? [],
      account,
      connected: true,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM AUTOMATIONS GET ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load automations.",
      },
      {
        status: 500,
      },
    );
  }
}

/**
 * ============================================================
 * POST
 * ============================================================
 *
 * Creates an automation.
 *
 * NORMAL:
 * - Instagram post is mandatory.
 * - One automation per selected post.
 *
 * SCHEDULER:
 * - Instagram post is NOT mandatory.
 * - Creates one automation.
 * - instagram_post_id = null.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const supabase = await createClient();

    /**
     * ========================================================
     * AUTH
     * ========================================================
     */

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
        },
      );
    }

    /**
     * ========================================================
     * REQUEST BODY
     * ========================================================
     */

    const body = await request.json();

    /**
     * Scheduler sends the exact Instagram account selected
     * in the Scheduler UI. Normal automation creation can
     * continue using the latest connected account when this
     * value is not supplied.
     */
    const requestedAccountId =
      typeof body?.instagramAccountId === "string"
        ? body.instagramAccountId.trim()
        : undefined;

    /**
     * ========================================================
     * ACCOUNT
     * ========================================================
     */

    const account = await getAccount(
      user.id,
      requestedAccountId,
    );

    if (!account) {
      return NextResponse.json(
        {
          error: requestedAccountId
            ? "Selected Instagram account was not found or is not connected."
            : "Connect Instagram first.",
        },
        {
          status: 400,
        },
      );
    }

    if (!account.is_connected) {
      return NextResponse.json(
        {
          error:
            "Instagram is not connected. Reconnect Instagram first.",
          reconnectRequired: true,
        },
        {
          status: 400,
        },
      );
    }

    /**
     * ========================================================
     * SOURCE
     * ========================================================
     */

    const source =
      typeof body?.source === "string"
        ? body.source
            .trim()
            .toLowerCase()
        : "";

    /*
     * Scheduler automation detection.
     *
     * The Scheduler may identify the request using either:
     *   - source: "scheduler"
     *   - schedulerMode: true
     *   - scheduledPostId
     *
     * scheduledPostId is included as a defensive fallback so an
     * older SchedulerClient cannot accidentally be treated as a
     * normal automation request.
     */
    const isSchedulerAutomation =
      source === "scheduler" ||
      body?.schedulerMode === true ||
      typeof body?.scheduledPostId === "string";

    /**
     * ========================================================
     * NAME
     * ========================================================
     */

    const name = String(
      body?.name ??
        "New Instagram automation",
    )
      .trim()
      .slice(0, 100);

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Automation name is required.",
        },
        {
          status: 400,
        },
      );
    }

    /**
     * ========================================================
     * TRIGGER TYPE
     * ========================================================
     */

    const triggerType =
      body?.triggerType === "keywords" ||
      body?.triggerType === "keyword"
        ? "keyword"
        : "any_comment";

    /**
     * ========================================================
     * POST IDS
     * ========================================================
     */

    const rawPostIds = Array.isArray(
      body?.postIds,
    )
      ? body.postIds
      : [];

    const postIds = [
      ...new Set(
        rawPostIds
          .map((value: unknown) =>
            String(value).trim(),
          )
          .filter(Boolean),
      ),
    ];

    /**
     * ========================================================
     * KEYWORDS
     * ========================================================
     */

    const rawKeywords =
      Array.isArray(body?.triggerKeywords)
        ? body.triggerKeywords
        : Array.isArray(body?.keywords)
          ? body.keywords
          : typeof body?.triggerKeyword === "string"
            ? [body.triggerKeyword]
            : [];

    const keywords: string[] =
      Array.from(
        new Set<string>(
          rawKeywords
            .map(
              (value: unknown) =>
                String(value),
            )
            .map(
              (value: string) =>
                value.trim().toLowerCase(),
            )
            .filter(
              (value: string) =>
                Boolean(value),
            ),
        ),
      );

    /**
     * ========================================================
     * KEYWORD VALIDATION
     * ========================================================
     */

    if (
      triggerType === "keyword" &&
      keywords.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Add at least one keyword or choose Any comment.",
        },
        {
          status: 400,
        },
      );
    }

    /**
     * ========================================================
     * POST VALIDATION
     * ========================================================
     *
     * This is the important Scheduler fix.
     *
     * Normal automation:
     *   post required.
     *
     * Scheduler automation:
     *   post NOT required.
     */
    if (
      postIds.length === 0 &&
      !isSchedulerAutomation
    ) {
      return NextResponse.json(
        {
          error:
            "Select at least one Instagram post.",
          code: "INSTAGRAM_POST_REQUIRED",
          schedulerAutomation: false,
        },
        {
          status: 400,
        },
      );
    }

    const admin = createAdminClient();

    /**
     * ========================================================
     * VERIFY POSTS
     * ========================================================
     *
     * Scheduler automations skip this because the Instagram
     * post does not exist yet.
     */

    let validPosts: Array<{
      id: string;
      instagram_media_id: string;
      instagram_account_id: string;
    }> = [];

    if (postIds.length > 0) {
      /**
       * First try database UUIDs.
       */

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
        .in("id", postIds);

      if (postsByIdError) {
        console.error(
          "INSTAGRAM POSTS UUID VALIDATION ERROR:",
          postsByIdError,
        );

        return NextResponse.json(
          {
            error:
              postsByIdError.message,
          },
          {
            status: 500,
          },
        );
      }

      validPosts =
        postsById ?? [];

      /**
       * If UUID lookup didn't find anything,
       * try Instagram media IDs.
       */

      if (validPosts.length === 0) {
        const {
          data: postsByMediaId,
          error:
            postsByMediaError,
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
            postIds,
          );

        if (postsByMediaError) {
          console.error(
            "INSTAGRAM POSTS MEDIA ID VALIDATION ERROR:",
            postsByMediaError,
          );

          return NextResponse.json(
            {
              error:
                postsByMediaError.message,
            },
            {
              status: 500,
            },
          );
        }

        validPosts =
          postsByMediaId ?? [];
      }

      /**
       * No valid posts.
       */

      if (validPosts.length === 0) {
        return NextResponse.json(
          {
            error:
              "No valid Instagram posts were found for this Instagram account.",
            postIds,
          },
          {
            status: 400,
          },
        );
      }

      /**
       * Make sure every post belongs to the account.
       */

      if (
        validPosts.length !==
        postIds.length
      ) {
        return NextResponse.json(
          {
            error:
              "One or more selected posts do not belong to the connected Instagram account.",

            requestedPostIds:
              postIds,

            foundPosts:
              validPosts.map(
                (post) => ({
                  id: post.id,

                  instagram_media_id:
                    post.instagram_media_id,
                }),
              ),
          },
          {
            status: 400,
          },
        );
      }
    }

    /**
     * ========================================================
     * DM SETTINGS
     * ========================================================
     */

    const dmMessage = String(
      body?.dmMessage ??
        body?.dmText ??
        "",
    )
      .trim()
      .slice(0, 2000);

    const dmEnabled =
      Boolean(body?.dmEnabled) ||
      Boolean(dmMessage);

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
        },
      );
    }

    /**
     * ========================================================
     * PUBLIC REPLY
     * ========================================================
     */

    const replyEnabled =
      Boolean(
        body?.publicReplyEnabled ??
          body?.replyEnabled,
      );

    const replyText =
      replyEnabled
        ? String(
            body?.publicReplyText ??
              body?.replyText ??
              "",
          )
            .trim()
            .slice(0, 1000)
        : "";

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
        },
      );
    }

    /**
     * ========================================================
     * BUTTON
     * ========================================================
     */

    const buttonName =
      body?.buttonName
        ? String(
            body.buttonName,
          )
            .trim()
            .slice(0, 100)
        : null;

    const buttonUrl =
      body?.buttonUrl
        ? String(
            body.buttonUrl,
          )
            .trim()
            .slice(0, 2000)
        : null;

    /**
     * ========================================================
     * CREATE AUTOMATION ROWS
     * ========================================================
     */

    const now =
      new Date().toISOString();

    let automationRows:
      Array<Record<string, unknown>>;

    /**
     * ========================================================
     * SCHEDULER AUTOMATION
     * ========================================================
     *
     * ONE automation.
     *
     * instagram_post_id = null
     */

    if (isSchedulerAutomation) {
      automationRows = [
        {
          user_id:
            user.id,

          /**
           * IMPORTANT:
           * Your previous code calculated `name`
           * but never inserted it.
           */
          name,

          instagram_account_id:
            account.id,

          instagram_post_id:
            null,

          trigger_type:
            triggerType,

          trigger_keyword:
            keywords.length > 0
              ? keywords[0]
              : "",

          trigger_keywords:
            keywords,

          dm_message:
            dmMessage,

          is_active:
            body?.isActive !== false,

          created_at:
            now,

          updated_at:
            now,

          button_name:
            buttonName,

          button_url:
            buttonUrl,

          reply_enabled:
            replyEnabled,

          reply_text:
            replyText,
        },
      ];
    } else {
      /**
       * ======================================================
       * NORMAL AUTOMATION
       * ======================================================
       */

      automationRows =
        validPosts.map(
          (post) => ({
            user_id:
              user.id,

            name,

            instagram_account_id:
              account.id,

            instagram_post_id:
              post.id,

            trigger_type:
              triggerType,

            trigger_keyword:
              keywords.length > 0
                ? keywords[0]
                : "",

            trigger_keywords:
              keywords,

            dm_message:
              dmMessage,

            is_active:
              body?.isActive !== false,

            created_at:
              now,

            updated_at:
              now,

            button_name:
              buttonName,

            button_url:
              buttonUrl,

            reply_enabled:
              replyEnabled,

            reply_text:
              replyText,
          }),
        );
    }

    /**
     * ========================================================
     * INSERT
     * ========================================================
     */

    console.log(
      "CREATING INSTAGRAM AUTOMATIONS:",
      JSON.stringify(
        {
          source,

          scheduler:
            isSchedulerAutomation,

          rows:
            automationRows,
        },
        null,
        2,
      ),
    );

    const {
      data: automations,
      error: automationError,
    } = await admin
      .from(
        "instagram_automations",
      )
      .insert(
        automationRows,
      )
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
        reply_text
        `,
      );

    if (
      automationError ||
      !automations ||
      automations.length === 0
    ) {
      console.error(
        "INSTAGRAM AUTOMATION CREATE DATABASE ERROR:",
        automationError,
      );

      return NextResponse.json(
        {
          error:
            automationError
              ? String(
                  (automationError as { message?: unknown }).message ??
                    automationError,
                )
              : "Failed to create Instagram automation.",
        },
        {
          status: 500,
        },
      );
    }

    /**
     * ========================================================
     * GET THE CREATED AUTOMATION
     * ========================================================
     *
     * This is the critical fix.
     *
     * SchedulerClient expects:
     *
     *   result.data.id
     *
     * Therefore Scheduler creation returns the SINGLE
     * automation object rather than an array.
     */

    const createdAutomation =
      automations?.[0];

    if (!createdAutomation?.id) {
      console.error(
        "INSTAGRAM AUTOMATION CREATE RETURNED INVALID DATA:",
        {
          automations,
          automationError,
          source,
          isSchedulerAutomation,
          accountId: account.id,
        },
      );

      return NextResponse.json(
        {
          error:
            "Automation was created but no automation ID was returned.",
          details: automationError
            ? String(
                (automationError as { message?: unknown }).message ??
                  automationError,
              )
            : null,
        },
        {
          status: 500,
        },
      );
    }

    /**
     * ========================================================
     * SUCCESS LOG
     * ========================================================
     */

    console.log(
      "INSTAGRAM AUTOMATIONS CREATED:",
      {
        source,

        scheduler:
          isSchedulerAutomation,

        automationId:
          createdAutomation.id,

        automationName:
          createdAutomation.name,

        accountId:
          account.id,

        username:
          account.username,

        instagramPostId:
          createdAutomation.instagram_post_id,
      },
    );

    /**
     * ========================================================
     * RESPONSE
     * ========================================================
     *
     * Scheduler:
     *
     *   data = single automation
     *
     * Normal automation:
     *
     *   data = array
     *
     * This keeps your existing normal Automation page
     * behavior while making SchedulerClient compatible.
     */

    if (isSchedulerAutomation) {
      return NextResponse.json(
        {
          success: true,

          data:
            createdAutomation,

          automation:
            createdAutomation,

          account,

          count: 1,

          source: "scheduler",

          schedulerAutomation:
            true,
        },
        {
          status: 201,
        },
      );
    }

    return NextResponse.json(
      {
        success: true,

        data:
          automations,

        automations,

        account,

        count:
          automations.length,

        source:
          source || "automation",

        schedulerAutomation:
          false,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "INSTAGRAM AUTOMATION CREATE ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Instagram automation.",
      },
      {
        status: 500,
      },
    );
  }
}