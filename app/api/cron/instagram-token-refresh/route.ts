import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccountIfNeeded } from "@/lib/instagram";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: accounts, error } = await admin
    .from("instagram_accounts")
    .select("id, access_token, token_issued_at, token_expires_at")
    .eq("is_connected", true)
    .not("access_token", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let refreshed = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const account of accounts ?? []) {
    try {
      const result = await refreshAccountIfNeeded(account);
      if (result.refreshed) refreshed++;
      else skipped++;
    } catch (error) {
      failures.push(`${account.id}: ${error instanceof Error ? error.message : "refresh failed"}`);
    }
  }

  return NextResponse.json({ success: true, checked: accounts?.length ?? 0, refreshed, skipped, failures });
}
