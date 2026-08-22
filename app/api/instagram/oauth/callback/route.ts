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
      `/dashboard?instagram=error&message=${encodeURIComponent(message)}`,
      request.url
    )
  );
}

export async function GET(
  request: NextRequest
) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDescription =
      url.searchParams.get("error_description");
    const state = url.searchParams.get("state");
    const savedState =
      request.cookies.get(
        "instagram_oauth_state"
      )?.value;

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

    if (!state || !savedState || state !== savedState) {
      return dashboardError(
        request,
        "Instagram authorization state is invalid or expired"
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL("/login", request.url)
      );
    }

    const appId =
      process.env.INSTAGRAM_APP_ID;
    const appSecret =
      process.env.INSTAGRAM_APP_SECRET;
    const redirectUri =
      process.env.INSTAGRAM_REDIRECT_URI;
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecret =
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

    // 1. Exchange authorization code for short-lived token.
    const shortResponse = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type:
            "authorization_code",
          redirect_uri: redirectUri,
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

    // 2. Immediately upgrade to a long-lived token.
    const longLived =
      await exchangeForLongLivedToken(
        shortData.access_token
      );

    const accessToken =
      longLived.access_token;

    const issuedAt = new Date();
    const expiresAt =
      typeof longLived.expires_in ===
      "number"
        ? new Date(
            issuedAt.getTime() +
              longLived.expires_in * 1000
          )
        : null;

    // 3. Read the Instagram profile using the long-lived token.
    const profileUrl = new URL(
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

    const profileResponse =
      await fetch(
        profileUrl.toString(),
        { cache: "no-store" }
      );

    const profileData =
      await readJson(profileResponse);

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

    const now = issuedAt.toISOString();

    // 4. Replace the old connection/token for this account.
    const { data: savedAccount, error: databaseError } =
      await supabaseAdmin
        .from("instagram_accounts")
        .upsert(
          {
            user_id: user.id,
            instagram_user_id:
              String(profileData.id),
            username:
              profileData.username ?? null,
            profile_picture_url:
              profileData.profile_picture_url ??
              null,
            followers_count:
              profileData.followers_count ?? 0,
            following_count:
              profileData.follows_count ?? 0,
            media_count:
              profileData.media_count ?? 0,
            access_token: accessToken,
            token_issued_at: now,
            token_expires_at:
              expiresAt?.toISOString() ?? null,
            last_token_refresh_at: null,
            is_connected: true,
            connected_at: now,
            updated_at: now,
          },
          {
            onConflict:
              "instagram_user_id",
          }
        )
        .select("id")
        .single();

    if (databaseError || !savedAccount) {
      console.error(
        "INSTAGRAM DATABASE ERROR:",
        databaseError
      );

      return dashboardError(
        request,
        databaseError?.message ||
          "Failed to save Instagram account"
      );
    }

    // 5. Subscribe this Instagram account to comments + messages webhooks.
    const subscribeUrl = new URL(
      graphUrl(
        `${profileData.id}/subscribed_apps`
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
      await readJson(subscribeResponse);

    await supabaseAdmin
      .from("instagram_accounts")
      .update({
        webhook_subscribed:
          subscribeResponse.ok &&
          subscribeData?.success === true,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", savedAccount.id);

    if (!subscribeResponse.ok) {
      console.warn(
        "INSTAGRAM WEBHOOK SUBSCRIPTION FAILED:",
        subscribeData
      );
    }

    const response = NextResponse.redirect(
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
