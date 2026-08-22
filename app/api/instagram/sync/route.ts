import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  graphUrl,
  readJson,
  refreshAccountIfNeeded,
  isInstagramTokenError,
} from "@/lib/instagram";

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // =========================================================
    // AUTHENTICATION
    // =========================================================

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

    // =========================================================
    // LOAD INSTAGRAM ACCOUNT
    // =========================================================

    const {
      data: account,
      error: accountError,
    } = await supabase
      .from("instagram_accounts")
      .select(
        "id, instagram_user_id, access_token, token_issued_at, token_expires_at, is_connected"
      )
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .maybeSingle();

    if (accountError) {
      console.error(
        "FAILED TO LOAD INSTAGRAM ACCOUNT:",
        accountError
      );

      return NextResponse.json(
        {
          error: "Failed to load Instagram account",
          details: accountError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!account) {
      return NextResponse.json(
        {
          error: "No connected Instagram account",
          reconnectRequired: true,
        },
        {
          status: 404,
        }
      );
    }

    if (!account.access_token) {
      return NextResponse.json(
        {
          error: "Instagram access token is missing",
          reconnectRequired: true,
        },
        {
          status: 401,
        }
      );
    }

    // =========================================================
    // TOKEN REFRESH
    // =========================================================
    //
    // IMPORTANT:
    // Do NOT automatically tell the user to reconnect if the
    // refresh function throws.
    //
    // The existing token may still be valid.
    // We will let Instagram itself determine that below.
    // =========================================================

    let accessToken = account.access_token;

    let refreshedToken = false;

    let refreshError: string | null = null;

    try {
      const fresh = await refreshAccountIfNeeded(account);

      accessToken = fresh.accessToken;

      refreshedToken = fresh.refreshed;

      console.log(
        "INSTAGRAM TOKEN CHECK:",
        {
          accountId: account.id,
          refreshed: fresh.refreshed,
          expiresAt: fresh.expiresAt,
        }
      );
    } catch (error) {
      refreshError =
        error instanceof Error
          ? error.message
          : "Unknown token refresh error";

      console.error(
        "INSTAGRAM TOKEN REFRESH FAILED:",
        {
          accountId: account.id,
          error: refreshError,
        }
      );

      // IMPORTANT:
      // Do NOT return reconnectRequired here.
      //
      // We continue with the current token and let Instagram
      // validate it through the actual API request.
      accessToken = account.access_token;
    }

    // =========================================================
    // INSTAGRAM API
    // =========================================================

    const admin = createAdminClient();

    const mediaUrl = new URL(
      graphUrl("me/media")
    );

    mediaUrl.searchParams.set(
      "fields",
      [
        "id",
        "caption",
        "media_type",
        "media_url",
        "thumbnail_url",
        "permalink",
        "timestamp",
        "like_count",
        "comments_count",
      ].join(",")
    );

    mediaUrl.searchParams.set(
      "limit",
      "50"
    );

    const mediaResponse = await fetch(
      mediaUrl.toString(),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    const mediaData = await readJson(
      mediaResponse
    );

    // =========================================================
    // REAL TOKEN ERROR
    // =========================================================
    //
    // Only here do we tell the user to reconnect.
    // This means Instagram itself rejected the token.
    // =========================================================

    if (
      !mediaResponse.ok ||
      !Array.isArray(mediaData?.data)
    ) {
      if (isInstagramTokenError(mediaData)) {
        console.error(
          "INSTAGRAM TOKEN REJECTED BY API:",
          {
            accountId: account.id,
            response: mediaData,
          }
        );

        return NextResponse.json(
          {
            error:
              "Instagram connection expired. Please reconnect Instagram.",
            reconnectRequired: true,
            details: mediaData,
            refreshError,
          },
          {
            status: 401,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            mediaData?.error?.message ||
            mediaData?.message ||
            "Failed to fetch Instagram media",

          details: mediaData,

          refreshError,
        },
        {
          status: 400,
        }
      );
    }

    // =========================================================
    // SYNC POSTS + COMMENTS
    // =========================================================

    let synced = 0;

    let commentsSynced = 0;

    let replyCommentsSynced = 0;

    const errors: string[] = [];

    for (const media of mediaData.data) {
      const instagramMediaId =
        String(media.id);

      // -------------------------------------------------------
      // SAVE POST
      // -------------------------------------------------------

      const {
        data: savedPost,
        error: postError,
      } = await admin
        .from("instagram_posts")
        .upsert(
          {
            instagram_account_id:
              account.id,

            instagram_media_id:
              instagramMediaId,

            caption:
              media.caption ?? null,

            media_type:
              media.media_type ?? null,

            media_url:
              media.media_url ??
              media.thumbnail_url ??
              null,

            permalink:
              media.permalink ?? null,

            published_at:
              media.timestamp
                ? new Date(
                    media.timestamp
                  ).toISOString()
                : null,

            likes_count:
              media.like_count ?? 0,

            comments_count:
              media.comments_count ?? 0,

            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "instagram_account_id,instagram_media_id",
          }
        )
        .select("id")
        .single();

      if (
        postError ||
        !savedPost
      ) {
        errors.push(
          `Post ${instagramMediaId}: ${
            postError?.message ||
            "could not save"
          }`
        );

        continue;
      }

      synced++;

      // -------------------------------------------------------
      // SYNC COMMENTS
      // -------------------------------------------------------

      const result =
        await syncCommentPage({
          accountId: account.id,

          postId: savedPost.id,

          mediaId: instagramMediaId,

          accessToken,

          admin,
        });

      commentsSynced +=
        result.comments;

      replyCommentsSynced +=
        result.replies;

      errors.push(
        ...result.errors
      );
    }

    // =========================================================
    // SUCCESS
    // =========================================================

    return NextResponse.json({
      success: true,

      synced,

      comments:
        commentsSynced,

      replies:
        replyCommentsSynced,

      errors:
        errors.slice(0, 20),

      refreshedToken:
        refreshedToken,

      // Useful for debugging.
      // This does NOT mean reconnect is required.
      refreshError,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM SYNC ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Instagram sync failed",
      },
      {
        status: 500,
      }
    );
  }
}


// =============================================================
// COMMENT SYNC
// =============================================================

async function syncCommentPage({
  accountId,
  postId,
  mediaId,
  accessToken,
  admin,
}: {
  accountId: string;

  postId: string;

  mediaId: string;

  accessToken: string;

  admin: ReturnType<
    typeof createAdminClient
  >;
}) {
  let comments = 0;

  let replies = 0;

  const errors: string[] = [];

  let nextUrl: string | null =
    null;

  let first = true;

  let pageCount = 0;

  do {
    pageCount++;

    if (pageCount > 10) {
      break;
    }

    const url = nextUrl
      ? new URL(nextUrl)
      : new URL(
          graphUrl(
            `${mediaId}/comments`
          )
        );

    if (first) {
      url.searchParams.set(
        "fields",
        "id,from,text,timestamp,parent_id"
      );

      url.searchParams.set(
        "limit",
        "100"
      );

      first = false;
    }

    const response = await fetch(
      url.toString(),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },

        cache: "no-store",
      }
    );

    const data =
      await readJson(response);

    if (
      !response.ok ||
      !Array.isArray(data?.data)
    ) {
      errors.push(
        `Comments for ${mediaId}: ${
          data?.error?.message ||
          data?.message ||
          "fetch failed"
        }`
      );

      break;
    }

    for (const comment of data.data) {
      const saved =
        await saveComment(
          admin,
          {
            accountId,

            postId,

            commentId:
              String(comment.id),

            commenterId:
              comment?.from?.id
                ? String(
                    comment.from.id
                  )
                : null,

            commenterUsername:
              comment?.from
                ?.username ?? null,

            text:
              comment?.text ?? null,

            parentId:
              comment?.parent_id
                ? String(
                    comment.parent_id
                  )
                : null,

            timestamp:
              comment?.timestamp,
          }
        );

      if (saved) {
        comments++;
      }

      // -------------------------------------------------------
      // FETCH REPLIES
      // -------------------------------------------------------

      const nested =
        await syncReplies({
          admin,

          accountId,

          postId,

          parentCommentId:
            String(comment.id),

          accessToken,

          depth: 0,
        });

      replies +=
        nested.count;

      errors.push(
        ...nested.errors
      );
    }

    nextUrl =
      data?.paging?.next ??
      null;
  } while (nextUrl);


  // =======================================================
  // REMOVE COMMENTS DELETED ON INSTAGRAM
  // =======================================================

  const { data: existingComments } = await admin
    .from("instagram_comments")
    .select("id, instagram_comment_id")
    .eq(
      "instagram_post_id",
      postId
    );


  if (existingComments) {

    const deletedCommentIds =
      existingComments
        .filter(
          (comment) =>
            !syncedCommentIds.includes(
              comment.instagram_comment_id
            )
        )
        .map(
          (comment) =>
            comment.id
        );


    if (deletedCommentIds.length > 0) {

      const { error } = await admin
        .from("instagram_comments")
        .delete()
        .in(
          "id",
          deletedCommentIds
        );


      if (error) {
        console.error(
          "DELETE OLD INSTAGRAM COMMENTS ERROR:",
          error
        );
      } else {
        console.log(
          "REMOVED DELETED COMMENTS:",
          deletedCommentIds
        );
      }
    }
  }


  return {
    comments,
    replies,
    errors,
  };
}


