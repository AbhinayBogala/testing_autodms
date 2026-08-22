import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  graphUrl,
  readJson,
  refreshAccountIfNeeded,
  isInstagramTokenError,
} from "@/lib/instagram";

/* eslint-disable @typescript-eslint/no-explicit-any */

const VERIFY_TOKEN =
  process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

/* =========================================================
   META WEBHOOK VERIFICATION
========================================================= */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode =
    searchParams.get("hub.mode");

  const token =
    searchParams.get("hub.verify_token");

  const challenge =
    searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    VERIFY_TOKEN &&
    token === VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return NextResponse.json(
    {
      error: "Verification failed",
    },
    {
      status: 403,
    }
  );
}

/* =========================================================
   META WEBHOOK EVENTS
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    console.log(
      "========================================"
    );

    console.log(
      "INSTAGRAM WEBHOOK RECEIVED"
    );

    console.log(
      JSON.stringify(body, null, 2)
    );

    console.log(
      "========================================"
    );

    /*
      Meta sends:
      {
        object: "instagram",
        entry: [...]
      }
    */

    if (body?.object !== "instagram") {
      return NextResponse.json({
        success: true,
        ignored: true,
      });
    }

    const entries = Array.isArray(body.entry)
      ? body.entry
      : [];

    for (const entry of entries) {
      const instagramUserId =
        String(entry?.id || "");

      console.log(
        "WEBHOOK INSTAGRAM USER ID:",
        instagramUserId
      );

      /*
        COMMENTS
      */

      const changes = Array.isArray(
        entry?.changes
      )
        ? entry.changes
        : [];

      for (const change of changes) {
        if (
          change?.field !== "comments"
        ) {
          continue;
        }

        await processCommentEvent(
          instagramUserId,
          change.value
        );
      }

      /*
        MESSAGES

        Keep this for future DM/conversation
        handling.
      */

      const messages = Array.isArray(
        entry?.messaging
      )
        ? entry.messaging
        : [];

      for (const event of messages) {
        await processMessageEvent(
          instagramUserId,
          event
        );
      }
    }

    return NextResponse.json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM WEBHOOK ERROR:",
      error
    );

    /*
      Always acknowledge Meta with 200.
    */

    return NextResponse.json({
      success: false,
    });
  }
}

/* =========================================================
   GET CONNECTED INSTAGRAM ACCOUNT
========================================================= */

async function getAccount(
  instagramUserId: string
) {
  const supabase =
    createAdminClient();

  const {
    data,
    error,
  } = await supabase
    .from("instagram_accounts")
    .select(
      `
      id,
      user_id,
      instagram_user_id,
      username,
      access_token,
      token_issued_at,
      token_expires_at,
      is_connected
      `
    )
    .eq(
      "instagram_user_id",
      instagramUserId
    )
    .eq(
      "is_connected",
      true
    )
    .maybeSingle();

  if (error) {
    console.error(
      "INSTAGRAM ACCOUNT LOOKUP ERROR:",
      error
    );

    return null;
  }

  if (!data) {
    console.warn(
      "NO INSTAGRAM ACCOUNT FOUND:",
      instagramUserId
    );

    return null;
  }

  /*
    Refresh long-lived token only when needed.
  */

  try {
    const refreshed =
      await refreshAccountIfNeeded(data);

    return {
      ...data,
      access_token:
        refreshed.accessToken,
    };
  } catch (error) {
    console.warn(
      "TOKEN REFRESH DURING WEBHOOK FAILED:",
      error
    );

    /*
      Continue using the current token.
    */

    return data;
  }
}

/* =========================================================
   PROCESS COMMENT
========================================================= */

