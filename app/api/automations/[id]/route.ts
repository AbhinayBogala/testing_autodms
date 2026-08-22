import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } =
      await context.params;

    const supabase =
      await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: account } =
      await supabase
        .from("instagram_accounts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Instagram account not found",
        },
        { status: 404 }
      );
    }

    const { data: automation } =
      await supabase
        .from("automations")
        .select("id")
        .eq("id", id)
        .eq(
          "instagram_account_id",
          account.id
        )
        .maybeSingle();

    if (!automation) {
      return NextResponse.json(
        {
          error:
            "Automation not found",
        },
        { status: 404 }
      );
    }

    const body =
      await request.json();

    const updates: Record<
      string,
      unknown
    > = {
      updated_at:
        new Date().toISOString(),
    };

    // Accept both the API/database naming
    // and the frontend naming.
    if ("name" in body) {
      updates.name = String(
        body.name
      )
        .trim()
        .slice(0, 100);
    }

    if (
      "triggerType" in body ||
      "trigger_type" in body
    ) {
      const value =
        body.triggerType ??
        body.trigger_type;

      updates.trigger_type =
        value === "keyword"
          ? "keyword"
          : "any_comment";
    }

    if (
      "dmEnabled" in body ||
      "dm_enabled" in body
    ) {
      updates.dm_enabled =
        Boolean(
          body.dmEnabled ??
            body.dm_enabled
        );
    }

    if (
      "dmText" in body ||
      "dm_text" in body
    ) {
      const enabled =
        Boolean(
          body.dmEnabled ??
            body.dm_enabled
        );

      const value =
        body.dmText ??
        body.dm_text ??
        "";

      updates.dm_text = enabled
        ? String(value).slice(
            0,
            2000
          )
        : null;
    }

    if (
      "publicReplyEnabled" in
        body ||
      "public_reply_enabled" in body
    ) {
      updates.public_reply_enabled =
        Boolean(
          body.publicReplyEnabled ??
            body.public_reply_enabled
        );
    }

    if (
      "publicReplyText" in body ||
      "public_reply_text" in body
    ) {
      const enabled =
        Boolean(
          body.publicReplyEnabled ??
            body.public_reply_enabled
        );

      const value =
        body.publicReplyText ??
        body.public_reply_text ??
        "";

      updates.public_reply_text =
        enabled
          ? String(value).slice(
              0,
              1000
            )
          : null;
    }

    if (
      "isActive" in body ||
      "is_active" in body
    ) {
      updates.is_active =
        Boolean(
          body.isActive ??
            body.is_active
        );
    }

    const admin =
      createAdminClient();

    const {
      data: updated,
      error,
    } = await admin
      .from("automations")
      .update(updates)
      .eq("id", id)
      .eq(
        "instagram_account_id",
        account.id
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (
      Array.isArray(
        body?.postIds
      )
    ) {
      await admin
        .from("automation_posts")
        .delete()
        .eq(
          "automation_id",
          id
        );

      const uniquePostIds = [
        ...new Set(
          body.postIds.map(
            String
          )
        ),
      ];

      if (uniquePostIds.length) {
        const {
          data: valid,
          error: validError,
        } = await admin
          .from("instagram_posts")
          .select("id")
          .eq(
            "instagram_account_id",
            account.id
          )
          .in(
            "id",
            uniquePostIds
          );

        if (validError) {
          return NextResponse.json(
            {
              error:
                validError.message,
            },
            { status: 500 }
          );
        }

        if (valid?.length) {
          const {
            error: linkError,
          } = await admin
            .from(
              "automation_posts"
            )
            .insert(
              valid.map(
                (post) => ({
                  automation_id:
                    id,
                  instagram_post_id:
                    post.id,
                })
              )
            );

          if (linkError) {
            return NextResponse.json(
              {
                error:
                  linkError.message,
              },
              { status: 500 }
            );
          }
        }
      }
    }

    if (
      Array.isArray(
        body?.keywords
      )
    ) {
      await admin
        .from("automation_keywords")
        .delete()
        .eq(
          "automation_id",
          id
        );

      const keywords: string[] = Array.from(
        new Set<string>(
          body.keywords
            .map((value: unknown) => String(value))
            .map((value: string) =>
              value.trim().toLowerCase()
            )
            .filter((value: string) => Boolean(value))
        )
      );

      const triggerType =
        updates.trigger_type ??
        undefined;

      if (
        triggerType ===
          "keyword" &&
        keywords.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "Keyword automation requires at least one keyword.",
          },
          { status: 400 }
        );
      }

      if (keywords.length) {
        const {
          error: keywordError,
        } = await admin
          .from(
            "automation_keywords"
          )
          .insert(
            keywords.map(
              (
                keyword: string
              ) => ({
                automation_id:
                  id,
                keyword,
              })
            )
          );

        if (keywordError) {
          return NextResponse.json(
            {
              error:
                keywordError.message,
            },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      data: updated,
    });
  } catch (error) {
    console.error(
      "AUTOMATION PATCH ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update automation",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } =
      await context.params;

    const supabase =
      await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: account } =
      await supabase
        .from("instagram_accounts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Instagram account not found",
        },
        { status: 404 }
      );
    }

    const admin =
      createAdminClient();

    const { error } =
      await admin
        .from("automations")
        .delete()
        .eq("id", id)
        .eq(
          "instagram_account_id",
          account.id
        );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete automation",
      },
      { status: 500 }
    );
  }
}
