import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  graphUrl,
  readJson,
  refreshAccountIfNeeded,
} from "@/lib/instagram";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

type ScheduledPost = {
  id: string;
  user_id: string;
  instagram_account_id: string;

  media_url: string;
  media_type: string;
  post_type: string;
  media_items?: Array<{
    url: string;
    type: string;
    name?: string | null;
    source?: string | null;
  }> | null;

  caption: string | null;

  scheduled_at: string;
  timezone: string | null;

  automation_enabled: boolean;
  automation_id: string | null;

  instagram_media_id: string | null;

  status: string | null;
};

type InstagramAccount = {
  id: string;
  user_id: string;
  instagram_user_id: string;
  access_token: string;
  is_connected: boolean;
};

/*
 * ============================================================
 * ERROR RESPONSE
 * ============================================================
 */

function jsonError(
  error: string,
  status = 500,
  details?: unknown,
) {
  return NextResponse.json(
    details === undefined
      ? {
          error,
        }
      : {
          error,
          details,
        },
    {
      status,
    },
  );
}

/*
 * ============================================================
 * WAIT FOR INSTAGRAM VIDEO/REEL CONTAINER
 * ============================================================
 */

async function waitForContainer(
  containerId: string,
  accessToken: string,
  maxAttempts = 20,
  delayMs = 3000,
) {
  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    const url = new URL(
      graphUrl(containerId),
    );

    url.searchParams.set(
      "fields",
      "id,status_code,status",
    );

    url.searchParams.set(
      "access_token",
      accessToken,
    );

    const response = await fetch(
      url.toString(),
      {
        method: "GET",
        cache: "no-store",
      },
    );

    const data = await readJson(response);

    console.log(
      "INSTAGRAM CONTAINER STATUS:",
      {
        containerId,
        attempt,
        data,
      },
    );

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
          data?.message ||
          "Could not check Instagram media container.",
      );
    }

    const status =
      data?.status_code ||
      data?.status ||
      "";

    if (
      status === "FINISHED" ||
      status === "PUBLISHED"
    ) {
      return data;
    }

    if (
      status === "ERROR" ||
      status === "EXPIRED"
    ) {
      throw new Error(
        `Instagram media container failed: ${JSON.stringify(
          data,
        )}`,
      );
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          delayMs,
        ),
      );
    }
  }

  throw new Error(
    "Instagram media container did not finish in time.",
  );
}

/*
 * ============================================================
 * GOOGLE DRIVE URL
 * ============================================================
 *
 * Instagram needs a publicly reachable media URL. For a public
 * Google Drive file, convert common sharing URLs into Drive's
 * direct download form. The file must be shared as:
 * "Anyone with the link" -> Viewer.
 */
function normalizeGoogleDriveUrl(url: string): string {
  const value = url.trim();

  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  return value;
}

function getScheduledMediaItems(post: ScheduledPost) {
  const items = Array.isArray(post.media_items)
    ? post.media_items
        .filter((item) => item && typeof item.url === "string")
        .map((item) => ({
          ...item,
          url:
            item.source === "google_drive"
              ? normalizeGoogleDriveUrl(item.url)
              : item.url,
        }))
    : [];

  if (items.length > 0) return items;

  return [
    {
      url: normalizeGoogleDriveUrl(post.media_url),
      type: post.media_type,
      source: "upload",
    },
  ];
}

/*
 * ============================================================
 * CREATE IMAGE POST CONTAINER
 * ============================================================
 */

async function createImageContainer(
  account: InstagramAccount,
  post: ScheduledPost,
) {
  const url = new URL(
    graphUrl(
      `${account.instagram_user_id}/media`,
    ),
  );

  url.searchParams.set(
    "image_url",
    normalizeGoogleDriveUrl(post.media_url),
  );

  if (post.caption) {
    url.searchParams.set(
      "caption",
      post.caption,
    );
  }

  url.searchParams.set(
    "access_token",
    account.access_token,
  );

  const response = await fetch(
    url.toString(),
    {
      method: "POST",
      cache: "no-store",
    },
  );

  const data = await readJson(response);

  console.log(
    "INSTAGRAM IMAGE CONTAINER RESPONSE:",
    JSON.stringify(
      data,
      null,
      2,
    ),
  );

  if (
    !response.ok ||
    !data?.id
  ) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        `Instagram image container creation failed: ${JSON.stringify(
          data,
        )}`,
    );
  }

  return String(data.id);
}

