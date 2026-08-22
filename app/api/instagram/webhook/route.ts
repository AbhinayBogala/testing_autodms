import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  graphUrl,
  readJson,
  refreshAccountIfNeeded,
  isInstagramTokenError,
} from "@/lib/instagram";

type InstagramAccount = {
  id: string;
  user_id: string;
  instagram_user_id: string;
  username: string | null;
  access_token: string | null;
  token_issued_at: string | null;
  token_expires_at: string | null;
  is_connected: boolean;
};

type Automation = {
  id: string;
  user_id: string;
  instagram_account_id: string;
  instagram_post_id: string;
  trigger_keyword: string;
  dm_message: string;
  is_active: boolean;
};

const VERIFY_TOKEN =
  process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

/* =========================================================
   WEBHOOK VERIFICATION
========================================================= */

export async function GET(
  request: NextRequest
) {
  const { searchParams } =
    new URL(request.url);

  const mode =
    searchParams.get("hub.mode");

  const token =
    searchParams.get("hub.verify_token");

  const challenge =
    searchParams.get("hub.challenge");

  console.log(
    "========================================"
  );

  console.log(
    "INSTAGRAM WEBHOOK VERIFICATION"
  );

  console.log({
    mode,
    tokenProvided: Boolean(token),
    verifyTokenConfigured:
      Boolean(VERIFY_TOKEN),
    challengeProvided:
      Boolean(challenge),
  });

  console.log(
    "========================================"
  );

  if (
    mode === "subscribe" &&
    token &&
    VERIFY_TOKEN &&
    token === VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(
      challenge,
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/plain",
        },
      }
    );
  }

  return NextResponse.json(
    {
      error:
        "Verification failed",
    },
    {
      status: 403,
    }
  );
}

/* =========================================================
   WEBHOOK EVENT
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    console.log(
      "========================================"
    );

    console.log(
      "INSTAGRAM WEBHOOK RECEIVED"
    );

    console.log(
      JSON.stringify(
        body,
        null,
        2
      )
    );

    console.log(
      "========================================"
    );

    if (
      body?.object !==
      "instagram"
    ) {
      return NextResponse.json({
        success: true,
        ignored: true,
      });
    }

    const entries =
      Array.isArray(body.entry)
        ? body.entry
        : [];

    for (
      const entry of entries
    ) {
      const webhookInstagramUserId =
        String(
          entry?.id || ""
        );

      console.log(
        "WEBHOOK INSTAGRAM USER ID:",
        webhookInstagramUserId
      );

      const changes =
        Array.isArray(
          entry?.changes
        )
          ? entry.changes
          : [];

      for (
        const change of changes
      ) {
        if (
          change?.field ===
          "comments"
        ) {
          await processComment(
            webhookInstagramUserId,
            change.value
          );
        }
      }

      const messaging =
        Array.isArray(
          entry?.messaging
        )
          ? entry.messaging
          : [];

      for (
        const event of messaging
      ) {
        await processMessage(
          webhookInstagramUserId,
          event
        );
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM WEBHOOK ERROR:",
      error
    );

    return NextResponse.json({
      success: false,
    });
  }
}

/* =========================================================
   FIND CONNECTED ACCOUNT
========================================================= */

async function getInstagramAccount(
  accountId: string
): Promise<InstagramAccount | null> {
  const supabase =
    createAdminClient();

  const {
    data,
    error,
  } = await supabase
    .from(
      "instagram_accounts"
    )
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
      "id",
      accountId
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
      "NO CONNECTED INSTAGRAM ACCOUNT:",
      accountId
    );

    return null;
  }

  /*
    Refresh the token if necessary.
  */

  try {
    const refreshed =
      await refreshAccountIfNeeded(
        data
      );

    return {
      ...data,
      access_token:
        refreshed.accessToken,
    };
  } catch (error) {
    console.warn(
      "TOKEN REFRESH FAILED:",
      error
    );

    /*
      Continue with the existing
      token. If Instagram rejects it,
      we will see the real API error.
    */

    return data;
  }
}

/* =========================================================
   PROCESS COMMENT
========================================================= */

