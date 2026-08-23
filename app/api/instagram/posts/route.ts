import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: account, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("id, is_connected, username")
      .eq("user_id", user.id)
      .maybeSingle();

    if (accountError) {
      return NextResponse.json(
        { error: accountError.message },
        { status: 500 }
      );
    }

    if (!account) {
      return NextResponse.json({
        data: [],
        connected: false,
        message: "Connect Instagram first.",
      });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("instagram_posts")
      .select(
        "id, instagram_media_id, caption, media_url, media_type, published_at, likes_count, comments_count, permalink"
      )
      .eq("instagram_account_id", account.id)
      .order("published_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { error: error.message, connected: account.is_connected },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
      connected: Boolean(account.is_connected),
      username: account.username,
    });
  } catch (error) {
    console.error("INSTAGRAM POSTS API ERROR:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Instagram posts",
      },
      { status: 500 }
    );
  }
}