/*
 * ============================================================
 * CREATE CAROUSEL CONTAINER
 * ============================================================
 */
async function createCarouselContainer(
  account: InstagramAccount,
  post: ScheduledPost,
  items: Array<{ url: string; type: string; source?: string | null }>,
) {
  if (items.length < 2 || items.length > 10) {
    throw new Error("Instagram carousel posts require 2 to 10 images.");
  }

  if (items.some((item) => item.type !== "image")) {
    throw new Error("Instagram carousel posts in this scheduler support images only.");
  }

  const childIds: string[] = [];

  for (const item of items) {
    const url = new URL(
      graphUrl(`${account.instagram_user_id}/media`),
    );

    url.searchParams.set("image_url", normalizeGoogleDriveUrl(item.url));
    url.searchParams.set("is_carousel_item", "true");
    url.searchParams.set("access_token", account.access_token);

    const response = await fetch(url.toString(), {
      method: "POST",
      cache: "no-store",
    });

    const data = await readJson(response);

    if (!response.ok || !data?.id) {
      throw new Error(
        data?.error?.message ||
          data?.message ||
          `Instagram carousel child creation failed: ${JSON.stringify(data)}`,
      );
    }

    const childId = String(data.id);
    await waitForContainer(childId, account.access_token, 20, 3000);
    childIds.push(childId);
  }

  const parentUrl = new URL(
    graphUrl(`${account.instagram_user_id}/media`),
  );

  parentUrl.searchParams.set("media_type", "CAROUSEL");
  parentUrl.searchParams.set("children", childIds.join(","));

  if (post.caption) {
    parentUrl.searchParams.set("caption", post.caption);
  }

  parentUrl.searchParams.set("access_token", account.access_token);

  const parentResponse = await fetch(parentUrl.toString(), {
    method: "POST",
    cache: "no-store",
  });

  const parentData = await readJson(parentResponse);

  if (!parentResponse.ok || !parentData?.id) {
    throw new Error(
      parentData?.error?.message ||
        parentData?.message ||
        `Instagram carousel container creation failed: ${JSON.stringify(parentData)}`,
    );
  }

  return String(parentData.id);
}

/*
 * ============================================================
 * CREATE REEL CONTAINER
 * ============================================================
 */

async function createReelContainer(
  account: InstagramAccount,
  post: ScheduledPost,
) {
  const url = new URL(
    graphUrl(
      `${account.instagram_user_id}/media`,
    ),
  );

  url.searchParams.set(
    "media_type",
    "REELS",
  );

  url.searchParams.set(
    "video_url",
    normalizeGoogleDriveUrl(post.media_url),
  );

  if (post.caption) {
    url.searchParams.set(
      "caption",
      post.caption,
    );
  }

  url.searchParams.set(
    "access_token",
    account.access_token,
  );

  const response = await fetch(
    url.toString(),
    {
      method: "POST",
      cache: "no-store",
    },
  );

  const data = await readJson(response);

  console.log(
    "INSTAGRAM REEL CONTAINER RESPONSE:",
    JSON.stringify(
      data,
      null,
      2,
    ),
  );

  if (
    !response.ok ||
    !data?.id
  ) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        `Instagram Reel container creation failed: ${JSON.stringify(
          data,
        )}`,
    );
  }

  return String(data.id);
}

/*
 * ============================================================
 * PUBLISH INSTAGRAM CONTAINER
 * ============================================================
 */