async function processCommentEvent(
  instagramUserId: string,
  value: any
) {
  try {
    console.log(
      "========================================"
    );

    console.log(
      "PROCESSING INSTAGRAM COMMENT"
    );

    console.log(
      "COMMENT VALUE:",
      JSON.stringify(value, null, 2)
    );

    console.log(
      "========================================"
    );

    /*
      Extract comment information.
    */

    const commentId =
      value?.id
        ? String(value.id)
        : "";

    const commentText =
      String(
        value?.text || ""
      ).trim();

    const mediaId =
      value?.media?.id
        ? String(value.media.id)
        : "";

    const commenterId =
      value?.from?.id
        ? String(value.from.id)
        : null;

    const commenterUsername =
      value?.from?.username ||
      null;

    if (!commentId) {
      console.warn(
        "COMMENT ID MISSING"
      );

      return;
    }

    if (!mediaId) {
      console.warn(
        "MEDIA ID MISSING"
      );

      return;
    }

    if (!commentText) {
      console.warn(
        "COMMENT TEXT MISSING"
      );

      return;
    }

    console.log(
      "COMMENT DATA:",
      {
        instagramUserId,
        commentId,
        mediaId,
        commentText,
        commenterId,
        commenterUsername,
      }
    );

    /* =====================================================
       FIND INSTAGRAM ACCOUNT
    ===================================================== */

    const account =
      await getAccount(
        instagramUserId
      );

    if (!account) {
      console.warn(
        "ACCOUNT NOT FOUND FOR INSTAGRAM USER:",
        instagramUserId
      );

      return;
    }

    console.log(
      "INSTAGRAM ACCOUNT FOUND:",
      {
        id: account.id,
        user_id: account.user_id,
        instagram_user_id:
          account.instagram_user_id,
        username:
          account.username,
      }
    );

    const supabase =
      createAdminClient();

    /* =====================================================
       FIND POST

       The webhook gives us Instagram's media ID.

       Our instagram_posts table stores:

       instagram_account_id
       instagram_media_id
    ===================================================== */

    const {
      data: post,
      error: postError,
    } = await supabase
      .from("instagram_posts")
      .select(
        "id, instagram_media_id"
      )
      .eq(
        "instagram_account_id",
        account.id
      )
      .eq(
        "instagram_media_id",
        mediaId
      )
      .maybeSingle();

    if (postError) {
      console.error(
        "INSTAGRAM POST LOOKUP ERROR:",
        postError
      );

      return;
    }

    /*
      The post may not exist locally.

      That should NOT prevent the automation
      from working because the automation table
      already stores the Instagram media ID.
    */

    console.log(
      "LOCAL POST:",
      post
    );

    /* =====================================================
       FIND AUTOMATION

       IMPORTANT:

       Your actual table is:

       instagram_automations

       NOT:

       automations
       automation_posts
       automation_keywords
    ===================================================== */

    const {
      data: automations,
      error: automationError,
    } = await supabase
      .from(
        "instagram_automations"
      )
      .select(
        `
        id,
        user_id,
        instagram_connection_id,
        instagram_post_id,
        trigger_keyword,
        dm_message,
        is_active
        `
      )
      .eq(
        "user_id",
        account.user_id
      )
      .eq(
        "instagram_post_id",
        mediaId
      )
      .eq(
        "is_active",
        true
      );

    if (automationError) {
      console.error(
        "AUTOMATION DATABASE ERROR:",
        automationError
      );

      return;
    }

    console.log(
      "AUTOMATIONS FOUND:",
      automations
    );

    if (
      !automations ||
      automations.length === 0
    ) {
      console.log(
        "NO ACTIVE AUTOMATION FOR POST:",
        mediaId
      );

      return;
    }

    /* =====================================================
       MATCH KEYWORD
    ===================================================== */

    const normalizedComment =
      commentText
        .toLowerCase()
        .trim();

    let matchedAutomation:
      | any
      | null = null;

    for (
      const automation of automations
    ) {
      const keyword =
        String(
          automation.trigger_keyword ||
            ""
        )
          .toLowerCase()
          .trim();

      if (!keyword) {
        continue;
      }

      console.log(
        "CHECKING KEYWORD:",
        {
          keyword,
          comment:
            normalizedComment,
        }
      );

      if (
        normalizedComment.includes(
          keyword
        )
      ) {
        matchedAutomation =
          automation;

        break;
      }
    }

    /* =====================================================
       NO MATCH
    ===================================================== */

    if (!matchedAutomation) {
      console.log(
        "KEYWORD NOT MATCHED"
      );

      return;
    }

    console.log(
      "========================================"
    );

    console.log(
      "AUTOMATION MATCHED"
    );

    console.log(
      matchedAutomation
    );

    console.log(
      "========================================"
    );

    /* =====================================================
       SEND PRIVATE DM
    ===================================================== */

    const accessToken =
      account.access_token;

    if (!accessToken) {
      console.error(
        "INSTAGRAM ACCESS TOKEN MISSING"
      );

      return;
    }

    const dmMessage =
      String(
        matchedAutomation.dm_message ||
          ""
      ).trim();

    if (!dmMessage) {
      console.warn(
        "AUTOMATION DM MESSAGE IS EMPTY"
      );

      return;
    }

    console.log(
      "SENDING INSTAGRAM DM:",
      {
        commentId,
        instagramUserId,
        message:
          dmMessage,
      }
    );

    const result =
      await sendPrivateReply({
        instagramUserId,
        accessToken,
        commentId,
        message:
          dmMessage,
      });

    console.log(
      "PRIVATE DM RESULT:",
      result
    );

    if (!result.success) {
      console.error(
        "INSTAGRAM DM FAILED:",
        result.data
      );

      return;
    }

    console.log(
      "========================================"
    );

    console.log(
      "AUTOMATION SUCCESS"
    );

    console.log(
      "COMMENT:",
      commentText
    );

    console.log(
      "KEYWORD:",
      matchedAutomation.trigger_keyword
    );

    console.log(
      "DM SENT:",
      dmMessage
    );

    console.log(
      "========================================"
    );
  } catch (error) {
    console.error(
      "COMMENT PROCESS ERROR:",
      error
    );
  }
}