// =============================================================
// REPLY SYNC
// =============================================================

async function syncReplies({
  admin,
  accountId,
  postId,
  parentCommentId,
  accessToken,
  depth,
}: {
  admin: ReturnType<
    typeof createAdminClient
  >;

  accountId: string;

  postId: string;

  parentCommentId: string;

  accessToken: string;

  depth: number;
}): Promise<{
  count: number;
  errors: string[];
}> {
  if (depth >= 5) {
    return {
      count: 0,
      errors: [],
    };
  }

  let count = 0;

  const errors: string[] = [];

  let nextUrl: string | null =
    null;

  let first = true;

  let pages = 0;

  do {
    pages++;

    if (pages > 10) {
      break;
    }

    const url = nextUrl
      ? new URL(nextUrl)
      : new URL(
          graphUrl(
            `${parentCommentId}/replies`
          )
        );

    if (first) {
      url.searchParams.set(
        "fields",
        "id,from,text,timestamp,parent_id"
      );

      url.searchParams.set(
        "limit",
        "100"
      );

      first = false;
    }

    const response = await fetch(
      url.toString(),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },

        cache: "no-store",
      }
    );

    const data =
      await readJson(response);

    if (
      !response.ok ||
      !Array.isArray(data?.data)
    ) {
      // Some APIs can omit replies.
      // Don't fail the whole sync.

      if (!isInstagramTokenError(data)) {
        errors.push(
          `Replies for ${parentCommentId}: ${
            data?.error?.message ||
            data?.message ||
            "fetch failed"
          }`
        );
      }

      break;
    }

    for (const reply of data.data) {
      const replyId =
        String(reply.id);

      const saved =
        await saveComment(
          admin,
          {
            accountId,

            postId,

            commentId: replyId,

            commenterId:
              reply?.from?.id
                ? String(
                    reply.from.id
                  )
                : null,

            commenterUsername:
              reply?.from
                ?.username ?? null,

            text:
              reply?.text ?? null,

            parentId:
              reply?.parent_id
                ? String(
                    reply.parent_id
                  )
                : parentCommentId,

            timestamp:
              reply?.timestamp,
          }
        );

      if (saved) {
        count++;
      }

      const nested =
        await syncReplies({
          admin,

          accountId,

          postId,

          parentCommentId:
            replyId,

          accessToken,

          depth:
            depth + 1,
        });

      count +=
        nested.count;

      errors.push(
        ...nested.errors
      );
    }

    nextUrl =
      data?.paging?.next ??
      null;
  } while (nextUrl);

  return {
    count,

    errors,
  };
}


