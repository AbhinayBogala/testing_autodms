import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL("/login", request.url)
    );
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const redirectUri =
    process.env.INSTAGRAM_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Instagram OAuth environment variables are missing",
      },
      { status: 500 }
    );
  }

  const state = randomUUID();
  const scopes = [
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
  ].join(",");

  const url = new URL(
    "https://www.instagram.com/oauth/authorize"
  );

  url.searchParams.set(
    "client_id",
    appId
  );
  url.searchParams.set(
    "redirect_uri",
    redirectUri
  );
  url.searchParams.set(
    "response_type",
    "code"
  );
  url.searchParams.set("scope", scopes);
  url.searchParams.set(
    "force_reauth",
    "true"
  );
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(
    url.toString()
  );

  response.cookies.set(
    "instagram_oauth_state",
    state,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    }
  );

  return response;
}
