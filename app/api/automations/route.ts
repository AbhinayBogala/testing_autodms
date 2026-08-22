import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getAccount(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("instagram_accounts")
    .select("id, username, is_connected")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function GET() {
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

    const account = await getAccount(user.id);

    if (!account) {
      return NextResponse.json({
        data: [],
        account: null,
        connected: false,
      });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("automations")
      .select("*")
      .eq("instagram_account_id", account.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          connected: Boolean(account.is_connected),
        },
        { status: 500 }
      );
    }

    const enriched = [];

    for (const automation of data ?? []) {
      const [{ data: posts }, { data: keywords }] =
        await Promise.all([
          admin
            .from("automation_posts")
            .select("instagram_post_id")
            .eq("automation_id", automation.id),
          admin
            .from("automation_keywords")
            .select("keyword")
            .eq("automation_id", automation.id),
        ]);

      enriched.push({
        ...automation,
        postIds: (posts ?? []).map(
          (p) => p.instagram_post_id
        ),
        keywords: (keywords ?? []).map(
          (k) => k.keyword
        ),
      });
    }

    return NextResponse.json({
      data: enriched,
      account,
      connected: Boolean(account.is_connected),
    });
  } catch (error) {
    console.error("AUTOMATIONS GET ERROR:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load automations",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
) {
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

    const account = await getAccount(user.id);

    if (!account) {
      return NextResponse.json(
        { error: "Connect Instagram first" },
        { status: 400 }
      );
    }

    if (!account.is_connected) {
      return NextResponse.json(
        {
          error:
            "Instagram is not connected. Reconnect Instagram first.",
          reconnectRequired: true,
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const name = String(
      body?.name ?? "New Instagram automation"
    )
      .trim()
      .slice(0, 100);

    const triggerType =
      body?.triggerType === "keyword"
        ? "keyword"
        : "any_comment";

    const postIds = Array.isArray(body?.postIds)
      ? [...new Set(body.postIds.map(String))]
      : [];

    const keywords: string[] = Array.isArray(body?.keywords)
      ? Array.from(
          new Set<string>(
            body.keywords
              .map((value: unknown) => String(value))
              .map((value: string) =>
                value.trim().toLowerCase()
              )
              .filter((value: string) => Boolean(value))
          )
        )
      : [];

    if (!name) {
      return NextResponse.json(
        { error: "Automation name is required" },
        { status: 400 }
      );
    }

    if (
      triggerType === "keyword" &&
      keywords.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Add at least one keyword or choose Any comment.",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: automation, error } =
      await admin
        .from("automations")
        .insert({
          instagram_account_id: account.id,
          name,
          trigger_type: triggerType,
          dm_enabled: Boolean(
            body?.dmEnabled
          ),
          dm_text: body?.dmEnabled
            ? String(
                body?.dmText ?? ""
              ).slice(0, 2000)
            : null,
          public_reply_enabled:
            Boolean(
              body?.publicReplyEnabled
            ),
          public_reply_text:
            body?.publicReplyEnabled
              ? String(
                  body?.publicReplyText ?? ""
                ).slice(0, 1000)
              : null,
          is_active:
            body?.isActive !== false,
          total_comments: 0,
          total_dms: 0,
          created_at:
            new Date().toISOString(),
          updated_at:
            new Date().toISOString(),
        })
        .select("*")
        .single();

    if (error || !automation) {
      return NextResponse.json(
        {
          error:
            error?.message ||
            "Failed to create automation",
        },
        { status: 500 }
      );
    }

    if (postIds.length) {
      const { data: validPosts } =
        await admin
          .from("instagram_posts")
          .select("id")
          .eq(
            "instagram_account_id",
            account.id
          )
          .in("id", postIds);

      if (validPosts?.length) {
        const { error: postLinkError } =
          await admin
            .from("automation_posts")
            .insert(
              validPosts.map((p) => ({
                automation_id:
                  automation.id,
                instagram_post_id:
                  p.id,
              }))
            );

        if (postLinkError) {
          await admin
            .from("automations")
            .delete()
            .eq(
              "id",
              automation.id
            );

          return NextResponse.json(
            {
              error:
                postLinkError.message,
            },
            { status: 500 }
          );
        }
      }
    }

    if (keywords.length) {
      const { error: keywordError } =
        await admin
          .from("automation_keywords")
          .insert(
            keywords.map(
              (keyword: string) => ({
                automation_id:
                  automation.id,
                keyword,
              })
            )
          );

      if (keywordError) {
        await admin
          .from("automation_posts")
          .delete()
          .eq(
            "automation_id",
            automation.id
          );

        await admin
          .from("automations")
          .delete()
          .eq(
            "id",
            automation.id
          );

        return NextResponse.json(
          {
            error:
              keywordError.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { data: automation },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "AUTOMATION CREATE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create automation",
      },
      { status: 500 }
    );
  }
}
