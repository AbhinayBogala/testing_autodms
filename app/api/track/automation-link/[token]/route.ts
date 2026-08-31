import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;

    if (!token || token.length < 20) {
      return NextResponse.json({ error: "Invalid link." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: click, error } = await admin
      .from("instagram_automation_link_clicks")
      .select("id, target_url, clicked_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("AUTOMATION LINK TRACKING ERROR:", error);
      return NextResponse.json({ error: "Unable to open link." }, { status: 500 });
    }

    if (!click) {
      return NextResponse.json({ error: "Link not found or expired." }, { status: 404 });
    }

    if (!click.clicked_at) {
      const { error: updateError } = await admin
        .from("instagram_automation_link_clicks")
        .update({ clicked_at: new Date().toISOString() })
        .eq("id", click.id)
        .is("clicked_at", null);

      if (updateError) {
        console.error("AUTOMATION LINK CLICK SAVE ERROR:", updateError);
      }
    }

    return NextResponse.redirect(click.target_url, 302);
  } catch (error) {
    console.error("AUTOMATION LINK REDIRECT ERROR:", error);
    return NextResponse.json({ error: "Unable to open link." }, { status: 500 });
  }
}
