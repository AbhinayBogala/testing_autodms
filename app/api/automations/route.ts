import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get the currently connected Instagram account for the logged-in user.
 *
 * IMPORTANT:
 * We use the connected account only.
 *
 * This allows the application to support multiple Instagram accounts
 * in the future while still knowing which account is currently active.
 */
async function getAccount(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("instagram_accounts")
    .select(
      `
      id,
      username,
      is_connected,
      instagram_user_id,
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
 * Returns automations for the currently connected Instagram account.
 *
 * IMPORTANT:
 * The application uses instagram_automations as the single source
 * of truth.
 *
 * We do NOT use the old:
 *
 *   automations
 *   automation_posts
 *   automation_keywords
 *
 * tables here.
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
        }
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
      .eq("user_id", user.id)
      .eq("instagram_account_id", account.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "INSTAGRAM AUTOMATIONS GET DATABASE ERROR:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
          connected: true,
        },
        {
          status: 500,
        }
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
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load automations",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * POST
 *
 * Creates an automation in instagram_automations.
 *
 * IMPORTANT:
 *
 * instagram_automations.instagram_post_id stores the
 * Supabase instagram_posts.id UUID.
 *
 * Example:
 *
 * instagram_posts:
 *
 *   id = a672a5d8-db1c-4391-ace6-69366062b1d7
 *
 *   instagram_media_id = 17943238854072307
 *
 * We store:
 *
 *   instagram_post_id = a672a5d8-db1c-4391-ace6-69366062b1d7
 *
 * The Instagram webhook receives:
 *
 *   value.media.id
 *
 * which is:
 *
 *   17943238854072307
 *
 * The webhook first finds instagram_posts using
 * instagram_media_id and then uses the resulting
 * instagram_posts.id to find this automation.
 */
export async function POST(
  request: NextRequest
) {
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
        }
      );
    }

    const account = await getAccount(user.id);

    if (!account) {
      return NextResponse.json(
        {
          error: "Connect Instagram first.",
        },
        {
          status: 400,
        }
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
        }
      );
    }

    const body = await request.json();

    /**
     * BASIC VALUES
     */
    const name = String(
      body?.name ??
        "New Instagram automation"
    )
      .trim()
      .slice(0, 100);

    const triggerType =
      body?.triggerType === "keyword"
        ? "keyword"
        : "any_comment";

    /**
     * POST IDS
     *
     * The frontend can send either:
     *
     * 1. instagram_posts.id
     *
     * OR
     *
     * 2. instagram_posts.instagram_media_id
     *
     * We normalize both into instagram_posts rows.
     */
    const rawPostIds = Array.isArray(
      body?.postIds
    )
      ? body.postIds
      : [];

    const postIds = [
      ...new Set(
        rawPostIds
          .map((value: unknown) =>
            String(value).trim()
          )
          .filter(Boolean)
      ),
    ];

    /**
     * KEYWORDS
     */
    const keywords: string[] =
      Array.isArray(body?.keywords)
        ? Array.from(
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
                .filter(
                  (value: string) =>
                    Boolean(value)
                )
            )
          )
        : [];

    /**
     * VALIDATION
     */
    if (!name) {
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
        }
      );
    }

    if (postIds.length === 0) {
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

    const admin = createAdminClient();

    /**
     * VERIFY POSTS
     *
     * First try the values as database UUIDs.
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
        `
      )
      .eq(
        "instagram_account_id",
        account.id
      )
      .in("id", postIds);

    if (postsByIdError) {
      console.error(
        "INSTAGRAM POSTS UUID VALIDATION ERROR:",
        postsByIdError
      );

      return NextResponse.json(
        {
          error:
            postsByIdError.message,
        },
        {
          status: 500,
        }
      );
    }

    /**
     * If UUID lookup worked, use those posts.
     *
     * Otherwise try the values as Instagram media IDs.
     */
    let validPosts =
      postsById ?? [];

    if (validPosts.length === 0) {
      const {
        data: postsByMediaId,
        error: postsByMediaError,
      } = await admin
        .from("instagram_posts")
        .select(
          `
          id,
          instagram_media_id,
          instagram_account_id
          `
        )
        .eq(
          "instagram_account_id",
          account.id
        )
        .in(
          "instagram_media_id",
          postIds
        );

      if (postsByMediaError) {
        console.error(
          "INSTAGRAM POSTS MEDIA ID VALIDATION ERROR:",
          postsByMediaError
        );

        return NextResponse.json(
          {
            error:
              postsByMediaError.message,
          },
          {
            status: 500,
          }
        );
      }

      validPosts =
        postsByMediaId ?? [];
    }

    /**
     * No posts found.
     */
    if (
      validPosts.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No valid Instagram posts were found for this Instagram account.",
          postIds,
        },
        {
          status: 400,
        }
      );
    }

    /**
     * Make sure every selected post was found.
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
              })
            ),
        },
        {
          status: 400,
        }
      );
    }

    /**
     * DM SETTINGS
     */
    const dmEnabled =
      Boolean(body?.dmEnabled);

    const dmMessage = dmEnabled
      ? String(
          body?.dmText ??
            body?.dmMessage ??
            ""
        )
          .trim()
          .slice(0, 2000)
      : "";

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
     * PUBLIC REPLY SETTINGS
     *
     * These values are stored directly in:
     *
     * instagram_automations.reply_enabled
     * instagram_automations.reply_text
     */
    const replyEnabled =
      Boolean(
        body?.publicReplyEnabled ??
          body?.replyEnabled
      );

    const replyText =
      replyEnabled
        ? String(
            body?.publicReplyText ??
              body?.replyText ??
              ""
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
        }
      );
    }

    /**
     * BUTTON
     */
    const buttonName =
      body?.buttonName
        ? String(
            body.buttonName
          )
            .trim()
            .slice(0, 100)
        : null;

    const buttonUrl =
      body?.buttonUrl
        ? String(
            body.buttonUrl
          )
            .trim()
            .slice(0, 2000)
        : null;

    /**
     * CREATE ONE AUTOMATION PER POST
     *
     * instagram_automations has one
     * instagram_post_id column.
     *
     * Therefore multiple selected posts
     * become multiple automation rows.
     */
    const now =
      new Date().toISOString();

    const automationRows =
      validPosts.map(
        (post) => ({
          user_id:
            user.id,

          instagram_account_id:
            account.id,

          /**
           * IMPORTANT:
           *
           * Store the Supabase instagram_posts.id UUID.
           *
           * The Instagram webhook receives the Instagram
           * media ID, finds the corresponding instagram_posts
           * row, and then uses post.id to find this automation.
           */
          instagram_post_id:
            post.id,

          trigger_type:
            triggerType,

          trigger_keyword:
            keywords.length
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
        })
      );

    console.log(
      "CREATING INSTAGRAM AUTOMATIONS:",
      JSON.stringify(
        automationRows,
        null,
        2
      )
    );

    const {
      data: automations,
      error: automationError,
    } = await admin
      .from(
        "instagram_automations"
      )
      .insert(
        automationRows
      )
      .select("*");

    if (
      automationError ||
      !automations
    ) {
      console.error(
        "INSTAGRAM AUTOMATION CREATE DATABASE ERROR:",
        automationError
      );

      return NextResponse.json(
        {
          error:
            automationError?.message ??
            "Failed to create Instagram automation.",
        },
        {
          status: 500,
        }
      );
    }

    /**
     * SUCCESS
     */
    console.log(
      "INSTAGRAM AUTOMATIONS CREATED:",
      {
        accountId:
          account.id,

        username:
          account.username,

        automationCount:
          automations.length,

        postIds:
          automations.map(
            (automation) =>
              automation.instagram_post_id
          ),

        replyEnabled:
          replyEnabled,

        replyText:
          replyText,

        dmEnabled:
          dmEnabled,

        dmMessage:
          dmMessage,
      }
    );

    return NextResponse.json(
      {
        data:
          automations,

        account,

        count:
          automations.length,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "INSTAGRAM AUTOMATION CREATE ERROR:",
      error
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
      }
    );
  }
}