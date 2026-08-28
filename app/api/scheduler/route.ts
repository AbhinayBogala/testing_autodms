import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ScheduleBody = {
  instagramAccountId?: unknown;
  mediaUrl?: unknown;
  mediaType?: unknown;
  postType?: unknown;
  caption?: unknown;
  scheduledAt?: unknown;
  timezone?: unknown;
  automationEnabled?: unknown;
  automationId?: unknown;
};

const SCHEDULED_POST_SELECT = `
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
`;

function jsonError(
  error: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json(
    details === undefined ? { error } : { error, details },
    { status },
  );
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDateString(value: string): boolean {
  if (!value) return false;

  const date = new Date(value);

  return !Number.isNaN(date.getTime());
}

/**
 * GET /api/scheduler
 *
 * Returns the authenticated user's scheduled posts.
 *
 * IMPORTANT:
 * This route is ONLY for scheduled_posts.
 * Automation CRUD belongs under /api/automations.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("SCHEDULER GET AUTH ERROR:", authError);

      return jsonError(
        "Authentication failed.",
        401,
        authError.message,
      );
    }

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const admin = createAdminClient();

    const { searchParams } = new URL(request.url);
    const requestedAccountId = cleanString(
      searchParams.get("instagramAccountId"),
    );

    let query = admin
      .from("scheduled_posts")
      .select(SCHEDULED_POST_SELECT)
      .eq("user_id", user.id);

    if (requestedAccountId) {
      query = query.eq(
        "instagram_account_id",
        requestedAccountId,
      );
    }

    const {
      data: scheduledPosts,
      error,
    } = await query
      .order("scheduled_at", {
        ascending: true,
      })
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "SCHEDULER GET DATABASE ERROR:",
        error,
      );

      return jsonError(
        "Failed to load scheduled posts.",
        500,
        error.message,
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: scheduledPosts ?? [],
        scheduledPosts: scheduledPosts ?? [],
        count: scheduledPosts?.length ?? 0,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("SCHEDULER GET EXCEPTION:", error);

    return jsonError(
      error instanceof Error
        ? error.message
        : "Failed to load scheduled posts.",
      500,
    );
  }
}

/**
 * POST /api/scheduler
 *
 * Creates ONE scheduled_posts row.
 *
 * There is intentionally NO Instagram post selection here.
 * The Instagram media ID does not exist until the scheduled media
 * is actually published to Instagram.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("SCHEDULER POST AUTH ERROR:", authError);

      return jsonError(
        "Authentication failed.",
        401,
        authError.message,
      );
    }

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    let body: ScheduleBody;

    try {
      body = (await request.json()) as ScheduleBody;
    } catch {
      return jsonError(
        "Invalid JSON request body.",
        400,
      );
    }

    const instagramAccountId = cleanString(
      body.instagramAccountId,
    );

    const mediaUrl = cleanString(body.mediaUrl);

    const mediaType = cleanString(body.mediaType).toLowerCase();

    const postType = cleanString(body.postType).toLowerCase();

    const caption =
      typeof body.caption === "string"
        ? body.caption
        : body.caption == null
          ? null
          : String(body.caption);

    const scheduledAt = cleanString(
      body.scheduledAt,
    );

    const timezone =
      cleanString(body.timezone) || "UTC";

    const automationEnabled =
      body.automationEnabled === true;

    const automationId =
      body.automationId == null
        ? null
        : cleanString(body.automationId) || null;

    /*
     * ------------------------------------------------------------
     * VALIDATION
     * ------------------------------------------------------------
     */

    if (!instagramAccountId) {
      return jsonError(
        "Please select an Instagram account.",
      );
    }

    if (!mediaUrl) {
      return jsonError(
        "Please upload an image or video.",
      );
    }

    if (
      mediaType !== "image" &&
      mediaType !== "video"
    ) {
      return jsonError(
        "Invalid media type. Use image or video.",
      );
    }

    if (
      postType !== "post" &&
      postType !== "reel"
    ) {
      return jsonError(
        "Invalid post type. Use post or reel.",
      );
    }

    /*
     * ------------------------------------------------------------
     * VALIDATE MEDIA TYPE / POST TYPE
     * ------------------------------------------------------------
     *
     * Instagram Reels require video media.
     * Images must be scheduled as normal image posts.
     *
     * This validation prevents an invalid combination such as:
     *
     *   media_type = "image"
     *   post_type  = "reel"
     *
     * from ever being inserted into scheduled_posts.
     *
     * The cron publisher also performs the same defensive
     * validation before contacting Instagram.
     */

    if (
      postType === "reel" &&
      mediaType !== "video"
    ) {
      return jsonError(
        "A Reel must use a video. Please upload a video or choose Post.",
        400,
      );
    }

    if (
      postType === "post" &&
      mediaType !== "image" &&
      mediaType !== "video"
    ) {
      return jsonError(
        "Invalid media type for this post.",
        400,
      );
    }

    /*
     * The client sends an ISO timestamp produced from the
     * selected local date/time. Store that exact instant.
     */
    if (!isValidDateString(scheduledAt)) {
      return jsonError(
        "Invalid scheduled date and time.",
      );
    }

    const scheduledDate = new Date(scheduledAt);

    if (
      scheduledDate.getTime() <=
      Date.now() + 30_000
    ) {
      return jsonError(
        "Please select a future date and time.",
      );
    }

    /*
     * ------------------------------------------------------------
     * VERIFY INSTAGRAM ACCOUNT
     * ------------------------------------------------------------
     */

    const admin = createAdminClient();

    const {
      data: account,
      error: accountError,
    } = await admin
      .from("instagram_accounts")
      .select(
        `
        id,
        user_id,
        username,
        instagram_user_id,
        is_connected
        `,
      )
      .eq("id", instagramAccountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (accountError) {
      console.error(
        "SCHEDULER ACCOUNT LOOKUP ERROR:",
        accountError,
      );

      return jsonError(
        "Could not verify the selected Instagram account.",
        500,
        accountError.message,
      );
    }

    if (!account) {
      return jsonError(
        "The selected Instagram account was not found.",
        404,
      );
    }

    if (!account.is_connected) {
      return jsonError(
        "The selected Instagram account is not connected.",
        400,
      );
    }

    /*
     * ------------------------------------------------------------
     * VERIFY AUTOMATION
     * ------------------------------------------------------------
     *
     * Automation is optional.
     *
     * If enabled, the automation MUST belong to this user and
     * selected Instagram account.
     *
     * We do NOT require instagram_post_id here because the
     * Instagram post has not been published yet.
     */

    if (automationEnabled && !automationId) {
      return jsonError(
        "Please select an automation.",
      );
    }

    if (!automationEnabled && automationId) {
      /*
       * If the UI accidentally sends an automation ID while the
       * toggle is off, do not attach it to the schedule.
       */
      console.warn(
        "SCHEDULER: automationId supplied while automationEnabled=false. Ignoring it.",
        {
          automationId,
        },
      );
    }

    let verifiedAutomationId: string | null = null;

    if (automationEnabled && automationId) {
      const {
        data: automation,
        error: automationError,
      } = await admin
        .from("instagram_automations")
        .select(
          `
          id,
          user_id,
          instagram_account_id,
          instagram_post_id,
          is_active
          `,
        )
        .eq("id", automationId)
        .eq("user_id", user.id)
        .eq(
          "instagram_account_id",
          instagramAccountId,
        )
        .maybeSingle();

      if (automationError) {
        console.error(
          "SCHEDULER AUTOMATION LOOKUP ERROR:",
          automationError,
        );

        return jsonError(
          "Could not verify the selected automation.",
          500,
          automationError.message,
        );
      }

      if (!automation) {
        return jsonError(
          "The selected automation was not found for this Instagram account.",
          404,
        );
      }

      verifiedAutomationId = automation.id;
    }

    /*
     * ------------------------------------------------------------
     * CREATE SCHEDULED POST
     * ------------------------------------------------------------
     */

    const insertRow = {
      user_id: user.id,
      instagram_account_id: instagramAccountId,

      media_url: mediaUrl,
      media_type: mediaType,
      post_type: postType,

      caption,

      /*
       * Always store a real ISO timestamp.
       * This prevents the Scheduler dashboard from receiving
       * undefined/invalid scheduled_at values.
       */
      scheduled_at: scheduledDate.toISOString(),

      timezone,

      automation_enabled: automationEnabled,
      automation_id: verifiedAutomationId,

      /*
       * No Instagram media exists yet.
       */
      instagram_media_id: null,

      status: "scheduled",

      published_at: null,
      error_message: null,

      created_at: new Date().toISOString(),
    };

    console.log(
      "CREATING SCHEDULED POST:",
      JSON.stringify(insertRow, null, 2),
    );

    const {
      data: scheduledPost,
      error: insertError,
    } = await admin
      .from("scheduled_posts")
      .insert(insertRow)
      .select(SCHEDULED_POST_SELECT)
      .single();

    if (insertError) {
      console.error(
        "SCHEDULED POST INSERT ERROR:",
        insertError,
      );

      return jsonError(
        "Failed to save scheduled post.",
        500,
        insertError.message,
      );
    }

    if (!scheduledPost) {
      return jsonError(
        "Scheduled post was created but could not be returned.",
        500,
      );
    }

    /*
     * Final safety check. The client uses scheduled_at to render
     * the dashboard, so never return a malformed value.
     */
    if (
      typeof scheduledPost.scheduled_at !== "string" ||
      !isValidDateString(
        scheduledPost.scheduled_at,
      )
    ) {
      console.error(
        "SCHEDULER RETURNED INVALID scheduled_at:",
        scheduledPost,
      );

      return jsonError(
        "Scheduled post was saved, but the server returned an invalid scheduled date.",
        500,
      );
    }

    console.log(
      "SCHEDULED POST CREATED:",
      {
        id: scheduledPost.id,
        userId: user.id,
        accountId: instagramAccountId,
        scheduledAt: scheduledPost.scheduled_at,
        automationId:
          scheduledPost.automation_id,
      },
    );

    return NextResponse.json(
      {
        success: true,

        /*
         * SchedulerClient supports both result.post and
         * result.data. Return both for compatibility.
         */
        post: scheduledPost,
        data: scheduledPost,

        account,

        automationId:
          scheduledPost.automation_id,

        source: "scheduler",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "SCHEDULER POST EXCEPTION:",
      error,
    );

    return jsonError(
      error instanceof Error
        ? error.message
        : "Failed to create scheduled post.",
      500,
    );
  }
}
