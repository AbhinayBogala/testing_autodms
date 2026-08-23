import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    /**
     * Get the currently connected Instagram account.
     */
    const { data: account, error: accountError } =
      await supabase
        .from("instagram_accounts")
        .select(
          `
          id,
          username,
          is_connected,
          connected_at
          `
        )
        .eq("user_id", user.id)
        .eq("is_connected", true)
        .order("connected_at", {
          ascending: false,
          nullsFirst: false,
        })
        .limit(1)
        .maybeSingle();

    if (accountError) {
      console.error(
        "DUPLICATE AUTOMATION ACCOUNT ERROR:",
        accountError
      );

      return NextResponse.json(
        {
          error: accountError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Instagram account not found",
        },
        {
          status: 404,
        }
      );
    }

    /**
     * Use admin client for the automation data.
     */
    const admin = createAdminClient();

    /**
     * Find the source automation.
     *
     * IMPORTANT:
     * We now use instagram_automations.
     */
    const {
      data: source,
      error: sourceError,
    } = await admin
      .from("instagram_automations")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq(
        "instagram_account_id",
        account.id
      )
      .maybeSingle();

    if (sourceError) {
      console.error(
        "DUPLICATE AUTOMATION SOURCE ERROR:",
        sourceError
      );

      return NextResponse.json(
        {
          error:
            sourceError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!source) {
      return NextResponse.json(
        {
          error:
            "Automation not found",
        },
        {
          status: 404,
        }
      );
    }

    /**
     * Copy the automation.
     *
     * instagram_automations does NOT have a "name"
     * column, so we do not attempt to copy a name.
     */
    const {
      data: copy,
      error: copyError,
    } = await admin
      .from("instagram_automations")
      .insert({
        user_id: user.id,

        instagram_account_id:
          account.id,

        /**
         * IMPORTANT:
         *
         * This is the Instagram MEDIA ID.
         *
         * Example:
         *
         * 17943238854072307
         */
        instagram_post_id:
          source.instagram_post_id,

        trigger_keyword:
          source.trigger_keyword ?? "",

        trigger_keywords:
          Array.isArray(
            source.trigger_keywords
          )
            ? source.trigger_keywords
            : [],

        trigger_type:
          source.trigger_type ??
          "any_comment",

        dm_message:
          source.dm_message ?? "",

        /**
         * Duplicate is created inactive.
         */
        is_active: false,

        button_name:
          source.button_name ?? null,

        button_url:
          source.button_url ?? null,

        reply_enabled:
          Boolean(
            source.reply_enabled
          ),

        reply_text:
          source.reply_text ?? "",

        created_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),
      })
      .select("*")
      .single();

    if (copyError || !copy) {
      console.error(
        "DUPLICATE AUTOMATION CREATE ERROR:",
        copyError
      );

      return NextResponse.json(
        {
          error:
            copyError?.message ??
            "Duplicate failed",
        },
        {
          status: 500,
        }
      );
    }

    /**
     * Return the duplicated automation.
     */
    console.log(
      "INSTAGRAM AUTOMATION DUPLICATED:",
      {
        sourceAutomationId:
          source.id,

        newAutomationId:
          copy.id,

        instagramAccountId:
          account.id,

        instagramPostId:
          copy.instagram_post_id,
      }
    );

    return NextResponse.json(
      {
        data: copy,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "DUPLICATE AUTOMATION ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Duplicate failed",
      },
      {
        status: 500,
      }
    );
  }
}