async function publishContainer(
  account: InstagramAccount,
  containerId: string,
) {
  /*
   * Instagram can return OAuth error 9007 / 2207027 when the
   * media container exists but is not publishable yet.
   * Retry only that specific transient readiness error.
   */

  const maxAttempts = 5;

  const retryDelays = [
    0,
    5000,
    10000,
    15000,
    20000,
  ];

  let lastData: any = null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    const delay =
      retryDelays[attempt - 1] ?? 20000;

    if (delay > 0) {
      console.log(
        "INSTAGRAM PUBLISH RETRY WAIT:",
        {
          containerId,
          attempt,
          delayMs: delay,
        },
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay),
      );
    }

    const url = new URL(
      graphUrl(
        `${account.instagram_user_id}/media_publish`,
      ),
    );

    url.searchParams.set(
      "creation_id",
      containerId,
    );

    url.searchParams.set(
      "access_token",
      account.access_token,
    );

    console.log(
      "INSTAGRAM PUBLISH ATTEMPT:",
      {
        containerId,
        attempt,
        maxAttempts,
      },
    );

    const response = await fetch(
      url.toString(),
      {
        method: "POST",
        cache: "no-store",
      },
    );

    const data = await readJson(response);
    lastData = data;

    console.log(
      "INSTAGRAM PUBLISH RESPONSE:",
      JSON.stringify(data, null, 2),
    );

    if (
      response.ok &&
      typeof data?.id === "string" &&
      data.id.length > 0
    ) {
      console.log(
        "INSTAGRAM PUBLISH SUCCESS:",
        {
          containerId,
          instagramMediaId: data.id,
          attempt,
        },
      );

      return String(data.id);
    }

    const errorCode =
      Number(data?.error?.code);

    const errorSubcode =
      Number(data?.error?.error_subcode);

    const mediaNotReady =
      errorCode === 9007 &&
      errorSubcode === 2207027;

    if (mediaNotReady) {
      console.warn(
        "INSTAGRAM MEDIA NOT READY FOR PUBLISH:",
        {
          containerId,
          attempt,
          maxAttempts,
          errorCode,
          errorSubcode,
          message: data?.error?.message,
        },
      );

      if (attempt < maxAttempts) {
        continue;
      }

      throw new Error(
        "Instagram media was not ready for publishing after multiple retries.",
      );
    }

    throw new Error(
      data?.error?.message ||
        data?.message ||
        `Instagram publish failed with HTTP ${response.status}: ${JSON.stringify(data)}`,
    );
  }

  throw new Error(
    lastData?.error?.message ||
      "Instagram publish failed after multiple attempts.",
  );
}

/*
 * ============================================================
 * PROCESS ONE SCHEDULED POST
 * ============================================================
 */

