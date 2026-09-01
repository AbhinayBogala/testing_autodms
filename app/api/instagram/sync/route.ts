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
  const syncStartedAt = Date.now();

  try {
    // =========================================================
    // AUTHENTICATION
    // =========================================================

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

    // =========================================================
    // LOAD ACTIVE INSTAGRAM ACCOUNT
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

    let accessToken = account.access_token;

    let refreshedToken = false;

    let refreshError: string | null = null;

    try {
      const fresh =
        await refreshAccountIfNeeded(account);

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

      // Keep using the current token.
      accessToken = account.access_token;
    }

    // =========================================================
    // ADMIN CLIENT
    // =========================================================

    const admin = createAdminClient();

    // =========================================================
    // 1. FETCH INSTAGRAM ACCOUNT STATISTICS
    // =========================================================

    const profileUrl =
      new URL(
        graphUrl("me")
      );

    profileUrl.searchParams.set(
      "fields",
      [
        "id",
        "username",
        "profile_picture_url",
        "followers_count",
        "follows_count",
        "media_count",
      ].join(",")
    );

    profileUrl.searchParams.set(
      "access_token",
      accessToken
    );

    // =========================================================
    // 2. FETCH FIRST MEDIA PAGE IN PARALLEL
    // =========================================================

    const mediaUrl =
      new URL(
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
      "100"
    );

    const [profileResponse, firstMediaResponse] =
      await Promise.all([
        fetch(
          profileUrl.toString(),
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
            cache: "no-store",
          }
        ),

        fetch(
          mediaUrl.toString(),
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
            cache: "no-store",
          }
        ),
      ]);

    const profileData =
      await readJson(profileResponse);

    const firstMediaData =
      await readJson(firstMediaResponse);

    // =========================================================
    // PROFILE API ERROR
    // =========================================================

    if (!profileResponse.ok) {
      console.error(
        "INSTAGRAM PROFILE FETCH FAILED:",
        profileData
      );

      if (
        isInstagramTokenError(
          profileData
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Instagram connection expired. Please reconnect Instagram.",
            reconnectRequired: true,
            details: profileData,
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
            profileData?.error?.message ||
            profileData?.message ||
            "Failed to fetch Instagram account information",

          details: profileData,

          refreshError,
        },
        {
          status: 400,
        }
      );
    }

    // =========================================================
    // MEDIA API ERROR
    // =========================================================

    if (
      !firstMediaResponse.ok ||
      !Array.isArray(
        firstMediaData?.data
      )
    ) {
      console.error(
        "INSTAGRAM MEDIA FETCH FAILED:",
        firstMediaData
      );

      if (
        isInstagramTokenError(
          firstMediaData
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Instagram connection expired. Please reconnect Instagram.",
            reconnectRequired: true,
            details: firstMediaData,
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
            firstMediaData?.error?.message ||
            firstMediaData?.message ||
            "Failed to fetch Instagram media",

          details: firstMediaData,

          refreshError,
        },
        {
          status: 400,
        }
      );
    }

    // =========================================================
    // 3. UPDATE ACCOUNT STATISTICS
    // =========================================================

    const {
      error: accountUpdateError,
    } = await admin
      .from("instagram_accounts")
      .update({
        username:
          profileData.username ??
          null,

        profile_picture_url:
          profileData.profile_picture_url ??
          null,

        followers_count:
          profileData.followers_count ??
          0,

        following_count:
          profileData.follows_count ??
          0,

        media_count:
          profileData.media_count ??
          0,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        account.id
      );

    if (accountUpdateError) {
      console.error(
        "FAILED TO UPDATE INSTAGRAM ACCOUNT STATS:",
        accountUpdateError
      );

      return NextResponse.json(
        {
          error:
            "Failed to update Instagram account statistics",

          details:
            accountUpdateError.message,
        },
        {
          status: 500,
        }
      );
    }

    console.log(
      "INSTAGRAM ACCOUNT STATS UPDATED:",
      {
        username:
          profileData.username,

        followers:
          profileData.followers_count,

        following:
          profileData.follows_count,

        media:
          profileData.media_count,
      }
    );

    // =========================================================
    // 4. COLLECT ALL POSTS
    // =========================================================

    type InstagramPost = {
      instagram_account_id: string;
      instagram_media_id: string;
      caption: string | null;
      media_type: string | null;
      media_url: string | null;
      permalink: string | null;
      published_at: string | null;
      likes_count: number;
      comments_count: number;
      updated_at: string;
    };

    const posts: InstagramPost[] = [];

    let currentMediaData =
      firstMediaData;

    let nextMediaUrl: string | null =
      currentMediaData?.paging?.next
        ? String(
            currentMediaData.paging.next
          )
        : null;

    let pagesFetched = 1;

    // ---------------------------------------------------------
    // ADD FIRST PAGE
    // ---------------------------------------------------------

    for (
      const media of currentMediaData.data
    ) {
      const instagramMediaId =
        String(media.id);

      posts.push({
        instagram_account_id:
          account.id,

        instagram_media_id:
          instagramMediaId,

        caption:
          media.caption ??
          null,

        media_type:
          media.media_type ??
          null,

        media_url:
          media.media_url ??
          media.thumbnail_url ??
          null,

        permalink:
          media.permalink ??
          null,

        published_at:
          media.timestamp
            ? new Date(
                media.timestamp
              ).toISOString()
            : null,

        likes_count:
          media.like_count ??
          0,

        comments_count:
          media.comments_count ??
          0,

        updated_at:
          new Date().toISOString(),
      });
    }

    // =========================================================
    // 5. FOLLOW PAGINATION
    // =========================================================

    while (nextMediaUrl) {
      const currentUrl =
        nextMediaUrl;

      const mediaResponse =
        await fetch(
          currentUrl,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
            cache: "no-store",
          }
        );

      const mediaData =
        await readJson(
          mediaResponse
        );

      if (
        !mediaResponse.ok ||
        !Array.isArray(
          mediaData?.data
        )
      ) {
        console.error(
          "INSTAGRAM MEDIA PAGINATION FAILED:",
          mediaData
        );

        if (
          isInstagramTokenError(
            mediaData
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Instagram connection expired. Please reconnect Instagram.",

              reconnectRequired:
                true,

              details:
                mediaData,

              refreshError,

              postsCollectedBeforeFailure:
                posts.length,
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
              "Failed while fetching Instagram posts",

            details:
              mediaData,

            refreshError,

            postsCollectedBeforeFailure:
              posts.length,
          },
          {
            status: 400,
          }
        );
      }

      pagesFetched++;

      for (
        const media of mediaData.data
      ) {
        const instagramMediaId =
          String(media.id);

        posts.push({
          instagram_account_id:
            account.id,

          instagram_media_id:
            instagramMediaId,

          caption:
            media.caption ??
            null,

          media_type:
            media.media_type ??
            null,

          media_url:
            media.media_url ??
            media.thumbnail_url ??
            null,

          permalink:
            media.permalink ??
            null,

          published_at:
            media.timestamp
              ? new Date(
                  media.timestamp
                ).toISOString()
              : null,

          likes_count:
            media.like_count ??
            0,

          comments_count:
            media.comments_count ??
            0,

          updated_at:
            new Date().toISOString(),
        });
      }

      nextMediaUrl =
        mediaData?.paging?.next
          ? String(
              mediaData.paging.next
            )
          : null;
    }

    // =========================================================
    // 6. BULK UPSERT POSTS
    // =========================================================
    //
    // IMPORTANT:
    //
    // Existing posts are UPDATED.
    // New posts are INSERTED.
    //
    // Existing instagram_posts.id values are preserved.
    //
    // NOTHING IS DELETED HERE.
    //
    // =========================================================

    let synced = 0;

    if (posts.length > 0) {
      const {
        data: savedPosts,
        error: bulkUpsertError,
      } = await admin
        .from("instagram_posts")
        .upsert(
          posts,
          {
            onConflict:
              "instagram_account_id,instagram_media_id",
          }
        )
        .select("id");

      if (bulkUpsertError) {
        console.error(
          "INSTAGRAM BULK POST UPSERT FAILED:",
          bulkUpsertError
        );

        return NextResponse.json(
          {
            success: false,

            error:
              "Failed to save Instagram posts",

            details:
              bulkUpsertError.message,

            totalPostsFetched:
              posts.length,

            pagesFetched,

            refreshedToken,

            refreshError,
          },
          {
            status: 500,
          }
        );
      }

      synced =
        savedPosts?.length ??
        posts.length;
    }

    // =========================================================
    // 7. RECONCILE DELETED INSTAGRAM POSTS / REELS
    // =========================================================
    //
    // IMPORTANT:
    // This runs ONLY after the complete Instagram pagination
    // finished successfully.
    //
    // If a post/reel is no longer returned by Instagram, it is
    // considered deleted from Instagram and is removed locally.
    //
    // Before deleting the instagram_posts row, we unlink any
    // instagram_automations that point to it. The automation
    // itself is NEVER deleted.
    //
    // analytics_events uses ON DELETE SET NULL, so historical
    // analytics remain safe.
    //
    // =========================================================

    const fetchedMediaIds = new Set(
      posts.map(
        (post) => post.instagram_media_id
      )
    );

    const {
      data: existingPosts,
      error: existingPostsError,
    } = await admin
      .from("instagram_posts")
      .select(
        "id, instagram_media_id"
      )
      .eq(
        "instagram_account_id",
        account.id
      );

    if (existingPostsError) {
      console.error(
        "FAILED TO LOAD EXISTING INSTAGRAM POSTS:",
        existingPostsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to compare existing Instagram posts",
          details:
            existingPostsError.message,
          refreshError,
        },
        {
          status: 500,
        }
      );
    }

    const deletedPosts =
      (existingPosts ?? []).filter(
        (existingPost) =>
          !fetchedMediaIds.has(
            String(
              existingPost.instagram_media_id
            )
          )
      );

    let deletedPostsCount = 0;
    let unlinkedAutomationsCount = 0;

    if (deletedPosts.length > 0) {
      const deletedPostIds =
        deletedPosts.map(
          (post) => post.id
        );

      // ---------------------------------------------------------
      // UNLINK AUTOMATIONS FIRST
      // ---------------------------------------------------------
      //
      // Do NOT delete the automation.
      // Only remove its connection to the deleted post.
      //
      const {
        data: unlinkedAutomations,
        error: unlinkAutomationError,
      } = await admin
        .from("instagram_automations")
        .update({
          instagram_post_id: null,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "instagram_account_id",
          account.id
        )
        .in(
          "instagram_post_id",
          deletedPostIds
        )
        .select("id");

      if (unlinkAutomationError) {
        console.error(
          "FAILED TO UNLINK AUTOMATIONS FROM DELETED POSTS:",
          unlinkAutomationError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Failed to safely unlink automations from deleted Instagram posts",
            details:
              unlinkAutomationError.message,
            refreshError,
          },
          {
            status: 500,
          }
        );
      }

      unlinkedAutomationsCount =
        unlinkedAutomations?.length ?? 0;

      // ---------------------------------------------------------
      // DELETE LOCAL POST ROWS
      // ---------------------------------------------------------
      //
      // automation_posts, if present, will follow its database
      // foreign-key behavior. analytics_events will keep the
      // historical event and set instagram_post_id to NULL.
      //
      const {
        data: deletedRows,
        error: deletePostsError,
      } = await admin
        .from("instagram_posts")
        .delete()
        .eq(
          "instagram_account_id",
          account.id
        )
        .in(
          "id",
          deletedPostIds
        )
        .select("id");

      if (deletePostsError) {
        console.error(
          "FAILED TO DELETE DELETED INSTAGRAM POSTS:",
          deletePostsError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Failed to remove deleted Instagram posts",
            details:
              deletePostsError.message,
            refreshError,
            unlinkedAutomations:
              unlinkedAutomationsCount,
          },
          {
            status: 500,
          }
        );
      }

      deletedPostsCount =
        deletedRows?.length ?? 0;

      console.log(
        "DELETED INSTAGRAM POSTS RECONCILED:",
        {
          accountId: account.id,
          deletedPosts:
            deletedPostsCount,
          unlinkedAutomations:
            unlinkedAutomationsCount,
        }
      );
    }

    // =========================================================
    // 8. SYNC RESULT
    // =========================================================

    const syncDurationMs =
      Date.now() -
      syncStartedAt;

    const syncDurationSeconds =
      Number(
        (
          syncDurationMs /
          1000
        ).toFixed(2)
      );

    // =========================================================
    // SUCCESS
    // =========================================================

    console.log(
      "========================================"
    );

    console.log(
      "INSTAGRAM SYNC COMPLETED"
    );

    console.log({
      accountId:
        account.id,

      username:
        profileData.username,

      followers:
        profileData.followers_count,

      following:
        profileData.follows_count,

      instagramMediaCount:
        profileData.media_count,

      postsFetched:
        posts.length,

      postsSynced:
        synced,

      deletedPosts:
        deletedPostsCount,

      unlinkedAutomations:
        unlinkedAutomationsCount,

      pagesFetched,

      durationMs:
        syncDurationMs,

      durationSeconds:
        syncDurationSeconds,

      refreshedToken,

      refreshError,
    });

    console.log(
      "========================================"
    );

    return NextResponse.json({
      success: true,

      // Account statistics
      account: {
        username:
          profileData.username ??
          null,

        followers:
          profileData.followers_count ??
          0,

        following:
          profileData.follows_count ??
          0,

        mediaCount:
          profileData.media_count ??
          0,
      },

      // Post sync
      synced,

      totalPostsFetched:
        posts.length,

      pagesFetched,

      // Reconciliation
      deletedPosts:
        deletedPostsCount,

      unlinkedAutomations:
        unlinkedAutomationsCount,

      commentsSynced: 0,

      repliesSynced: 0,

      // Token information
      refreshedToken,

      refreshError,

      // Performance
      syncDurationMs,

      syncDurationSeconds,

      // Compatibility
      errors: [],
    });
  } catch (error) {
    const syncDurationMs =
      Date.now() -
      syncStartedAt;

    console.error(
      "INSTAGRAM SYNC ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Instagram sync failed",

        syncDurationMs,
      },
      {
        status: 500,
      }
    );
  }
}