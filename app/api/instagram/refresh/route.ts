import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshLongLivedToken } from "@/lib/instagram";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account, error } = await supabase
    .from("instagram_accounts")
    .select("id, access_token, token_issued_at, is_connected")
    .eq("user_id", user.id)
    .eq("is_connected", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!account?.access_token) return NextResponse.json({ error: "Instagram is not connected", reconnectRequired: true }, { status: 404 });

  if (account.token_issued_at) {
    const age = Date.now() - new Date(account.token_issued_at).getTime();
    if (age < 24 * 60 * 60 * 1000) {
      return NextResponse.json({ success: true, refreshed: false, message: "Token is too new to refresh yet." });
    }
  }

  try {
    const refreshed = await refreshLongLivedToken(account.access_token);
    const issuedAt = new Date();
    const expiresAt = typeof refreshed.expires_in === "number"
      ? new Date(issuedAt.getTime() + refreshed.expires_in * 1000)
      : null;

    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("instagram_accounts")
      .update({
        access_token: refreshed.access_token,
        token_issued_at: issuedAt.toISOString(),
        token_expires_at: expiresAt?.toISOString() ?? null,
        last_token_refresh_at: issuedAt.toISOString(),
        is_connected: true,
        updated_at: issuedAt.toISOString(),
      })
      .eq("id", account.id)
      .eq("user_id", user.id);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ success: true, refreshed: true, expiresAt: expiresAt?.toISOString() ?? null });
  } catch (error) {
    console.error("INSTAGRAM REFRESH ERROR:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Instagram token refresh failed",
      reconnectRequired: true,
    }, { status: 401 });
  }
}
