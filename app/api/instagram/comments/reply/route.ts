import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  graphUrl,
  readJson,
  isInstagramTokenError,
  refreshAccountIfNeeded,
} from "@/lib/instagram";

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

    const body = await request.json();
    const commentId = body?.commentId;
    const replyText =
      typeof body?.replyText === "string"
        ? body.replyText.trim()
        : "";

    if (!commentId) {
      return NextResponse.json(
        { error: "Comment ID is required" },
        { status: 400 }
      );
    }

    if (!replyText) {
      return NextResponse.json(
        { error: "Reply text is required" },
        { status: 400 }
      );
    }

    if (replyText.length > 1000) {
      return NextResponse.json(
        { error: "Reply is too long" },
        { status: 400 }
      );
    }

    const { data: comment, error } =
      await supabase
        .from("instagram_comments")
        .select(
          "id, instagram_comment_id, instagram_account_id, instagram_post_id"
        )
        .eq("id", commentId)
        .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to load comment",
          details: error.message,
        },
        { status: 500 }
      );
    }

    if (!comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }

    const { data: account } =
      await supabase
        .from("instagram_accounts")
        .select(
          "id, access_token, token_issued_at, token_expires_at, is_connected"
        )
        .eq(
          "id",
          comment.instagram_account_id
        )
        .eq("user_id", user.id)
        .eq("is_connected", true)
        .maybeSingle();

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Instagram account is not connected",
          reconnectRequired: true,
        },
        { status: 401 }
      );
    }

    if (!comment.instagram_comment_id) {
      return NextResponse.json(
        {
          error:
            "Instagram comment ID is missing",
        },
        { status: 400 }
      );
    }

    const fresh =
      await refreshAccountIfNeeded(account);

    const response = await fetch(
      graphUrl(
        `${comment.instagram_comment_id}/replies`
      ),
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${fresh.accessToken}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          message: replyText,
        }),
        cache: "no-store",
      }
    );

    const data = await readJson(response);

    if (
      !response.ok ||
      !data?.id
    ) {
      return NextResponse.json(
        {
          error:
            isInstagramTokenError(data)
              ? "Instagram connection expired. Please reconnect Instagram."
              : "Failed to send Instagram reply",
          details: data,
          reconnectRequired:
            isInstagramTokenError(data),
        },
        { status: 400 }
      );
    }

    const instagramReplyId = String(
      data.id
    );

    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Save the reply as a normal comment node so threading survives refresh.
    const { data: savedReply } =
      await admin
        .from("instagram_comments")
        .upsert(
          {
            instagram_account_id:
              comment.instagram_account_id,
            instagram_post_id:
              comment.instagram_post_id,
            instagram_comment_id:
              instagramReplyId,
            commenter_instagram_id:
              null,
            commenter_username:
              "You",
            comment_text:
              replyText,
            parent_comment_id:
              comment.instagram_comment_id,
            public_reply_sent: true,
            public_reply_text:
              replyText,
            public_reply_at: now,
            dm_sent: false,
            created_at: now,
          },
          {
            onConflict:
              "instagram_comment_id",
          }
        )
        .select(
          "id, instagram_comment_id, comment_text, parent_comment_id, created_at"
        )
        .single();

    // Preserve the existing reply-history table if it exists.
    await admin
      .from("instagram_comment_replies")
      .upsert(
        {
          instagram_comment_id:
            comment.id,
          instagram_reply_id:
            instagramReplyId,
          reply_text:
            replyText,
          created_at: now,
          updated_at: now,
        },
        {
          onConflict:
            "instagram_reply_id",
        }
      );

    await admin
      .from("instagram_comments")
      .update({
        public_reply_sent: true,
        public_reply_text:
          replyText,
        public_reply_at: now,
      })
      .eq("id", comment.id);

    return NextResponse.json({
      success: true,
      instagramReplyId,
      replyText,
      reply: savedReply,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM REPLY ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Instagram reply failed",
      },
      { status: 500 }
    );
  }
}