async function processComment(
  webhookInstagramUserId: string,
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
      JSON.stringify(
        value,
        null,
        2
      )
    );

    console.log(
      "========================================"
    );

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
        ? String(
            value.media.id
          )
        : "";

    const commenterId =
      value?.from?.id
        ? String(
            value.from.id
          )
        : null;

    const commenterUsername =
      value?.from?.username ||
      null;

    console.log(
      "COMMENT DATA:",
      {
        webhookInstagramUserId,
        commentId,
        mediaId,
        commentText,
        commenterId,
        commenterUsername,
      }
    );

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

    const supabase =
      createAdminClient();

    /* =====================================================
       1. FIND AUTOMATION BY POST
    ===================================================== */

    const {
      data: automations,
      error:
        automationError,
    } = await supabase
      .from(
        "instagram_automations"
      )
      .select(
        `
        id,
        user_id,
        instagram_account_id,
        instagram_post_id,
        trigger_keyword,
        dm_message,
        is_active
        `
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
       2. FIND AUTOMATION + ACCOUNT
    ===================================================== */

    let selectedAutomation:
      | Automation
      | null = null;

    let account:
      | InstagramAccount
      | null = null;

    for (
      const automation of automations
    ) {
      if (
        !automation
          .instagram_account_id
      ) {
        continue;
      }

      const candidate =
        await getInstagramAccount(
          automation
            .instagram_account_id
        );

      if (!candidate) {
        continue;
      }

      /*
        Security check:
        automation and Instagram account
        must belong to the same user.
      */

      if (
        candidate.user_id !==
        automation.user_id
      ) {
        console.warn(
          "USER ID MISMATCH:",
          {
            automationUserId:
              automation.user_id,

            accountUserId:
              candidate.user_id,

            automationId:
              automation.id,

            accountId:
              candidate.id,
          }
        );

        continue;
      }

      selectedAutomation =
        automation;

      account =
        candidate;

      break;
    }

    if (
      !selectedAutomation ||
      !account
    ) {
      console.warn(
        "NO INSTAGRAM ACCOUNT FOUND FOR AUTOMATION:",
        {
          mediaId,

          webhookInstagramUserId,

          automationCount:
            automations.length,
        }
      );

      return;
    }

    console.log(
      "========================================"
    );

    console.log(
      "INSTAGRAM ACCOUNT FOUND"
    );

    console.log({
      accountId:
        account.id,

      databaseInstagramUserId:
        account.instagram_user_id,

      webhookInstagramUserId,

      username:
        account.username,

      automationId:
        selectedAutomation.id,
    });

    console.log(
      "========================================"
    );

    /* =====================================================
       3. KEYWORD MATCH
    ===================================================== */

    const normalizedComment =
      commentText
        .toLowerCase()
        .trim();

    const keyword =
      String(
        selectedAutomation
          .trigger_keyword ||
          ""
      )
        .toLowerCase()
        .trim();

    console.log(
      "KEYWORD CHECK:",
      {
        comment:
          normalizedComment,

        keyword,
      }
    );

    if (!keyword) {
      console.warn(
        "AUTOMATION KEYWORD IS EMPTY"
      );

      return;
    }

    if (
      !normalizedComment.includes(
        keyword
      )
    ) {
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

    console.log({
      automationId:
        selectedAutomation.id,

      postId:
        selectedAutomation
          .instagram_post_id,

      keyword:
        selectedAutomation
          .trigger_keyword,

      dm:
        selectedAutomation.dm_message,
    });

    console.log(
      "========================================"
    );

    /* =====================================================
       4. SEND PRIVATE REPLY
    ===================================================== */

    if (!account.access_token) {
      console.error(
        "INSTAGRAM ACCESS TOKEN MISSING"
      );

      return;
    }

    const dmMessage =
      String(
        selectedAutomation
          .dm_message ||
          ""
      ).trim();

    if (!dmMessage) {
      console.warn(
        "DM MESSAGE IS EMPTY"
      );

      return;
    }

    console.log(
      "SENDING PRIVATE INSTAGRAM DM..."
    );

    const result =
      await sendPrivateReply({
        instagramUserId:
          webhookInstagramUserId,

        accessToken:
          account.access_token,

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
        "PRIVATE INSTAGRAM DM FAILED:",
        result.data ||
          result.error
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
      keyword
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
      "COMMENT PROCESSING ERROR:",
      error
    );
  }
}

/* =========================================================
   SEND PRIVATE COMMENT REPLY
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
      "INSTAGRAM DM ENDPOINT:",
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
      await readJson(
        response
      );

    console.log(
      "INSTAGRAM DM API RESPONSE:",
      {
        status:
          response.status,

        ok:
          response.ok,

        data,
      }
    );

    if (!response.ok) {
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
   PROCESS INSTAGRAM MESSAGES
========================================================= */

async function processMessage(
  webhookInstagramUserId: string,
  event: any
) {
  try {
    /*
      Message handling is kept separate from
      comment-to-DM automation.
    */

    console.log(
      "INSTAGRAM MESSAGE EVENT:",
      {
        webhookInstagramUserId,
        event,
      }
    );
  } catch (error) {
    console.error(
      "MESSAGE PROCESSING ERROR:",
      error
    );
  }
}