/* =========================================================
   SEND PRIVATE REPLY
========================================================= */

async function sendPrivateReply({
  instagramUserId,
  accessToken,
  commentId,
  message,
}: {
  instagramUserId: string;
  accessToken: string;
  commentId: string;
  message: string;
}) {
  try {
    const url =
      graphUrl(
        `${instagramUserId}/messages`
      );

    console.log(
      "INSTAGRAM DM URL:",
      url
    );

    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            recipient: {
              comment_id:
                commentId,
            },

            message: {
              text: message,
            },
          }),

          cache: "no-store",
        }
      );

    const data =
      await readJson(response);

    if (!response.ok) {
      console.error(
        "PRIVATE REPLY ERROR:",
        data
      );

      if (
        isInstagramTokenError(
          data
        )
      ) {
        console.error(
          "INSTAGRAM TOKEN ERROR DETECTED"
        );
      }

      return {
        success: false,
        data,
      };
    }

    return {
      success:
        response.ok &&
        Boolean(
          data?.message_id ||
            data?.id
        ),

      data,
    };
  } catch (error) {
    console.error(
      "PRIVATE REPLY REQUEST ERROR:",
      error
    );

    return {
      success: false,
      error,
    };
  }
}

/* =========================================================
   PROCESS NORMAL INSTAGRAM MESSAGE
========================================================= */

async function processMessageEvent(
  instagramUserId: string,
  event: any
) {
  try {
    const senderId =
      event?.sender?.id;

    const message =
      event?.message;

    if (
      !senderId ||
      !message
    ) {
      return;
    }

    const account =
      await getAccount(
        instagramUserId
      );

    if (!account) {
      return;
    }

    const supabase =
      createAdminClient();

    const username =
      message?.from?.username ||
      null;

    /*
      Save conversation if the tables exist.
    */

    const {
      data: conversation,
      error: conversationError,
    } =
      await supabase
        .from(
          "instagram_conversations"
        )
        .upsert(
          {
            instagram_account_id:
              account.id,

            instagram_scoped_user_id:
              String(senderId),

            username,

            last_message_at:
              new Date(
                event?.timestamp ||
                  Date.now()
              ).toISOString(),

            last_message_text:
              message?.text ||
              null,

            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "instagram_account_id,instagram_scoped_user_id",
          }
        )
        .select("id")
        .single();

    if (
      conversationError ||
      !conversation
    ) {
      console.warn(
        "CONVERSATION SAVE ERROR:",
        conversationError
      );

      return;
    }

    await supabase
      .from(
        "instagram_messages"
      )
      .upsert(
        {
          conversation_id:
            conversation.id,

          instagram_message_id:
            message.mid ||
            null,

          direction:
            "inbound",

          message_text:
            message.text ||
            null,

          sent_at:
            new Date(
              event?.timestamp ||
                Date.now()
            ).toISOString(),

          raw_payload:
            event,
        },
        {
          onConflict:
            "instagram_message_id",
        }
      );
  } catch (error) {
    console.error(
      "MESSAGE EVENT ERROR:",
      error
    );
  }
}