async function processScheduledPost(
  supabase: ReturnType<
    typeof createAdminClient
  >,
  post: ScheduledPost,
) {
  console.log(
    "================================================",
  );

  console.log(
    "PROCESSING SCHEDULED POST:",
    {
      id: post.id,
      accountId:
        post.instagram_account_id,
      scheduledAt:
        post.scheduled_at,
      mediaType:
        post.media_type,
      postType:
        post.post_type,
      automationId:
        post.automation_id,
    },
  );

  /*
   * ==========================================================
   * GET INSTAGRAM ACCOUNT
   * ==========================================================
   */

  const {
    data: account,
    error: accountError,
  } = await supabase
    .from("instagram_accounts")
    .select(
      `
        id,
        user_id,
        instagram_user_id,
        access_token,
        is_connected
      `,
    )
    .eq(
      "id",
      post.instagram_account_id,
    )
    .eq(
      "user_id",
      post.user_id,
    )
    .maybeSingle();

  if (accountError) {
    throw new Error(
      `Failed to load Instagram account: ${accountError.message}`,
    );
  }

  if (!account) {
    throw new Error(
      "Instagram account not found.",
    );
  }

  if (!account.is_connected) {
    throw new Error(
      "Instagram account is not connected.",
    );
  }

  /*
   * ==========================================================
   * REFRESH TOKEN
   * ==========================================================
   *
   * IMPORTANT:
   *
   * refreshAccountIfNeeded() returns an object containing
   * accessToken, NOT a complete InstagramAccount object.
   *
   * Therefore we construct the object explicitly here.
   */

  const refreshedAccount =
    await refreshAccountIfNeeded(
      account,
    );

  const instagramAccount: InstagramAccount =
    {
      id: account.id,

      user_id:
        account.user_id,

      instagram_user_id:
        account.instagram_user_id,

      access_token:
        refreshedAccount.accessToken,

      is_connected:
        account.is_connected,
    };

  /*
   * ==========================================================
   * DETERMINE POST TYPE
   * ==========================================================
   */

  const mediaType = String(post.media_type || "").toLowerCase();
  const postType = String(post.post_type || "").toLowerCase();
  const mediaItems = getScheduledMediaItems(post);
  const isVideo = mediaItems.some((item) => String(item.type).toLowerCase() === "video");
  const isImage = mediaItems.every((item) => String(item.type).toLowerCase() === "image");
  const isCarousel = mediaItems.length > 1;
  const requestedReel = postType === "reel" || postType === "reels";

  /*
   * ==========================================================
   * VALIDATE MEDIA / POST TYPE
   * ==========================================================
   *
   * Instagram Reels require video media.
   * Images must be published through the image-post flow.
   *
   * Do NOT infer "Reel" from the post_type alone. An invalid
   * combination such as:
   *
   *   media_type = image
   *   post_type  = reel
   *
   * would otherwise send a JPEG as video_url and Instagram
   * would create an ERROR media container.
   *
   * Keep this validation in the cron as a second safety layer
   * even if the scheduler API validates the same combination.
   */

  if (mediaItems.length < 1 || mediaItems.length > 10) {
    throw new Error("Scheduled media must contain between 1 and 10 items.");
  }

  if (isCarousel && (!isImage || isVideo)) {
    throw new Error("Carousel posts can contain only images.");
  }

  if (isCarousel && requestedReel) {
    throw new Error("A carousel must be published as a Post, not a Reel.");
  }

  if (requestedReel && !isVideo) {
    throw new Error(
      `Invalid scheduled post: post_type "${post.post_type}" requires video media.`,
    );
  }

  if (requestedReel && mediaItems.length !== 1) {
    throw new Error("A Reel must contain exactly one video.");
  }

  if (isImage && requestedReel) {
    throw new Error("Invalid scheduled post: an image cannot be published as a Reel.");
  }

  const isReel = isVideo;

  /*
   * ==========================================================
   * CREATE INSTAGRAM CONTAINER
   * ==========================================================
   */

  let containerId: string;

  if (isCarousel) {
    containerId = await createCarouselContainer(
      instagramAccount,
      post,
      mediaItems,
    );
  } else if (isReel) {
    const reelPost = {
      ...post,
      media_url: mediaItems[0].url,
      media_type: "video",
    };
    containerId = await createReelContainer(instagramAccount, reelPost);
  } else {
    const imagePost = {
      ...post,
      media_url: mediaItems[0].url,
      media_type: "image",
    };
    containerId = await createImageContainer(instagramAccount, imagePost);
  }

  console.log(
    "INSTAGRAM CONTAINER CREATED:",
    {
      scheduledPostId:
        post.id,
      containerId,
    },
  );

  /*
   * ==========================================================
   * WAIT FOR VIDEO PROCESSING
   * ==========================================================
   */

  /*
   * Instagram image containers can also need time to become
   * publishable. Waiting only for Reels is not sufficient and can
   * cause media_publish to return 9007 / 2207027.
   *
   * Wait for every container before media_publish.
   */
  await waitForContainer(
    containerId,
    instagramAccount.access_token,
  );

  /*
   * ==========================================================
   * PUBLISH TO INSTAGRAM
   * ==========================================================
   */

  const instagramMediaId =
    await publishContainer(
      instagramAccount,
      containerId,
    );

  console.log(
    "INSTAGRAM POST PUBLISHED:",
    {
      scheduledPostId:
        post.id,
      instagramMediaId,
    },
  );

  /*
   * ==========================================================
   * UPDATE SCHEDULED POST
   * ==========================================================
   */

  const {
    data: updatedPost,
    error:
      scheduledUpdateError,
  } = await supabase
    .from("scheduled_posts")
    .update({
      status: "published",

      instagram_media_id:
        instagramMediaId,

      published_at:
        new Date().toISOString(),

      error_message:
        null,
    })
    .eq(
      "id",
      post.id,
    )
    .eq(
      "user_id",
      post.user_id,
    )
    .select(
      `
        id,
        instagram_account_id,
        media_url,
        media_type,
        post_type,
        caption,
        scheduled_at,
        timezone,
        automation_enabled,
        automation_id,
        instagram_media_id,
        status,
        published_at
      `,
    )
    .single();

  if (scheduledUpdateError) {
    throw new Error(
      `Instagram published successfully, but scheduled_posts could not be updated: ${scheduledUpdateError.message}`,
    );
  }

  /*
   * ==========================================================
   * SAVE PUBLISHED INSTAGRAM POST
   * ==========================================================
   *
   * instagramMediaId is Instagram's external media ID.
   * The automation relationship must instead use the UUID from
   * instagram_posts.id.
   */

  const {
    data: instagramPost,
    error: instagramPostError,
  } = await supabase
    .from("instagram_posts")
    .upsert(
      {
        instagram_account_id:
          post.instagram_account_id,

        instagram_media_id:
          instagramMediaId,

        caption:
          post.caption,

        media_url:
          post.media_url,

        media_type:
          post.media_type,

        published_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "instagram_account_id,instagram_media_id",
      },
    )
    .select(
      "id, instagram_media_id, instagram_account_id",
    )
    .single();

  if (instagramPostError) {
    console.error(
      "INSTAGRAM POST DB SAVE ERROR:",
      instagramPostError,
    );
  }

  /*
   * ==========================================================
   * ACTIVATE LINKED AUTOMATION
   * ==========================================================
   *
   * IMPORTANT: instagram_automations.instagram_post_id is a
   * foreign-key-style relationship to instagram_posts.id.
   * Never store instagramMediaId here.
   */

  if (
    post.automation_enabled &&
    post.automation_id
  ) {
    if (!instagramPost?.id) {
      console.error(
        "AUTOMATION NOT ACTIVATED: instagram_posts UUID is missing.",
        {
          automationId: post.automation_id,
          scheduledPostId: post.id,
          instagramMediaId,
        },
      );
    } else {
      const {
        data: automation,
        error: automationLookupError,
      } = await supabase
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
        .eq("id", post.automation_id)
        .eq("user_id", post.user_id)
        .eq(
          "instagram_account_id",
          post.instagram_account_id,
        )
        .maybeSingle();

      if (automationLookupError) {
        console.error(
          "AUTOMATION LOOKUP AFTER PUBLISH ERROR:",
          automationLookupError,
        );
      } else if (!automation) {
        console.error(
          "LINKED AUTOMATION NOT FOUND:",
          {
            automationId: post.automation_id,
            scheduledPostId: post.id,
          },
        );
      } else {
        const {
          error: automationUpdateError,
        } = await supabase
          .from("instagram_automations")
          .update({
            instagram_post_id:
              instagramPost.id,
            is_active: true,
          })
          .eq("id", automation.id)
          .eq("user_id", post.user_id);

        if (automationUpdateError) {
          console.error(
            "AUTOMATION ACTIVATION ERROR:",
            automationUpdateError,
          );
        } else {
          console.log(
            "AUTOMATION ACTIVATED:",
            {
              automationId: automation.id,
              instagramPostId: instagramPost.id,
              instagramMediaId,
            },
          );
        }
      }
    }
  }

  /*
   * ==========================================================
   * COMPLETE
   * ==========================================================
   */

  console.log(
    "SCHEDULED POST COMPLETE:",
    {
      scheduledPostId:
        post.id,

      instagramMediaId,

      automationId:
        post.automation_id,
    },
  );

  return updatedPost;
}

