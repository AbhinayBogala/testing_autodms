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

    // =========================================================
    // AUTHENTICATION
    // =========================================================

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

    // Number of posts successfully saved/updated.
    let synced = 0;

    let refreshedToken = false;

    let refreshError: string | null = null;

    // IMPORTANT:
    // This array collects post-sync errors without stopping
    // the entire synchronization process.
    const errors: string[] = [];

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

      // Do NOT force reconnect here.
      // Continue with the existing token and allow
      // Instagram API to determine whether it is valid.

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

    // Ask Instagram for the maximum page size.
    // Pagination below continues until there is no next page.
    mediaUrl.searchParams.set(
      "limit",
      "100"
    );

    // =========================================================
    // FETCH ALL INSTAGRAM POSTS
    // =========================================================
    //
    // Instagram returns media using pagination.
    //
    // We continue following paging.next until there are
    // no more pages.
    //
    // IMPORTANT:
    // Manual sync fetches POSTS ONLY.
    // It does NOT fetch historical comments or replies.
    //
    // New comments should continue to be handled by
    // the Instagram webhook.
    // =========================================================

    let nextMediaUrl: string | null =
      mediaUrl.toString();

    let firstMediaRequest = true;

    const allSyncedMediaIds: string[] = [];

    let paginationComplete = true;

    while (nextMediaUrl) {
      const currentUrl = nextMediaUrl;

      const mediaResponse = await fetch(
        currentUrl,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        }
      );

      const mediaData =
        await readJson(mediaResponse);

      // =======================================================
      // TOKEN / API ERROR
      // =======================================================

      if (
        !mediaResponse.ok ||
        !Array.isArray(mediaData?.data)
      ) {
        if (
          isInstagramTokenError(
            mediaData
          )
        ) {
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

        console.error(
          "INSTAGRAM MEDIA PAGE FETCH FAILED:",
          {
            url: currentUrl,
            response: mediaData,
          }
        );

        return NextResponse.json(
          {
            error:
              mediaData?.error?.message ||
              mediaData?.message ||
              "Failed to fetch Instagram media",

            details: mediaData,

            refreshError,

            syncedSoFar:
              allSyncedMediaIds.length,
          },
          {
            status: 400,
          }
        );
      }

      console.log(
        "INSTAGRAM MEDIA PAGE RECEIVED:",
        {
          firstPage:
            firstMediaRequest,

          count:
            mediaData.data.length,

          hasNext:
            Boolean(
              mediaData?.paging?.next
            ),
        }
      );

      firstMediaRequest = false;

      // =======================================================
      // SAVE POSTS FROM THIS PAGE
      // =======================================================

      for (const media of mediaData.data) {
        const instagramMediaId =
          String(media.id);

        allSyncedMediaIds.push(
          instagramMediaId
        );

        // -----------------------------------------------------
        // SAVE POST
        // -----------------------------------------------------

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
          const errorMessage =
            `Post ${instagramMediaId}: ${
              postError?.message ||
              "could not save"
            }`;

          console.error(
            "INSTAGRAM POST SAVE FAILED:",
            errorMessage
          );

          errors.push(
            errorMessage
          );

          continue;
        }

        synced++;
      }

      // =======================================================
      // FOLLOW INSTAGRAM PAGINATION
      // =======================================================

      nextMediaUrl =
        mediaData?.paging?.next
          ? String(
              mediaData.paging.next
            )
          : null;
    }

    /*
     * If we reach this point, every available Instagram
     * media page was successfully fetched.
     *
     * Therefore it is now safe to remove posts that no longer
     * exist on Instagram.
     */

    paginationComplete = true;

    // =========================================================
    // REMOVE POSTS DELETED ON INSTAGRAM
    // =========================================================

    const syncedMediaIds =
      allSyncedMediaIds;

    const { data: oldPosts } =
      await admin
        .from("instagram_posts")
        .select(
          "id, instagram_media_id"
        )
        .eq(
          "instagram_account_id",
          account.id
        );

    if (
      paginationComplete &&
      oldPosts
    ) {
      const deletedPosts =
        oldPosts
          .filter(
            (post) =>
              !syncedMediaIds.includes(
                post.instagram_media_id
              )
          )
          .map(
            (post) => post.id
          );

      if (
        deletedPosts.length > 0
      ) {
        const {
          error: deleteError,
        } = await admin
          .from("instagram_posts")
          .delete()
          .in(
            "id",
            deletedPosts
          );

        if (deleteError) {
          console.error(
            "FAILED TO REMOVE DELETED INSTAGRAM POSTS:",
            deleteError
          );

          errors.push(
            `Failed to remove deleted posts: ${deleteError.message}`
          );
        } else {
          console.log(
            "REMOVED DELETED INSTAGRAM POSTS:",
            deletedPosts
          );
        }
      }
    }

    // =========================================================
    // SUCCESS
    // =========================================================
    //
    // Manual sync intentionally fetches/posts only.
    //
    // Historical comments and replies are NOT fetched
    // or stored.
    //
    // New comments should continue to be handled by the
    // Instagram webhook separately.
    // =========================================================

    return NextResponse.json({
      success: true,

      synced,

      totalPostsFetched:
        allSyncedMediaIds.length,

      pagesFetched:
        allSyncedMediaIds.length > 0
          ? "all"
          : 0,

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