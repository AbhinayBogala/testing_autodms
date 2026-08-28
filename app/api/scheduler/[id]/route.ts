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
     * ========================================================
     * READ REQUEST BODY
     * ========================================================
     *
     * Normal duplicate may send no body.
     *
     * Scheduler duplicate can send:
     *
     * {
     *   source: "scheduler",
     *   scheduledDate: "2026-08-30T19:00:00",
     *   scheduledPostId: "...",
     *   instagramPostId: "..."
     * }
     */

    let body: {
      source?: string;
      scheduledDate?: string;
      scheduledPostId?: string;
      instagramPostId?: string | null;
      scheduledMediaUrl?: string | null;
      scheduledMediaType?: string | null;
    } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const isSchedulerDuplicate =
      body.source === "scheduler";

    /**
     * ========================================================
     * FIND ORIGINAL AUTOMATION
     * ========================================================
     */

    const {
      data: originalAutomation,
      error: findError,
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

    if (findError) {
      console.error(
        "INSTAGRAM AUTOMATION DUPLICATE FIND ERROR:",
        findError
      );

      return NextResponse.json(
        {
          error: findError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!originalAutomation) {
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
     * BUILD DUPLICATE NAME
     * ========================================================
     */

    const originalName =
      typeof originalAutomation.name === "string"
        ? originalAutomation.name.trim()
        : "";

    let duplicateName: string;

    if (isSchedulerDuplicate) {
      let scheduledDateLabel = "Post";

      if (body.scheduledDate) {
        const parsedDate =
          new Date(body.scheduledDate);

        if (
          !Number.isNaN(
            parsedDate.getTime()
          )
        ) {
          scheduledDateLabel =
            parsedDate.toLocaleDateString(
              "en-US",
              {
                month: "short",
                day: "numeric",
                year: "numeric",
              }
            );
        }
      }

      duplicateName = originalName
        ? `${originalName} — Scheduled ${scheduledDateLabel}`
        : `Scheduled ${scheduledDateLabel}`;

      duplicateName = duplicateName.slice(0, 100);
    } else {
      duplicateName = originalName
        ? `${originalName} (Copy)`
        : "Automation (Copy)";
    }

    /**
     * ========================================================
     * DETERMINE POST
     * ========================================================
     *
     * Normally preserve the original post.
     *
     * Scheduler can provide a different
     * instagram_posts.id.
     */

    /*
     * Scheduler duplicates represent a future scheduled post.
     * Never inherit the original automation's Instagram post.
     * The scheduled media itself belongs to scheduled_posts.media_url.
     */
    let instagramPostId: string | null =
      isSchedulerDuplicate
        ? null
        : originalAutomation.instagram_post_id;

    if (
      isSchedulerDuplicate &&
      body.instagramPostId
    ) {
      const {
        data: scheduledInstagramPost,
        error: scheduledPostError,
      } = await admin
        .from("instagram_posts")
        .select(
          `
          id,
          instagram_media_id
          `
        )
        .eq(
          "id",
          body.instagramPostId
        )
        .eq(
          "instagram_account_id",
          account.id
        )
        .maybeSingle();

      if (scheduledPostError) {
        console.error(
          "SCHEDULER AUTOMATION POST LOOKUP ERROR:",
          scheduledPostError
        );

        return NextResponse.json(
          {
            error:
              scheduledPostError.message,
          },
          {
            status: 500,
          }
        );
      }

      if (!scheduledInstagramPost) {
        return NextResponse.json(
          {
            error:
              "The selected Instagram post does not belong to this Instagram account.",
          },
          {
            status: 400,
          }
        );
      }

      instagramPostId =
        scheduledInstagramPost.id;
    }

    /**
     * ========================================================
     * CREATE DUPLICATE
     * ========================================================
     */

    const duplicateAutomation = {
      user_id: user.id,

      instagram_account_id:
        account.id,

      instagram_post_id:
        instagramPostId,

      /*
       * NEW NAME
       */
      name: duplicateName,

      /*
       * TRIGGER
       */
      trigger_type:
        originalAutomation.trigger_type,

      trigger_keyword:
        originalAutomation.trigger_keyword,

      trigger_keywords:
        originalAutomation.trigger_keywords,

      /*
       * DM
       */
      dm_message:
        originalAutomation.dm_message,

      /*
       * IMPORTANT
       *
       * Duplicate starts inactive.
       */

      is_active: false,

      /*
       * BUTTON
       */
      button_name:
        originalAutomation.button_name,

      button_url:
        originalAutomation.button_url,

      /*
       * PUBLIC REPLY
       */
      reply_enabled:
        originalAutomation.reply_enabled,

      reply_text:
        originalAutomation.reply_text,

      /*
       * NEW RECORD TIMESTAMPS
       */

      created_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),
    };

    console.log(
      "DUPLICATING INSTAGRAM AUTOMATION:",
      {
        originalAutomationId: id,

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
          body.scheduledPostId ??
          null,
      }
    );

    /**
     * ========================================================
     * INSERT DUPLICATE
     * ========================================================
     */

    const {
      data: duplicated,
      error: duplicateError,
    } = await admin
      .from("instagram_automations")
      .insert(
        duplicateAutomation
      )
      .select("*")
      .single();

    if (duplicateError) {
      console.error(
        "INSTAGRAM AUTOMATION DUPLICATE DATABASE ERROR:",
        duplicateError
      );

      return NextResponse.json(
        {
          error:
            duplicateError.message,
        },
        {
          status: 500,
        }
      );
    }

    console.log(
      "INSTAGRAM AUTOMATION DUPLICATED:",
      {
        originalAutomationId:
          id,

        newAutomationId:
          duplicated.id,

        name:
          duplicateName,

        accountId:
          account.id,

        source:
          isSchedulerDuplicate
            ? "scheduler"
            : "automation_page",
      }
    );

    return NextResponse.json(
      {
        success: true,

        data: duplicated,

        meta: {
          source:
            isSchedulerDuplicate
              ? "scheduler"
              : "automation_page",

          name:
            duplicateName,

          scheduledPostId:
            body.scheduledPostId ??
            null,

          scheduledMediaUrl:
            body.scheduledMediaUrl ??
            null,

          scheduledMediaType:
            body.scheduledMediaType ??
            null,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "INSTAGRAM AUTOMATION DUPLICATE EXCEPTION:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to duplicate automation",
      },
      {
        status: 500,
      }
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

    /**
     * Scheduler PATCH dispatch.
     * SchedulerClient sends /api/scheduler/[id], where [id] is a
     * scheduled_posts.id, not an instagram_automations.id.
     */
    let schedulerPatchBody: Record<string, unknown> | null = null;

    try {
      schedulerPatchBody = await request.clone().json();
    } catch {
      schedulerPatchBody = null;
    }

    const isScheduledPostPatch =
      schedulerPatchBody !== null &&
      (
        schedulerPatchBody?.source === "scheduler" ||
        schedulerPatchBody?.schedulerMode === true ||
        "scheduledAt" in schedulerPatchBody ||
        "mediaUrl" in schedulerPatchBody ||
        "automationEnabled" in schedulerPatchBody
      );

    if (isScheduledPostPatch) {
      try {
        const supabase = await createClient();

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          console.error(
            "SCHEDULER PATCH AUTH ERROR:",
            authError,
          );

          return NextResponse.json(
            {
              error: "Authentication failed.",
              details: authError.message,
            },
            { status: 401 },
          );
        }

        if (!user) {
          return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 },
          );
        }

        const admin = createAdminClient();

        /*
         * Load the scheduled post first.
         */
        const {
          data: existingScheduledPost,
          error: scheduledFindError,
        } = await admin
          .from("scheduled_posts")
          .select(
            `
            id,
            user_id,
            instagram_account_id,
            media_url,
            media_type,
            post_type,
            caption,
            scheduled_at,
            timezone,
            automation_enabled,
            automation_id,
            status,
            instagram_media_id,
            published_at,
            error_message,
            created_at
            `,
          )
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (scheduledFindError) {
          console.error(
            "SCHEDULER PATCH FIND ERROR:",
            scheduledFindError,
          );

          return NextResponse.json(
            {
              error: "Could not load scheduled post.",
              details: scheduledFindError.message,
            },
            { status: 500 },
          );
        }

        if (!existingScheduledPost) {
          return NextResponse.json(
            {
              error: "Scheduled post not found.",
            },
            { status: 404 },
          );
        }

        /*
         * Published/publishing posts should not be edited.
         */
        if (
          existingScheduledPost.status === "published" ||
          existingScheduledPost.status === "publishing"
        ) {
          return NextResponse.json(
            {
              error:
                "Published or currently publishing posts cannot be edited.",
            },
            { status: 409 },
          );
        }

        const body = schedulerPatchBody ?? {};

        /*
         * --------------------------------------------------------
         * BUILD SCHEDULED POST UPDATE
         * --------------------------------------------------------
         */
        const scheduledUpdates: Record<string, unknown> = {};

        if ("mediaUrl" in body) {
          const mediaUrl =
            typeof body.mediaUrl === "string"
              ? body.mediaUrl.trim()
              : "";

          if (!mediaUrl) {
            return NextResponse.json(
              {
                error: "Media URL is required.",
              },
              { status: 400 },
            );
          }

          scheduledUpdates.media_url = mediaUrl;
        }

        if ("mediaType" in body) {
          const mediaType =
            typeof body.mediaType === "string"
              ? body.mediaType.trim().toLowerCase()
              : "";

          if (
            mediaType !== "image" &&
            mediaType !== "video"
          ) {
            return NextResponse.json(
              {
                error:
                  "Invalid media type. Use image or video.",
              },
              { status: 400 },
            );
          }

          scheduledUpdates.media_type = mediaType;
        }

        if ("postType" in body) {
          const postType =
            typeof body.postType === "string"
              ? body.postType.trim().toLowerCase()
              : "";

          if (
            postType !== "post" &&
            postType !== "reel"
          ) {
            return NextResponse.json(
              {
                error:
                  "Invalid post type. Use post or reel.",
              },
              { status: 400 },
            );
          }

          scheduledUpdates.post_type = postType;
        }

        if ("caption" in body) {
          scheduledUpdates.caption =
            typeof body.caption === "string"
              ? body.caption
              : body.caption == null
                ? null
                : String(body.caption);
        }

        if ("timezone" in body) {
          const timezone =
            typeof body.timezone === "string"
              ? body.timezone.trim()
              : "";

          if (timezone) {
            scheduledUpdates.timezone = timezone;
          }
        }

        if ("scheduledAt" in body) {
          const scheduledAt =
            typeof body.scheduledAt === "string"
              ? body.scheduledAt.trim()
              : "";

          if (!scheduledAt) {
            return NextResponse.json(
              {
                error:
                  "Scheduled date and time is required.",
              },
              { status: 400 },
            );
          }

          const parsedDate = new Date(scheduledAt);

          if (
            Number.isNaN(parsedDate.getTime())
          ) {
            return NextResponse.json(
              {
                error:
                  "Invalid scheduled date and time.",
              },
              { status: 400 },
            );
          }

          if (
            parsedDate.getTime() <=
            Date.now() + 30_000
          ) {
            return NextResponse.json(
              {
                error:
                  "Please select a future date and time.",
              },
              { status: 400 },
            );
          }

          scheduledUpdates.scheduled_at =
            parsedDate.toISOString();
        }

        /*
         * --------------------------------------------------------
         * AUTOMATION
         * --------------------------------------------------------
         *
         * Editing a scheduled post must not require an existing
         * automation to be selected again.
         *
         * Same automation ID:
         *   keep it without re-querying.
         *
         * Different automation ID:
         *   verify it belongs to this user/account.
         *
         * Automation OFF:
         *   clear the relationship.
         */
        if ("automationEnabled" in body) {
          const automationEnabled =
            body.automationEnabled === true;

          scheduledUpdates.automation_enabled =
            automationEnabled;

          if (!automationEnabled) {
            scheduledUpdates.automation_id = null;
          } else {
            const requestedAutomationId =
              typeof body.automationId === "string"
                ? body.automationId.trim()
                : "";

            if (!requestedAutomationId) {
              return NextResponse.json(
                {
                  error:
                    "Automation ID is required when automation is enabled.",
                },
                { status: 400 },
              );
            }

            if (
              requestedAutomationId ===
              existingScheduledPost.automation_id
            ) {
              /*
               * This is the normal Edit case.
               * Keep the existing relationship.
               */
              scheduledUpdates.automation_id =
                existingScheduledPost.automation_id;
            } else {
              /*
               * The user selected a different automation.
               */
              const {
                data: automation,
                error: automationError,
              } = await admin
                .from("instagram_automations")
                .select("id")
                .eq(
                  "id",
                  requestedAutomationId,
                )
                .eq(
                  "user_id",
                  user.id,
                )
                .eq(
                  "instagram_account_id",
                  existingScheduledPost.instagram_account_id,
                )
                .maybeSingle();

              if (automationError) {
                console.error(
                  "SCHEDULER PATCH AUTOMATION CHECK ERROR:",
                  automationError,
                );

                return NextResponse.json(
                  {
                    error:
                      "Could not verify automation.",
                    details:
                      automationError.message,
                  },
                  { status: 500 },
                );
              }

              if (!automation) {
                return NextResponse.json(
                  {
                    error:
                      "Automation not found or does not belong to this Instagram account.",
                  },
                  { status: 404 },
                );
              }

              scheduledUpdates.automation_id =
                automation.id;
            }
          }
        }

        /*
         * Optional direct status update. Keep the same safety
         * rules as DELETE.
         */
        if ("status" in body) {
          const requestedStatus =
            typeof body.status === "string"
              ? body.status.trim().toLowerCase()
              : "";

          if (
            requestedStatus === "cancelled"
          ) {
            scheduledUpdates.status =
              "cancelled";
          } else if (
            requestedStatus &&
            requestedStatus !==
              existingScheduledPost.status
          ) {
            return NextResponse.json(
              {
                error:
                  "Invalid scheduled post status update.",
              },
              { status: 400 },
            );
          }
        }

        if (
          Object.keys(scheduledUpdates).length ===
          0
        ) {
          return NextResponse.json(
            {
              error:
                "Nothing to update.",
            },
            { status: 400 },
          );
        }

        console.log(
          "UPDATING SCHEDULED POST:",
          {
            scheduledPostId: id,
            userId: user.id,
            existingAutomationId:
              existingScheduledPost.automation_id,
            requestedAutomationId:
              body.automationId ?? null,
            automationEnabled:
              body.automationEnabled ?? null,
            updates: scheduledUpdates,
          },
        );

        const {
          data: updatedScheduledPost,
          error: updateScheduledError,
        } = await admin
          .from("scheduled_posts")
          .update(scheduledUpdates)
          .eq("id", id)
          .eq("user_id", user.id)
          .select(
            `
            id,
            user_id,
            instagram_account_id,
            media_url,
            media_type,
            post_type,
            caption,
            scheduled_at,
            timezone,
            automation_enabled,
            automation_id,
            status,
            instagram_media_id,
            published_at,
            error_message,
            created_at
            `,
          )
          .single();

        if (updateScheduledError) {
          console.error(
            "SCHEDULED POST UPDATE ERROR:",
            updateScheduledError,
          );

          return NextResponse.json(
            {
              error:
                "Failed to update scheduled post.",
              details:
                updateScheduledError.message,
              code:
                updateScheduledError.code ?? null,
            },
            { status: 500 },
          );
        }

        if (!updatedScheduledPost) {
          return NextResponse.json(
            {
              error:
                "Scheduled post could not be updated.",
            },
            { status: 404 },
          );
        }

        /*
         * Never return an invalid scheduled_at value.
         */
        if (
          typeof updatedScheduledPost.scheduled_at !==
            "string" ||
          Number.isNaN(
            new Date(
              updatedScheduledPost.scheduled_at,
            ).getTime(),
          )
        ) {
          console.error(
            "INVALID SCHEDULED DATE AFTER UPDATE:",
            updatedScheduledPost,
          );

          return NextResponse.json(
            {
              error:
                "Scheduled post was updated, but the server returned an invalid scheduled date.",
            },
            { status: 500 },
          );
        }

        return NextResponse.json(
          {
            success: true,
            post: updatedScheduledPost,
            data: updatedScheduledPost,
          },
          { status: 200 },
        );
      
      } catch (error) {
        console.error(
          "SCHEDULED POST PATCH EXCEPTION:",
          error,
        );

        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to update scheduled post.",
          },
          { status: 500 },
        );
      }
    }


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
  },
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Scheduled post ID is required." },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("SCHEDULER DELETE AUTH ERROR:", authError);
      return NextResponse.json(
        {
          error: "Authentication failed.",
          details: authError.message,
        },
        { status: 401 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const admin = createAdminClient();

    /*
     * IMPORTANT:
     * A scheduled post is stored in scheduled_posts.
     * Deleting it must NOT require an automation to exist.
     */

    const {
      data: scheduledPost,
      error: findError,
    } = await admin
      .from("scheduled_posts")
      .select(
        `
        id,
        user_id,
        status,
        automation_id,
        media_url
        `,
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findError) {
      console.error(
        "SCHEDULER DELETE FIND ERROR:",
        findError,
      );

      return NextResponse.json(
        {
          error: "Could not find scheduled post.",
          details: findError.message,
          code: findError.code ?? null,
        },
        { status: 500 },
      );
    }

    if (!scheduledPost) {
      return NextResponse.json(
        {
          error: "Scheduled post not found.",
        },
        { status: 404 },
      );
    }

    /*
     * Never delete a post that has already been published
     * or is currently being published.
     */
    if (
      scheduledPost.status === "published" ||
      scheduledPost.status === "publishing"
    ) {
      return NextResponse.json(
        {
          error:
            "Published or currently publishing posts cannot be deleted.",
        },
        { status: 409 },
      );
    }

    /*
     * Delete ONLY the scheduled_posts row.
     *
     * Do not look up or delete instagram_automations here.
     * The automation can be reused independently.
     */
    const {
      data: deletedPost,
      error: deleteError,
    } = await admin
      .from("scheduled_posts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      console.error(
        "SCHEDULER DELETE POST ERROR:",
        deleteError,
      );

      return NextResponse.json(
        {
          error: "Failed to delete scheduled post.",
          details: deleteError.message,
          code: deleteError.code ?? null,
          hint: deleteError.hint ?? null,
        },
        { status: 500 },
      );
    }

    if (!deletedPost) {
      return NextResponse.json(
        {
          error:
            "Scheduled post could not be deleted or was already deleted.",
        },
        { status: 404 },
      );
    }

    console.log(
      "SCHEDULED POST DELETED:",
      {
        scheduledPostId: id,
        userId: user.id,
        automationId:
          scheduledPost.automation_id ?? null,
      },
    );

    return NextResponse.json(
      {
        success: true,
        deletedId: id,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "SCHEDULER DELETE EXCEPTION:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete scheduled post.",
      },
      { status: 500 },
    );
  }
}