/*
 * ============================================================
 * GET /api/cron/scheduled-posts
 * ============================================================
 *
 * Finds scheduled posts whose scheduled_at has arrived.
 *
 * This endpoint is intended to be called by your cron service.
 */

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (configuredSecret && authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const supabase =
      createAdminClient();

    /*
     * ==========================================================
     * CURRENT TIME
     * ==========================================================
     */

    const now =
      new Date().toISOString();

    /*
     * ==========================================================
     * FIND DUE POSTS
     * ==========================================================
     */

    /*
     * IMPORTANT:
     *
     * We intentionally apply the due-time filter first and then
     * filter status / instagram_media_id in JavaScript.
     *
     * This makes the cron easier to diagnose and avoids a situation
     * where one PostgREST filter silently excludes a row that is
     * demonstrably due in Supabase.
     */

    const {
      data: dueCandidates,
      error:
        scheduledPostsError,
    } = await supabase
      .from("scheduled_posts")
      .select(
        `
          id,
          user_id,
          instagram_account_id,
          media_url,
          media_type,
          media_items,
          post_type,
          caption,
          scheduled_at,
          timezone,
          automation_enabled,
          automation_id,
          instagram_media_id,
          status
        `,
      )
      .lte(
        "scheduled_at",
        now,
      )
      .order(
        "scheduled_at",
        {
          ascending: true,
        },
      )
      .limit(50);

    if (scheduledPostsError) {
      console.error(
        "SCHEDULED POSTS QUERY ERROR:",
        scheduledPostsError,
      );

      return jsonError(
        "Failed to load scheduled posts.",
        500,
        scheduledPostsError.message,
      );
    }

    const scheduledPosts = (
      dueCandidates ?? []
    ).filter(
      (post) =>
        String(post.status ?? "")
          .trim()
          .toLowerCase() ===
          "scheduled" &&
        post.instagram_media_id == null,
    );

    console.log(
      "SCHEDULED POSTS SELECTION DEBUG:",
      JSON.stringify(
        {
          now,
          candidateCount:
            dueCandidates?.length ?? 0,
          dueScheduledCount:
            scheduledPosts.length,
          candidates:
            (dueCandidates ?? []).map(
              (post) => ({
                id: post.id,
                status: post.status,
                scheduled_at:
                  post.scheduled_at,
                instagram_media_id:
                  post.instagram_media_id,
              }),
            ),
          supabaseHost:
            process.env.NEXT_PUBLIC_SUPABASE_URL
              ? new URL(
                  process.env.NEXT_PUBLIC_SUPABASE_URL,
                ).host
              : null,
        },
        null,
        2,
      ),
    );

    /*
     * ==========================================================
     * NOTHING TO PROCESS
     * ==========================================================
     */

    if (scheduledPosts.length === 0) {
      return NextResponse.json({
        success: true,

        processed: 0,

        published: 0,

        failed: 0,

        message:
          "No scheduled posts are due.",

        /*
         * These debug values make it immediately clear whether
         * Next.js is seeing the same Supabase data as the SQL
         * editor. They contain no secret credentials.
         */
        debug: {
          now,
          candidateCount:
            dueCandidates?.length ?? 0,
          supabaseHost:
            process.env.NEXT_PUBLIC_SUPABASE_URL
              ? new URL(
                  process.env.NEXT_PUBLIC_SUPABASE_URL,
                ).host
              : null,
        },

        durationMs:
          Date.now() -
          startedAt,
      });
    }

    console.log(
      "DUE SCHEDULED POSTS:",
      scheduledPosts.length,
    );

    /*
     * ==========================================================
     * RESULTS
     * ==========================================================
     */

    const results: Array<{
      id: string;
      success: boolean;
      instagramMediaId?: string;
      error?: string;
    }> = [];

    /*
     * ==========================================================
     * PROCESS EACH POST
     * ==========================================================
     */

    for (
      const post of scheduledPosts
    ) {
      try {
        /*
         * ------------------------------------------------------
         * RE-CHECK POST BEFORE PUBLISHING
         * ------------------------------------------------------
         *
         * This protects against a post being deleted or
         * cancelled while the cron job is running.
         */

        const {
          data: currentPost,
          error: currentPostError,
        } = await supabase
          .from("scheduled_posts")
          .update({
            status: "publishing",
            error_message: null,
          })
          .eq("id", post.id)
          .eq("status", "scheduled")
          .is("instagram_media_id", null)
          .select(
            `
              id,
              user_id,
              instagram_account_id,
              media_url,
              media_type,
              media_items,
              post_type,
              caption,
              scheduled_at,
              timezone,
              automation_enabled,
              automation_id,
              instagram_media_id,
              status
            `,
          )
          .maybeSingle();

        if (currentPostError) {
          throw new Error(currentPostError.message);
        }

        if (!currentPost) {
          console.log(
            "SKIPPING POST BECAUSE ANOTHER WORKER CLAIMED IT OR IT IS NO LONGER SCHEDULED:",
            post.id,
          );
          continue;
        }

        /*
         * ------------------------------------------------------
         * PUBLISH
         * ------------------------------------------------------
         */

        const published =
          await processScheduledPost(
            supabase,
            currentPost as ScheduledPost,
          );

        results.push({
          id: post.id,

          success: true,

          instagramMediaId:
            published?.instagram_media_id ??
            undefined,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        console.error(
          "SCHEDULED POST FAILED:",
          {
            id: post.id,
            error,
          },
        );

        /*
         * ------------------------------------------------------
         * SAVE ERROR
         * ------------------------------------------------------
         *
         * We leave status as "scheduled" so that the next cron
         * execution can retry the post.
         */

        await supabase
          .from("scheduled_posts")
          .update({
            status: "scheduled",
            error_message: message,
          })
          .eq("id", post.id)
          .eq("status", "publishing");

        results.push({
          id: post.id,

          success: false,

          error: message,
        });
      }
    }

    /*
     * ==========================================================
     * SUMMARY
     * ==========================================================
     */

    const published =
      results.filter(
        (result) =>
          result.success,
      ).length;

    const failed =
      results.filter(
        (result) =>
          !result.success,
      ).length;

    return NextResponse.json({
      success: true,

      processed:
        results.length,

      published,

      failed,

      results,

      durationMs:
        Date.now() -
        startedAt,
    });
  } catch (error) {
    console.error(
      "SCHEDULED POSTS CRON ERROR:",
      error,
    );

    return jsonError(
      error instanceof Error
        ? error.message
        : "Scheduled post cron failed.",
      500,
    );
  }
}