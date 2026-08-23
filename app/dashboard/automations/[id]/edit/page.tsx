import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import PostSelector from "../../new/PostSelector";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type InstagramPost = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  published_at: string | null;
};

type Automation = {
  id: string;
  user_id: string;
  instagram_account_id: string;
  instagram_post_id: string;
  trigger_type: string | null;
  trigger_keywords: string[] | null;
  trigger_keyword: string | null;
  dm_message: string;
  reply_enabled: boolean | null;
  reply_text: string | null;
  button_name: string | null;
  button_url: string | null;
  is_active: boolean;
};

export default async function EditAutomationPage({
  params,
}: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return (
      <main className="min-h-screen bg-[#05070d] p-10 text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">
            Authentication Error
          </h1>

          <pre className="mt-5 rounded-xl bg-red-500/10 p-5 text-sm text-red-300">
            {authError.message}
          </pre>
        </div>
      </main>
    );
  }

  if (!user) {
    redirect("/admin/login");
  }

  /*
   * =========================================================
   * LOAD AUTOMATION
   * =========================================================
   */

  const {
    data: automation,
    error: automationError,
  } = await supabase
    .from("instagram_automations")
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
      button_name,
      button_url,
      is_active
      `
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (automationError) {
    return (
      <main className="min-h-screen bg-[#05070d] p-10 text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">
            Failed to load automation
          </h1>

          <pre className="mt-5 rounded-xl bg-red-500/10 p-5 text-sm text-red-300">
            {automationError.message}
          </pre>
        </div>
      </main>
    );
  }

  if (!automation) {
    return (
      <main className="min-h-screen bg-[#05070d] p-10 text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">
            Automation not found
          </h1>

          <p className="mt-2 text-sm text-white/40">
            This automation does not exist or you do not have
            access to it.
          </p>

          <Link
            href="/dashboard/automations"
            className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500"
          >
            Back to Automations
          </Link>
        </div>
      </main>
    );
  }

  /*
   * TypeScript now knows automation is not null.
   *
   * Keep a separate constant so nested/server-action code
   * doesn't cause "possibly null" narrowing problems.
   */

  const automationData: Automation = automation;

  /*
   * =========================================================
   * LOAD INSTAGRAM ACCOUNT
   * =========================================================
   */

  const {
    data: account,
    error: accountError,
  } = await supabase
    .from("instagram_accounts")
    .select(
      `
      id,
      instagram_user_id,
      username,
      profile_picture_url
      `
    )
    .eq(
      "id",
      automationData.instagram_account_id
    )
    .eq("user_id", user.id)
    .eq("is_connected", true)
    .maybeSingle();

  /*
   * =========================================================
   * LOAD POSTS
   * =========================================================
   */

  let posts: InstagramPost[] = [];
  let postsError: string | null = null;

  if (account) {
    const {
      data,
      error,
    } = await supabase
      .from("instagram_posts")
      .select(
        `
        id,
        instagram_media_id,
        caption,
        media_type,
        media_url,
        permalink,
        published_at
        `
      )
      .eq(
        "instagram_account_id",
        account.id
      )
      .order("published_at", {
        ascending: false,
      })
      .limit(100);

    if (error) {
      postsError = error.message;
    } else {
      posts =
        (data ?? []) as InstagramPost[];
    }
  }

  /*
   * =========================================================
   * CURRENT VALUES
   * =========================================================
   */

  const currentTriggerType =
    automationData.trigger_type ||
    "keywords";

  const currentKeywords =
    Array.isArray(
      automationData.trigger_keywords
    )
      ? automationData.trigger_keywords
      : automationData.trigger_keyword
        ? [automationData.trigger_keyword]
        : [];

  /*
   * =========================================================
   * UPDATE AUTOMATION
   * =========================================================
   */

  async function updateAutomation(
    formData: FormData
  ) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/admin/login");
    }

    const instagramPostId =
      String(
        formData.get(
          "instagram_post_id"
        ) ?? ""
      ).trim();

    const triggerType =
      String(
        formData.get(
          "trigger_type"
        ) ?? "keywords"
      ).trim();

    const rawKeywords =
      String(
        formData.get(
          "trigger_keywords"
        ) ?? ""
      );

    const dmMessage =
      String(
        formData.get(
          "dm_message"
        ) ?? ""
      ).trim();

    const replyEnabled =
      formData.get("reply_enabled") === "on";

    const replyText =
      String(
        formData.get("reply_text") ?? ""
      ).trim();

    const buttonName =
      String(
        formData.get(
          "button_name"
        ) ?? ""
      ).trim();

    const buttonUrl =
      String(
        formData.get(
          "button_url"
        ) ?? ""
      ).trim();

    console.log("EDIT DM BUTTON DATA:", {
      buttonName,
      buttonUrl,
    });

    const isActive =
      formData.get(
        "is_active"
      ) === "on";

    /*
     * Normalize keywords.
     */

    const triggerKeywords =
      Array.from(
        new Set(
          rawKeywords
            .split(/[\n,]+/)
            .map((keyword) =>
              keyword
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
        )
      );

    /*
     * Validation.
     */

    if (!instagramPostId) {
      redirect(
        `/dashboard/automations/${id}/edit?error=Please+select+an+Instagram+post.`
      );
    }

    if (
      triggerType !==
        "keywords" &&
      triggerType !==
        "any_comment"
    ) {
      redirect(
        `/dashboard/automations/${id}/edit?error=Invalid+trigger+type.`
      );
    }

    if (
      triggerType ===
        "keywords" &&
      triggerKeywords.length === 0
    ) {
      redirect(
        `/dashboard/automations/${id}/edit?error=Please+enter+at+least+one+keyword.`
      );
    }

    if (!dmMessage) {
      redirect(
        `/dashboard/automations/${id}/edit?error=Please+enter+a+DM+message.`
      );
    }

    /*
     * Make sure the selected post belongs
     * to this automation's Instagram account.
     */

    const {
      data: post,
      error: postError,
    } = await supabase
      .from("instagram_posts")
      .select(
        `
        id,
        instagram_media_id,
        instagram_account_id
        `
      )
      .eq(
        "id",
        instagramPostId
      )
      .eq(
        "instagram_account_id",
        automationData.instagram_account_id
      )
      .maybeSingle();

    if (postError) {
      redirect(
        `/dashboard/automations/${id}/edit?error=${encodeURIComponent(
          postError.message
        )}`
      );
    }

    if (!post) {
      redirect(
        `/dashboard/automations/${id}/edit?error=Selected+Instagram+post+was+not+found.`
      );
    }

    /*
     * Keep the old trigger_keyword column populated
     * for backward compatibility with the current webhook.
     */

    const legacyKeyword =
      triggerType ===
      "keywords"
        ? triggerKeywords[0] ?? ""
        : "";

    /*
     * Update automation.
     */

    const {
      error: updateError,
    } = await supabase
      .from(
        "instagram_automations"
      )
      .update({
        instagram_post_id:
          post.id,

        trigger_type:
          triggerType,

        trigger_keywords:
          triggerKeywords,

        trigger_keyword:
          legacyKeyword,

        dm_message:
          dmMessage,

        reply_enabled:
          replyEnabled,

        reply_text:
          replyEnabled && replyText
            ? replyText
            : null,

        button_name:
          buttonName.trim() || null,

        button_url:
          buttonUrl.trim() || null,

        is_active:
          isActive,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        id
      )
      .eq(
        "user_id",
        user.id
      );

    if (updateError) {
      redirect(
        `/dashboard/automations/${id}/edit?error=${encodeURIComponent(
          updateError.message
        )}`
      );
    }

    redirect(
      "/dashboard/automations"
    );
  }

  /*
   * =========================================================
   * PAGE
   * =========================================================
   */

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <header className="border-b border-white/[0.06] bg-[#070707]">
        <div className="mx-auto max-w-5xl px-6 py-7">
          <Link
            href="/dashboard/automations"
            className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 transition-colors hover:text-white"
          >
            <span className="text-base">←</span>
            Back to Automations
          </Link>

          <div className="mt-4 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff1744]" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-600">
              DevilX / Automation Engine
            </p>
          </div>

          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            Edit Automation
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Update your Instagram comment-to-DM automation.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-9">
        {accountError && (
          <div className="mb-6 rounded-[22px] border border-red-500/15 bg-red-500/[0.05] p-5">
            <h2 className="font-semibold text-red-300">
              Instagram account error
            </h2>
            <p className="mt-2 text-sm text-red-200/60">
              {accountError.message}
            </p>
          </div>
        )}

        {postsError && (
          <div className="mb-6 rounded-[22px] border border-red-500/15 bg-red-500/[0.05] p-5">
            <h2 className="font-semibold text-red-300">
              Posts error
            </h2>
            <p className="mt-2 text-sm text-red-200/60">
              {postsError}
            </p>
          </div>
        )}

        {!account ? (
          <div className="rounded-[26px] border border-yellow-500/15 bg-yellow-500/[0.04] p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-yellow-500/10 bg-yellow-500/[0.06] text-yellow-300">
              !
            </div>

            <h2 className="mt-5 text-xl font-semibold text-yellow-100">
              Instagram account not available
            </h2>

            <p className="mt-2 max-w-lg text-sm leading-6 text-yellow-100/50">
              The Instagram account connected to this automation is no longer
              active.
            </p>

            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-xl bg-[#ff1744] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#e9143d]"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <form
            action={updateAutomation}
            className="rounded-[28px] border border-white/[0.07] bg-[#0a0a0a] p-6 shadow-2xl shadow-black/30 sm:p-8"
          >
            {/* ACCOUNT */}

            <div className="rounded-[22px] border border-emerald-500/10 bg-emerald-500/[0.045] p-5">
              <div className="flex items-center gap-3">
                {account.profile_picture_url ? (
                  <img
                    src={account.profile_picture_url}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-white/[0.06]"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] text-emerald-400">
                    ◎
                  </div>
                )}

                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-400/50">
                    Instagram Account
                  </p>

                  <p className="mt-1 font-semibold text-emerald-100">
                    @{account.username || "Instagram account"}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-2 rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">
                    Connected
                  </span>
                </div>
              </div>
            </div>

            {/* POST */}

            <div className="mt-9">
              <SectionHeading
                number="01"
                title="Instagram Post"
                description="Select the post where this automation should run."
              />

              <PostSelector
                posts={posts}
                initialPost={
                  posts.find(
                    (post) =>
                      post.id === automationData.instagram_post_id
                  ) ?? null
                }
              />
            </div>

            <Divider />

            {/* TRIGGER */}

            <div>
              <SectionHeading
                number="02"
                title="Trigger"
                description="Choose what should trigger the DM."
              />

              <div className="mt-5 space-y-3">
                <label className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-[#ff1744]/20 hover:bg-[#ff1744]/[0.02]">
                  <input
                    type="radio"
                    name="trigger_type"
                    value="keywords"
                    defaultChecked={currentTriggerType === "keywords"}
                    className="mt-1 h-4 w-4 accent-[#ff1744]"
                  />

                  <div>
                    <p className="font-medium text-white">
                      Specific keywords
                    </p>

                    <p className="mt-1 text-xs leading-5 text-gray-600">
                      Trigger when a comment contains any configured keyword.
                    </p>
                  </div>
                </label>

                <label className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-[#ff1744]/20 hover:bg-[#ff1744]/[0.02]">
                  <input
                    type="radio"
                    name="trigger_type"
                    value="any_comment"
                    defaultChecked={currentTriggerType === "any_comment"}
                    className="mt-1 h-4 w-4 accent-[#ff1744]"
                  />

                  <div>
                    <p className="font-medium text-white">
                      Any comment
                    </p>

                    <p className="mt-1 text-xs leading-5 text-gray-600">
                      Trigger for every comment on the selected post.
                    </p>
                  </div>
                </label>
              </div>

              <label
                htmlFor="trigger_keywords"
                className="mb-2 mt-6 block text-sm font-medium"
              >
                Keywords
              </label>

              <textarea
                id="trigger_keywords"
                name="trigger_keywords"
                rows={4}
                maxLength={1000}
                defaultValue={currentKeywords.join(", ")}
                placeholder="link, price, details"
                className="w-full resize-y rounded-xl border border-white/[0.08] bg-[#070707] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/40"
              />

              <p className="mt-2 text-xs text-gray-700">
                Separate keywords with commas or new lines.
              </p>
            </div>

            <Divider />

            {/* MESSAGE */}

            <div>
              <SectionHeading
                number="03"
                title="DM Message"
                description="This message will be sent when the trigger matches."
              />

              <textarea
                name="dm_message"
                required
                rows={7}
                maxLength={2000}
                defaultValue={automationData.dm_message}
                className="mt-5 w-full resize-y rounded-xl border border-white/[0.08] bg-[#070707] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/40"
              />

              {/* PUBLIC REPLY */}

              <div className="mt-6 rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
                <label className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      Reply to Comment
                    </p>

                    <p className="mt-1 text-xs text-gray-600">
                      Public reply on Instagram comment
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    name="reply_enabled"
                    defaultChecked={automationData.reply_enabled ?? false}
                    className="h-5 w-5 accent-[#ff1744]"
                  />
                </label>

                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium">
                    Reply Message
                  </label>

                  <textarea
                    name="reply_text"
                    rows={4}
                    defaultValue={automationData.reply_text ?? ""}
                    placeholder="Thanks for commenting ❤️"
                    className="w-full rounded-xl border border-white/[0.08] bg-[#070707] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/40"
                  />
                </div>
              </div>

              {/* CUSTOM BUTTON */}

              <div className="mt-6 rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
                <div className="mb-5 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff1744]/[0.06] text-xs text-[#ff1744]">
                    ↗
                  </span>

                  <div>
                    <p className="text-sm font-medium">
                      Custom DM Button
                    </p>

                    <p className="text-xs text-gray-600">
                      Add an optional clickable button to the DM.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="button_name"
                      className="mb-2 block text-sm font-medium"
                    >
                      Custom Button Name
                    </label>

                    <input
                      id="button_name"
                      name="button_name"
                      defaultValue={automationData.button_name ?? ""}
                      placeholder="Get Course"
                      className="w-full rounded-xl border border-white/[0.08] bg-[#070707] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/40"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="button_url"
                      className="mb-2 block text-sm font-medium"
                    >
                      Button URL
                    </label>

                    <input
                      id="button_url"
                      name="button_url"
                      defaultValue={automationData.button_url ?? ""}
                      placeholder="https://example.com"
                      className="w-full rounded-xl border border-white/[0.08] bg-[#070707] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/40"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* STATUS */}

            <div>
              <SectionHeading
                number="04"
                title="Status"
                description="Control whether this automation is currently running."
              />

              <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5 transition-colors hover:border-white/[0.11]">
                <div>
                  <p className="text-sm font-medium">
                    Automation active
                  </p>

                  <p className="mt-1 text-xs text-gray-600">
                    Turn this off to temporarily stop the automation.
                  </p>
                </div>

                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={automationData.is_active}
                  className="h-5 w-5 accent-[#ff1744]"
                />
              </label>
            </div>

            {/* ACTIONS */}

            <div className="mt-10 flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:justify-end">
              <Link
                href="/dashboard/automations"
                className="inline-flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-3 text-sm font-medium text-gray-500 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                Cancel
              </Link>

              <button
                type="submit"
                className="rounded-xl bg-[#ff1744] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#ff1744]/10 transition-colors hover:bg-[#e9143d]"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff1744]/[0.06] text-[9px] font-bold text-[#ff1744]">
          {number}
        </span>

        <h2 className="text-lg font-semibold">
          {title}
        </h2>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        {description}
      </p>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-9 h-px bg-white/[0.06]" />
  );
}