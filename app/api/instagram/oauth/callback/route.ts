import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

import {
  createClient as createSupabaseAdmin,
} from "@supabase/supabase-js";

import {
  exchangeForLongLivedToken,
  graphUrl,
  readJson,
} from "@/lib/instagram";

function dashboardError(
  request: NextRequest,
  message: string
) {
  return NextResponse.redirect(
    new URL(
      `/dashboard?instagram=error&message=${encodeURIComponent(
        message
      )}`,
      request.url
    )
  );
}

export async function GET(
  request: NextRequest
) {
  try {
    // =======================================================
    // READ OAUTH PARAMETERS
    // =======================================================

    const url = new URL(request.url);

    const code =
      url.searchParams.get("code");

    const error =
      url.searchParams.get("error");

    const errorDescription =
      url.searchParams.get(
        "error_description"
      );

    const state =
      url.searchParams.get("state");

    const savedState =
      request.cookies.get(
        "instagram_oauth_state"
      )?.value;

    // =======================================================
    // OAUTH ERROR
    // =======================================================

    if (error) {
      return dashboardError(
        request,
        errorDescription || error
      );
    }

    if (!code) {
      return dashboardError(
        request,
        "No Instagram authorization code received"
      );
    }

    // =======================================================
    // STATE VALIDATION
    // =======================================================

    if (
      !state ||
      !savedState ||
      state !== savedState
    ) {
      return dashboardError(
        request,
        "Instagram authorization state is invalid or expired"
      );
    }

    // =======================================================
    // SUPABASE USER
    // =======================================================

    const supabase =
      await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL("/login", request.url)
      );
    }

    // =======================================================
    // ENVIRONMENT
    // =======================================================

    const appId =
      process.env.INSTAGRAM_APP_ID;

    const appSecret =
      process.env.INSTAGRAM_APP_SECRET;

    const redirectUri =
      process.env.INSTAGRAM_REDIRECT_URI;

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseSecret =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY;

    if (
      !appId ||
      !appSecret ||
      !redirectUri ||
      !supabaseUrl ||
      !supabaseSecret
    ) {
      return dashboardError(
        request,
        "Server configuration is incomplete"
      );
    }

    // =======================================================
    // 1. EXCHANGE AUTHORIZATION CODE
    // =======================================================

    const shortResponse =
      await fetch(
        "https://api.instagram.com/oauth/access_token",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body: new URLSearchParams({
            client_id: appId,

            client_secret:
              appSecret,

            grant_type:
              "authorization_code",

            redirect_uri:
              redirectUri,

            code,
          }).toString(),

          cache: "no-store",
        }
      );

    const shortData =
      await readJson(shortResponse);

    if (
      !shortResponse.ok ||
      typeof shortData?.access_token !==
        "string"
    ) {
      console.error(
        "INSTAGRAM SHORT TOKEN ERROR:",
        shortData
      );

      return dashboardError(
        request,
        shortData?.error_message ||
          shortData?.error ||
          "Instagram token exchange failed"
      );
    }

    // =======================================================
    // 2. EXCHANGE FOR LONG-LIVED TOKEN
    // =======================================================

    const longLived =
      await exchangeForLongLivedToken(
        shortData.access_token
      );

    const accessToken =
      longLived.access_token;

    const issuedAt =
      new Date();

    const expiresAt =
      typeof longLived.expires_in ===
      "number"
        ? new Date(
            issuedAt.getTime() +
              longLived.expires_in *
                1000
          )
        : null;

    // =======================================================
    // 3. GET INSTAGRAM PROFILE
    // =======================================================

    const profileUrl =
      new URL(graphUrl("me"));

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

    const profileResponse =
      await fetch(
        profileUrl.toString(),
        {
          cache: "no-store",
        }
      );

    const profileData =
      await readJson(profileResponse);

    console.log(
      "========================================"
    );

    console.log(
      "INSTAGRAM PROFILE DATA"
    );

    console.log(
      JSON.stringify(
        profileData,
        null,
        2
      )
    );

    console.log(
      "========================================"
    );

    if (
      !profileResponse.ok ||
      !profileData?.id
    ) {
      console.error(
        "INSTAGRAM PROFILE ERROR:",
        profileData
      );

      return dashboardError(
        request,
        profileData?.error?.message ||
          profileData?.message ||
          "Could not retrieve Instagram profile"
      );
    }

    const profileInstagramId =
      String(profileData.id);

    const username =
      profileData.username
        ? String(
            profileData.username
          )
        : null;

    // =======================================================
    // 4. CREATE SUPABASE ADMIN CLIENT
    // =======================================================

    const supabaseAdmin =
      createSupabaseAdmin(
        supabaseUrl,
        supabaseSecret,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

    const now =
      issuedAt.toISOString();

    // =======================================================
    // DISCONNECT PREVIOUS INSTAGRAM ACCOUNTS
    // =======================================================
    //
    // A user can connect a different Instagram account.
    // Before activating the new account, disconnect any
    // previously connected account belonging to this user.
    // This prevents the dashboard from selecting an old
    // connected account.

    const {
      error: disconnectOldAccountsError,
    } = await supabaseAdmin
      .from("instagram_accounts")
      .update({
        is_connected: false,
        updated_at: now,
      })
      .eq("user_id", user.id)
      .eq("is_connected", true);

    if (disconnectOldAccountsError) {
      console.error(
        "DISCONNECT OLD INSTAGRAM ACCOUNTS ERROR:",
        disconnectOldAccountsError
      );

      return dashboardError(
        request,
        disconnectOldAccountsError.message ||
          "Could not disconnect the previous Instagram account"
      );
    }

    // =======================================================
    // 5. SAVE ACCOUNT
    // =======================================================

    /*
      IMPORTANT:

      profileInstagramId is the ID returned by
      graph.instagram.com/me.

      We keep it in instagram_user_id.

      webhook_instagram_user_id will initially
      be NULL.

      The webhook will identify the account using
      the available Instagram information instead
      of assuming the two IDs are identical.
    */

    const {
      data: existingAccount,
    } = await supabaseAdmin
      .from("instagram_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq(
        "instagram_user_id",
        profileInstagramId
      )
      .maybeSingle();

    let savedAccountId: string;

    if (existingAccount?.id) {
      const {
        data: updatedAccount,
        error: updateError,
      } = await supabaseAdmin
        .from("instagram_accounts")
        .update({
          username,

          profile_picture_url:
            profileData.profile_picture_url ??
            null,

          followers_count:
            profileData.followers_count ?? 0,

          following_count:
            profileData.follows_count ?? 0,

          media_count:
            profileData.media_count ?? 0,

          access_token:
            accessToken,

          token_issued_at:
            now,

          token_expires_at:
            expiresAt?.toISOString() ??
            null,

          is_connected:
            true,

          connected_at:
            now,

          updated_at:
            now,
        })
        .eq(
          "id",
          existingAccount.id
        )
        .select("id")
        .single();

      if (
        updateError ||
        !updatedAccount
      ) {
        console.error(
          "INSTAGRAM ACCOUNT UPDATE ERROR:",
          updateError
        );

        return dashboardError(
          request,
          updateError?.message ||
            "Failed to update Instagram account"
        );
      }

      savedAccountId =
        updatedAccount.id;
    } else {
      const {
        data: insertedAccount,
        error: insertError,
      } = await supabaseAdmin
        .from("instagram_accounts")
        .insert({
          user_id: user.id,

          instagram_user_id:
            profileInstagramId,

          username,

          profile_picture_url:
            profileData.profile_picture_url ??
            null,

          followers_count:
            profileData.followers_count ?? 0,

          following_count:
            profileData.follows_count ?? 0,

          media_count:
            profileData.media_count ?? 0,

          access_token:
            accessToken,

          token_issued_at:
            now,

          token_expires_at:
            expiresAt?.toISOString() ??
            null,

          last_token_refresh_at:
            null,

          is_connected:
            true,

          connected_at:
            now,

          updated_at:
            now,
        })
        .select("id")
        .single();

      if (
        insertError ||
        !insertedAccount
      ) {
        console.error(
          "INSTAGRAM ACCOUNT INSERT ERROR:",
          insertError
        );

        return dashboardError(
          request,
          insertError?.message ||
            "Failed to save Instagram account"
        );
      }

      savedAccountId =
        insertedAccount.id;
    }

    // =======================================================
    // 6. SUBSCRIBE INSTAGRAM ACCOUNT TO WEBHOOKS
    // =======================================================

    const subscribeUrl =
      new URL(
        graphUrl(
          `${profileInstagramId}/subscribed_apps`
        )
      );

    subscribeUrl.searchParams.set(
      "subscribed_fields",
      "comments,messages"
    );

    subscribeUrl.searchParams.set(
      "access_token",
      accessToken
    );

    const subscribeResponse =
      await fetch(
        subscribeUrl.toString(),
        {
          method: "POST",
          cache: "no-store",
        }
      );

    const subscribeData =
      await readJson(
        subscribeResponse
      );

    console.log(
      "========================================"
    );

    console.log(
      "INSTAGRAM WEBHOOK SUBSCRIPTION"
    );

    console.log(
      "Account ID:",
      profileInstagramId
    );

    console.log(
      "Response:",
      JSON.stringify(
        subscribeData,
        null,
        2
      )
    );

    console.log(
      "========================================"
    );

    await supabaseAdmin
      .from("instagram_accounts")
      .update({
        webhook_subscribed:
          subscribeResponse.ok &&
          subscribeData?.success === true,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        savedAccountId
      );

    if (!subscribeResponse.ok) {
      console.warn(
        "INSTAGRAM WEBHOOK SUBSCRIPTION FAILED:",
        subscribeData
      );
    }

    // =======================================================
    // 7. REDIRECT TO DASHBOARD
    // =======================================================

    const response =
      NextResponse.redirect(
        new URL(
          "/dashboard?instagram=connected",
          request.url
        )
      );

    response.cookies.set(
      "instagram_oauth_state",
      "",
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite: "lax",

        maxAge: 0,

        path: "/",
      }
    );

    return response;
  } catch (error) {
    console.error(
      "INSTAGRAM OAUTH ERROR:",
      error
    );

    return dashboardError(
      request,
      error instanceof Error
        ? error.message
        : "Instagram OAuth failed"
    );
  }
}