// =============================================================
// SAVE COMMENT
// =============================================================

async function saveComment(
  admin: ReturnType<
    typeof createAdminClient
  >,
  input: {
    accountId: string;

    postId: string;

    commentId: string;

    commenterId: string | null;

    commenterUsername: string | null;

    text: string | null;

    parentId: string | null;

    timestamp?: string;
  }
) {
  const {
    data: existing,
  } = await admin
    .from("instagram_comments")
    .select(
      "id, public_reply_sent, dm_sent"
    )
    .eq(
      "instagram_comment_id",
      input.commentId
    )
    .maybeSingle();

  const payload = {
    instagram_account_id:
      input.accountId,

    instagram_post_id:
      input.postId,

    instagram_comment_id:
      input.commentId,

    commenter_instagram_id:
      input.commenterId,

    commenter_username:
      input.commenterUsername,

    comment_text:
      input.text,

    parent_comment_id:
      input.parentId,

    created_at:
      input.timestamp
        ? new Date(
            input.timestamp
          ).toISOString()
        : new Date().toISOString(),
  };

  if (existing) {
    const { error } =
      await admin
        .from("instagram_comments")
        .update(payload)
        .eq(
          "id",
          existing.id
        );

    if (error) {
      console.error(
        "COMMENT UPDATE ERROR:",
        error
      );
    }

    return !error;
  }

  const { error } =
    await admin
      .from("instagram_comments")
      .insert(payload);

  if (error) {
    console.error(
      "COMMENT INSERT ERROR:",
      error
    );
  }

  return !error;
}