import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from("instagram_accounts")
      .update({
        is_connected: false,
        access_token: null,
        token_expires_at: null,
        webhook_subscribed: false,
      })
      .eq("user_id", user.id);

    if (error) {
      console.error(
        "INSTAGRAM DISCONNECT ERROR:",
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });

  } catch (error) {
    console.error(
      "DISCONNECT FAILED:",
      error
    );

    return NextResponse.json(
      { error: "Disconnect failed" },
      { status: 500 }
    );
  }
}