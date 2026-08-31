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

  trigger_type: string | null;
  trigger_keywords: string[] | null;

  // Kept for backward compatibility.
  trigger_keyword: string | null;

  dm_message: string;
  reply_enabled: boolean | null;

  // Backward-compatible single reply.
  reply_text: string | null;

  // Multiple public replies used in rotation.
  reply_texts: string[] | null;

  button_name: string | null;
  button_url: string | null;
  followup_enabled: boolean | null;
  followup_delay_minutes: number | null;
  followup_message: string | null;
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
          const value = change.value;

          // Handle deleted Instagram comments
          if (
            value?.verb === "remove" ||
            value?.action === "delete" ||
            value?.deleted === true ||
            value?.verb === "delete"
          ) {
            console.log(
              "INSTAGRAM COMMENT DELETE RECEIVED"
            );

            await deleteInstagramComment(
              value
            );

            continue;
          }

          await processComment(
            webhookInstagramUserId,
            value
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
   * Refresh token if necessary.
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
     * Continue using the existing token.
     * If Instagram rejects it, the actual API
     * error will be logged later.
     */

    return data;
  }
}



/* =========================================================
   DELETE INSTAGRAM COMMENT
========================================================= */

async function deleteInstagramComment(
  value: any
) {
  try {
    const commentId =
      value?.id ||
      value?.comment_id ||
      value?.comment?.id
        ? String(
            value?.id ||
            value?.comment_id ||
            value?.comment?.id
          )
        : "";

    console.log(
      "INSTAGRAM DELETE EVENT:",
      JSON.stringify(value, null, 2)
    );

    if (!commentId) {
      console.warn(
        "DELETE COMMENT ID MISSING",
        value
      );
      return;
    }

    const supabase =
      createAdminClient();

    const { error } =
      await supabase
        .from("instagram_comments")
        .delete()
        .eq(
          "instagram_comment_id",
          commentId
        );

    if (error) {
      console.error(
        "DELETE INSTAGRAM COMMENT ERROR:",
        error
      );
      return;
    }

    console.log(
      "INSTAGRAM COMMENT DELETED:",
      commentId
    );

  } catch (error) {
    console.error(
      "DELETE COMMENT PROCESSING ERROR:",
      error
    );
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

    // Ignore comments created by our own Instagram account.
    // Meta sends our public replies back through the comments webhook.
    if (
      commenterId &&
      commenterId === webhookInstagramUserId
    ) {
      console.log(
        "IGNORING OWN INSTAGRAM COMMENT:",
        {
          commentId,
          commentText,
          commenterId,
          webhookInstagramUserId,
        }
      );

      return;
    }

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
       DUPLICATE COMMENT CHECK
       Prevent Meta webhook retries from sending
       duplicate DM/public replies
    ===================================================== */

    const { data: existingComment } =
      await supabase
        .from("instagram_comments")
        .select(
          "id, dm_sent, public_reply_sent"
        )
        .eq(
          "instagram_comment_id",
          commentId
        )
        .maybeSingle();


    if (existingComment) {

      console.log(
        "DUPLICATE COMMENT IGNORED:",
        commentId
      );

      return;

    }


    /* =====================================================
       1. FIND ACTIVE AUTOMATIONS BY POST
    ===================================================== */

    const {
      data: post,
      error: postError,
    } = await supabase
      .from(
        "instagram_posts"
      )
      .select(
        "id, instagram_media_id, instagram_account_id"
      )
      .eq(
        "instagram_media_id",
        mediaId
      )
      .maybeSingle();

    console.log(
      "MATCHED POST:",
      post
    );

    if (postError) {
      console.error(
        "POST LOOKUP ERROR:",
        postError
      );
      return;
    }

    if (!post) {
      console.log(
        "NO POST FOUND FOR MEDIA:",
        mediaId
      );
      return;
    }

    /*
     * IMPORTANT:
     *
     * instagram_automations.instagram_post_id stores the
     * Supabase instagram_posts.id UUID.
     *
     * The webhook receives the Instagram MEDIA ID, so we first
     * find the matching instagram_posts row above and then use
     * post.id to find the automation.
     */
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
        instagram_account_id,
        instagram_post_id,
        trigger_type,
        trigger_keywords,
        trigger_keyword,
        dm_message,
        reply_enabled,
        reply_text,
        reply_texts,
        button_name,
        button_url,
        followup_enabled,
        followup_delay_minutes,
        followup_message,
        is_active
        `
      )
      .eq(
        "instagram_post_id",
        post.id
      )
      .eq(
        "instagram_account_id",
        post.instagram_account_id
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
       2. FIND MATCHING AUTOMATION + ACCOUNT
    ===================================================== */

    const normalizedComment =
      commentText
        .toLowerCase()
        .trim();

    let matchedAutomation:
      | Automation
      | null = null;

    let matchedAccount:
      | InstagramAccount
      | null = null;

    for (
      const rawAutomation of automations
    ) {
      const automation =
        rawAutomation as Automation;

      if (
        !automation
          .instagram_account_id
      ) {
        continue;
      }

      const account =
        await getInstagramAccount(
          automation
            .instagram_account_id
        );

      if (!account) {
        continue;
      }

      /*
       * Security check:
       * automation and account must belong
       * to the same user.
       */

      if (
        account.user_id !==
        automation.user_id
      ) {
        console.warn(
          "USER ID MISMATCH:",
          {
            automationUserId:
              automation.user_id,

            accountUserId:
              account.user_id,

            automationId:
              automation.id,

            accountId:
              account.id,
          }
        );

        continue;
      }

      /*
       * ===================================================
       * TRIGGER MATCHING
       * ===================================================
       */

      const triggerType =
        (
          automation.trigger_type ||
          "keywords"
        )
          .toLowerCase()
          .trim();

      /*
       * ANY COMMENT
       */

      if (
        triggerType ===
        "any_comment"
      ) {
        console.log(
          "ANY COMMENT TRIGGER MATCHED:",
          {
            automationId:
              automation.id,
            comment:
              normalizedComment,
          }
        );

        matchedAutomation =
          automation;

        matchedAccount =
          account;

        break;
      }

      /*
       * KEYWORDS
       */

      let keywords: string[] =
        [];

      if (
        Array.isArray(
          automation.trigger_keywords
        )
      ) {
        keywords =
          automation.trigger_keywords
            .map(
              (keyword) =>
                String(
                  keyword
                )
                  .trim()
                  .toLowerCase()
            )
            .filter(Boolean);
      }

      /*
       * Backward compatibility:
       * If the new array is empty, use
       * the old trigger_keyword column.
       */

      if (
        keywords.length === 0 &&
        automation.trigger_keyword
      ) {
        keywords = [
          String(
            automation.trigger_keyword
          )
            .trim()
            .toLowerCase(),
        ].filter(Boolean);
      }

      console.log(
        "KEYWORD CHECK:",
        {
          comment:
            normalizedComment,

          triggerType,

          keywords,
        }
      );

      if (
        keywords.length === 0
      ) {
        console.warn(
          "AUTOMATION HAS NO KEYWORDS:",
          automation.id
        );

        continue;
      }

      /*
       * Match ANY configured keyword.
       */

      const matchedKeyword =
        keywords.find(
          (keyword) =>
            normalizedComment.includes(
              keyword
            )
        );

      if (
        !matchedKeyword
      ) {
        console.log(
          "NO KEYWORD MATCH:",
          {
            automationId:
              automation.id,

            keywords,
          }
        );

        continue;
      }

      console.log(
        "KEYWORD MATCHED:",
        {
          automationId:
            automation.id,

          keyword:
            matchedKeyword,
        }
      );

      matchedAutomation =
        automation;

      matchedAccount =
        account;

      break;
    }

    /*
     * No matching automation.
     */

    if (
      !matchedAutomation ||
      !matchedAccount
    ) {
      console.log(
        "NO AUTOMATION MATCHED COMMENT:",
        {
          mediaId,
          comment:
            normalizedComment,
        }
      );

      return;
    }

    const selectedAutomation =
      matchedAutomation;

    const account =
      matchedAccount;

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

      triggerType:
        selectedAutomation
          .trigger_type,

      triggerKeywords:
        selectedAutomation
          .trigger_keywords,

      legacyKeyword:
        selectedAutomation
          .trigger_keyword,

      dm:
        selectedAutomation.dm_message,

      replyEnabled:
        selectedAutomation.reply_enabled,

      replyText:
        selectedAutomation.reply_text,

      replyTexts:
        selectedAutomation.reply_texts,
    });

    console.log("PUBLIC REPLY DEBUG:", {
      replyEnabled: selectedAutomation.reply_enabled,
      replyEnabledType: typeof selectedAutomation.reply_enabled,
      replyText: selectedAutomation.reply_text,
      replyTextType: typeof selectedAutomation.reply_text,
      replyTexts: selectedAutomation.reply_texts,
      replyTextsType: typeof selectedAutomation.reply_texts,
      hasAccessToken: Boolean(account.access_token),
    });

    console.log(
      "========================================"
    );

    /* =====================================================
       3. SEND PUBLIC COMMENT REPLY
    ===================================================== */

    let publicReplySent = false;

    if (
      selectedAutomation.reply_enabled &&
      account.access_token
    ) {
      /*
       * Get the next public reply from Supabase.
       *
       * The database function:
       *   get_next_instagram_reply(UUID)
       *
       * atomically:
       *   1. reads the current rotation index
       *   2. returns the current reply
       *   3. advances the index
       *   4. wraps back to the first reply
       *
       * This prevents concurrent comments from accidentally
       * using the same rotation position.
       *
       * Existing reply_text remains the fallback for old
       * automations that have not been migrated to reply_texts.
       */
      console.log(
        "GETTING NEXT ROTATING PUBLIC REPLY:",
        {
          automationId:
            selectedAutomation.id,
        }
      );

      const {
        data: rotatingReply,
        error: rotatingReplyError,
      } = await supabase.rpc(
        "get_next_instagram_reply",
        {
          p_automation_id:
            selectedAutomation.id,
        }
      );

      if (rotatingReplyError) {
        console.error(
          "ROTATING REPLY DATABASE ERROR:",
          {
            automationId: selectedAutomation.id,
            commentId,
            error: rotatingReplyError,
          }
        );

        /*
         * IMPORTANT:
         *
         * If reply_texts contains replies, do NOT silently
         * fall back to reply_text. reply_text is normally
         * Reply 1, which would hide a rotation failure.
         *
         * Only use legacy reply_text when this automation
         * has no configured reply_texts.
         */
        const configuredReplies =
          Array.isArray(
            selectedAutomation.reply_texts
          )
            ? selectedAutomation.reply_texts
                .map((reply) =>
                  String(reply).trim()
                )
                .filter(Boolean)
            : [];

        if (
          configuredReplies.length === 0 &&
          selectedAutomation.reply_text
        ) {
          const fallbackReply =
            String(
              selectedAutomation.reply_text
            ).trim();

          if (fallbackReply) {
            console.warn(
              "USING LEGACY PUBLIC REPLY FALLBACK:",
              {
                automationId:
                  selectedAutomation.id,
                commentId,
                message: fallbackReply,
              }
            );

            const publicReply =
              await replyToInstagramComment({
                commentId,
                message: fallbackReply,
                accessToken:
                  account.access_token,
              });

            publicReplySent =
              publicReply.success;

            console.log(
              "PUBLIC COMMENT REPLY RESULT:",
              publicReply
            );
          }
        } else {
          console.error(
            "ROTATING PUBLIC REPLY NOT SENT BECAUSE THE ROTATION RPC FAILED.",
            {
              automationId:
                selectedAutomation.id,
              commentId,
              configuredReplyCount:
                configuredReplies.length,
            }
          );
        }
      } else if (
        rotatingReply &&
        String(rotatingReply).trim()
      ) {
        const replyMessage =
          String(rotatingReply).trim();

        console.log(
          "ROTATING REPLY SELECTED:",
          {
            automationId:
              selectedAutomation.id,
            commentId,
            selectedReply:
              replyMessage,
            configuredReplyCount:
              Array.isArray(
                selectedAutomation.reply_texts
              )
                ? selectedAutomation.reply_texts.length
                : 0,
          }
        );

        console.log(
          "SENDING ROTATING PUBLIC COMMENT REPLY:",
          {
            automationId:
              selectedAutomation.id,
            commentId,
            message: replyMessage,
          }
        );

        const publicReply =
          await replyToInstagramComment({
            commentId,
            message: replyMessage,
            accessToken:
              account.access_token,
          });

        publicReplySent =
          publicReply.success;

        console.log(
          "PUBLIC COMMENT REPLY RESULT:",
          publicReply
        );
      } else {
        console.log(
          "NO PUBLIC REPLY CONFIGURED:",
          {
            automationId:
              selectedAutomation.id,
          }
        );
      }
    } else if (
      selectedAutomation.reply_enabled &&
      !account.access_token
    ) {
      console.error(
        "PUBLIC COMMENT REPLY FAILED: ACCESS TOKEN MISSING"
      );
    }


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

    let trackedButtonUrl: string | null = null;
    let linkClickId: string | null = null;

    if (
      selectedAutomation.followup_enabled &&
      selectedAutomation.button_url &&
      selectedAutomation.followup_message
    ) {
      const token = crypto.randomUUID();
      const targetUrl = selectedAutomation.button_url.trim();
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.APP_URL?.trim() ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : null);

      if (baseUrl) {
        const { data: clickRow, error: clickError } = await supabase
          .from("instagram_automation_link_clicks")
          .insert({
            automation_id: selectedAutomation.id,
            recipient_instagram_id: String(commenterId).trim(),
            target_url: targetUrl,
            token,
          })
          .select("id")
          .single();

        if (clickError || !clickRow) {
          console.error("AUTOMATION LINK TRACKER CREATE ERROR:", clickError);
        } else {
          linkClickId = clickRow.id;
          trackedButtonUrl = `${baseUrl.replace(/\/$/, "")}/api/track/automation-link/${token}`;
        }
      } else {
        console.error(
          "FOLLOW-UP ENABLED BUT APP URL IS NOT CONFIGURED. Set NEXT_PUBLIC_APP_URL or APP_URL."
        );
      }
    }

    const result =
      await sendPrivateReply({
        instagramUserId:
          webhookInstagramUserId,

        accessToken:
          account.access_token,

        commentId,

        message:
          dmMessage,

        buttonName:
          selectedAutomation.button_name,

        buttonUrl:
          trackedButtonUrl || selectedAutomation.button_url,
      });

    console.log(
      "PRIVATE DM RESULT:",
      result
    );

    let dmSent = false;

    if (!result.success) {
      console.error(
        "PRIVATE INSTAGRAM DM FAILED:",
        result.data ||
          result.error
      );

      if (linkClickId) {
        await supabase
          .from("instagram_automation_link_clicks")
          .delete()
          .eq("id", linkClickId);
      }
    } else {
      dmSent = true;

      if (
        linkClickId &&
        selectedAutomation.followup_enabled &&
        selectedAutomation.followup_message
      ) {
        const delayMinutes = Math.min(1380, Math.max(60, Number(
          selectedAutomation.followup_delay_minutes ?? 360
        ) || 360));

        const { error: followupError } = await supabase
          .from("instagram_automation_followups")
          .insert({
            automation_id: selectedAutomation.id,
            link_click_id: linkClickId,
            recipient_instagram_id: String(commenterId).trim(),
            followup_message: selectedAutomation.followup_message.trim(),
            due_at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
          });

        if (followupError) {
          console.error("AUTOMATION FOLLOW-UP CREATE ERROR:", followupError);
        }
      }
    }

    await saveInstagramComment({
      accountId: account.id,
      commentId,
      mediaId,
      commenterId,
      commenterUsername,
      commentText,
      automationId: selectedAutomation.id,
      dmSent,
      publicReplySent,
    });

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
      "TRIGGER TYPE:",
      selectedAutomation
        .trigger_type
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

async function saveInstagramComment({
  accountId,
  commentId,
  mediaId,
  commenterId,
  commenterUsername,
  commentText,
  automationId,
  dmSent,
  publicReplySent,
}: {
  accountId: string;
  commentId: string;
  mediaId: string;
  commenterId: string | null;
  commenterUsername: string | null;
  commentText: string;
  automationId: string | null;
  dmSent: boolean;
  publicReplySent: boolean;
}) {
  const supabase = createAdminClient();

  const { data: post } = await supabase
    .from("instagram_posts")
    .select("id")
    .eq("instagram_media_id", mediaId)
    .maybeSingle();

  /*
   * Automations are stored in instagram_automations.
   *
   * Do NOT look up the automation in the old "automations" table.
   * That was a separate automation schema and caused valid
   * instagram_automations IDs to be rejected when saving comments.
   *
   * Keep the automation ID only if instagram_comments.automation_id
   * is configured to reference instagram_automations.id.
   *
   * If your current database still has a foreign key from
   * instagram_comments.automation_id -> automations.id, leave this
   * value null until that database constraint is migrated.
   */
  let safeAutomationId: string | null = null;

  if (automationId) {
    const { data: currentAutomation, error: currentAutomationError } =
      await supabase
        .from("instagram_automations")
        .select("id")
        .eq("id", automationId)
        .maybeSingle();

    if (currentAutomationError) {
      console.warn(
        "INSTAGRAM AUTOMATION LOOKUP FAILED:",
        currentAutomationError
      );
    } else if (currentAutomation) {
      safeAutomationId = currentAutomation.id;
    } else {
      console.warn(
        "INSTAGRAM AUTOMATION ID NOT FOUND:",
        automationId
      );
    }
  }

  const { error } = await supabase
    .from("instagram_comments")
    .upsert(
      {
        instagram_account_id: accountId,
        instagram_post_id: post?.id ?? null,
        instagram_comment_id: commentId,
        commenter_instagram_id: commenterId,
        commenter_username: commenterUsername,
        comment_text: commentText,
        automation_id: safeAutomationId,
        dm_sent: dmSent,
        public_reply_sent: publicReplySent,
      },
      {
        onConflict: "instagram_comment_id",
      }
    );

  if (error) {
    console.error(
      "SAVE INSTAGRAM COMMENT ERROR:",
      error
    );
  } else {
    console.log(
      "COMMENT SAVED FOR REALTIME"
    );
  }
}


/* =========================================================
   SEND PUBLIC COMMENT REPLY
========================================================= */

async function replyToInstagramComment({
  commentId,
  message,
  accessToken,
}: {
  commentId: string;
  message: string;
  accessToken: string;
}) {
  try {
    const response = await fetch(
      graphUrl(`${commentId}/replies`),
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          message,
          access_token:
            accessToken,
        }),

        cache: "no-store",
      }
    );

    const data = await readJson(response);

    console.log(
      "COMMENT REPLY STATUS:",
      response.status
    );

    console.log(
      "PUBLIC COMMENT REPLY RESPONSE:",
      JSON.stringify(data, null, 2)
    );

    return {
      success: response.ok,
      data,
    };

  } catch (error) {
    console.error(
      "PUBLIC COMMENT REPLY ERROR:",
      error
    );

    return {
      success:false,
      error,
    };
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
  buttonName,
  buttonUrl,
}: {
  instagramUserId: string;
  accessToken: string;
  commentId: string;
  message: string;
  buttonName?: string | null;
  buttonUrl?: string | null;
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

            message:
              buttonName && buttonUrl
                ? {
                    attachment: {
                      type: "template",
                      payload: {
                        template_type: "button",
                        text: message,
                        buttons: [
                          {
                            type: "web_url",
                            url: buttonUrl,
                            title: buttonName,
                          },
                        ],
                      },
                    },
                  }
                : {
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
    // Ignore outgoing messages echoed back by Meta.
    // Prevents our own DMs from being processed as inbound messages.
    if (
      event?.message?.is_self === true ||
      event?.message?.is_echo === true
    ) {
      console.log(
        "IGNORING OWN INSTAGRAM MESSAGE ECHO:",
        {
          isSelf: event?.message?.is_self,
          isEcho: event?.message?.is_echo,
          messageId: event?.message?.mid ?? null,
        }
      );

      return;
    }

    console.log(
      "PROCESSING INSTAGRAM MESSAGE:",
      JSON.stringify(event, null, 2)
    );

    const senderId =
      event?.sender?.id
        ? String(event.sender.id)
        : null;

    const recipientId =
      event?.recipient?.id
        ? String(event.recipient.id)
        : webhookInstagramUserId;

    const messageId =
      event?.message?.mid
        ? String(event.message.mid)
        : null;

    const text =
      event?.message?.text
        ? String(event.message.text)
        : "";

    if (!senderId || !messageId) {
      console.warn(
        "MESSAGE DATA MISSING",
        {
          senderId,
          messageId,
        }
      );
      return;
    }

    const supabase = createAdminClient();

    const { data: account } =
      await supabase
        .from("instagram_accounts")
        .select("id")
        .eq(
          "webhook_instagram_user_id",
          webhookInstagramUserId
        )
        .maybeSingle();

    if (!account) {
      console.warn(
        "INSTAGRAM ACCOUNT NOT FOUND"
      );
      return;
    }

    const { error } =
      await supabase
        .from("instagram_messages")
        .insert({
          instagram_message_id: messageId,
          sender_instagram_id: senderId,
          recipient_instagram_id: recipientId,
          message_text: text,
          direction: "inbound",
          message_type: "text",
          is_read: false,
          raw_payload: event,
          created_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        });

    if (error) {
      console.error(
        "SAVE INSTAGRAM MESSAGE ERROR:",
        error
      );
      return;
    }

    console.log(
      "INSTAGRAM MESSAGE SAVED FOR REALTIME"
    );

  } catch (error) {
    console.error(
      "MESSAGE PROCESSING ERROR:",
      error
    );
  }
}