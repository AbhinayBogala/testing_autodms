import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get the currently connected Instagram account
 * for the logged-in user.
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
 * GET
 *
 * Load one automation.
 *
 * IMPORTANT:
 * Uses instagram_automations only.
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

    const { data: automation, error } = await admin
      .from("instagram_automations")
      .select(
        `
        id,
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
     * Get the corresponding Instagram post.
     *
     * instagram_automations.instagram_post_id stores
     * the Instagram MEDIA ID.
     */
    const { data: post } = await admin
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

    return NextResponse.json({
      data: {
        ...automation,

        post: post ?? null,

        postIds: post
          ? [post.instagram_media_id]
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
 * PATCH
 *
 * Update an existing automation.
 *
 * Uses instagram_automations only.
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
          error: "Instagram account not found",
        },
        {
          status: 404,
        }
      );
    }

    const admin = createAdminClient();

    /**
     * Make sure the automation belongs to
     * the logged-in user and connected account.
     */
    const {
      data: existingAutomation,
      error: existingError,
    } = await admin
      .from("instagram_automations")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("instagram_account_id", account.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error: existingError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!existingAutomation) {
      return NextResponse.json(
        {
          error: "Automation not found",
        },
        {
          status: 404,
        }
      );
    }

    const body = await request.json();

    /**
     * ---------------------------------------------------------
     * TRIGGER TYPE
     * ---------------------------------------------------------
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
        value === "keyword"
          ? "keyword"
          : "any_comment";
    }

    /**
     * ---------------------------------------------------------
     * KEYWORDS
     * ---------------------------------------------------------
     */
    let keywords: string[] =
      Array.isArray(
        existingAutomation.trigger_keywords
      )
        ? existingAutomation.trigger_keywords
            .map((value: unknown) =>
              String(value)
            )
            .map((value: string) =>
              value
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
        : [];

    if (
      Array.isArray(body?.keywords)
    ) {
      keywords = Array.from(
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
     * ---------------------------------------------------------
     * NAME
     *
     * instagram_automations does NOT have a name column.
     *
     * We intentionally do not attempt to update `name`.
     * ---------------------------------------------------------
     */

    /**
     * ---------------------------------------------------------
     * DM
     * ---------------------------------------------------------
     */
    let dmEnabled =
      Boolean(
        existingAutomation.dm_message
      );

    if (
      "dmEnabled" in body ||
      "dm_enabled" in body
    ) {
      dmEnabled = Boolean(
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
     * ---------------------------------------------------------
     * PUBLIC REPLY
     * ---------------------------------------------------------
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
      replyEnabled = Boolean(
        body.publicReplyEnabled ??
          body.public_reply_enabled ??
          body.replyEnabled
      );
    }

    let replyText =
      existingAutomation.reply_text ??
      "";

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
     * ---------------------------------------------------------
     * BUTTON
     * ---------------------------------------------------------
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
     * ---------------------------------------------------------
     * ACTIVE STATUS
     * ---------------------------------------------------------
     */
    let isActive =
      existingAutomation.is_active !==
      false;

    if (
      "isActive" in body ||
      "is_active" in body
    ) {
      isActive = Boolean(
        body.isActive ??
          body.is_active
      );
    }

    /**
     * ---------------------------------------------------------
     * POST
     *
     * This table has ONE instagram_post_id per automation.
     *
     * If postIds is supplied, we use the first valid
     * selected post.
     *
     * We store instagram_media_id, NOT instagram_posts.id.
     * ---------------------------------------------------------
     */
    let instagramPostId =
      existingAutomation.instagram_post_id;

    if (
      Array.isArray(body?.postIds)
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

      /**
       * First try database UUID.
       */
      let selectedPosts: Array<{
        id: string;
        instagram_media_id: string;
      }> = [];

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
       * If not found, try Instagram media IDs.
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

      /**
       * One automation row contains one post.
       *
       * Therefore use the first selected post.
       */
      instagramPostId =
        String(
          selectedPosts[0]
            .instagram_media_id
        );
    }

    /**
     * ---------------------------------------------------------
     * UPDATE
     * ---------------------------------------------------------
     */
    const updates = {
      instagram_post_id:
        instagramPostId,

      trigger_type:
        triggerType,

      trigger_keyword:
        keywords.length > 0
          ? keywords[0]
          : "",

      trigger_keywords:
        keywords,

      dm_message:
        dmEnabled
          ? dmMessage
          : "",

      is_active:
        isActive,

      button_name:
        buttonName,

      button_url:
        buttonUrl,

      reply_enabled:
        replyEnabled,

      reply_text:
        replyEnabled
          ? replyText
          : "",

      updated_at:
        new Date().toISOString(),
    };

    console.log(
      "UPDATING INSTAGRAM AUTOMATION:",
      {
        automationId: id,
        accountId: account.id,
        updates,
      }
    );

    const {
      data: updated,
      error: updateError,
    } = await admin
      .from("instagram_automations")
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
 * DELETE
 *
 * Deletes the automation from instagram_automations.
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
     * Verify the automation exists
     * before deleting.
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
     * Delete from the single source of truth.
     */
    const {
      error: deleteError,
    } = await admin
      .from(
        "instagram_automations"
      )
      .delete()
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      )
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
        accountId: account.id,
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