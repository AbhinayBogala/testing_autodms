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
    <main className="min-h-screen bg-[#05070d] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Link
            href="/dashboard/automations"
            className="text-sm text-white/40 transition hover:text-white"
          >
            ← Back to Automations
          </Link>

          <h1 className="mt-3 text-2xl font-bold">
            Edit Automation
          </h1>

          <p className="mt-1 text-sm text-white/40">
            Update your Instagram comment-to-DM automation.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {accountError && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
            <h2 className="font-semibold text-red-300">
              Instagram account error
            </h2>

            <p className="mt-2 text-sm text-red-200/70">
              {accountError.message}
            </p>
          </div>
        )}

        {postsError && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
            <h2 className="font-semibold text-red-300">
              Posts error
            </h2>

            <p className="mt-2 text-sm text-red-200/70">
              {postsError}
            </p>
          </div>
        )}

        {!account ? (
          <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-8">
            <h2 className="text-xl font-semibold text-yellow-200">
              Instagram account not available
            </h2>

            <p className="mt-2 text-sm text-yellow-100/60">
              The Instagram account connected to this
              automation is no longer active.
            </p>

            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <form
            action={updateAutomation}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-8"
          >
            {/* ACCOUNT */}

            <div className="mb-8 rounded-2xl border border-green-500/20 bg-green-500/10 p-5">
              <div className="flex items-center gap-3">
                {account.profile_picture_url ? (
                  <img
                    src={
                      account.profile_picture_url
                    }
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                    ◎
                  </div>
                )}

                <div>
                  <p className="text-xs uppercase tracking-wider text-green-300/60">
                    Instagram Account
                  </p>

                  <p className="mt-1 font-semibold text-green-100">
                    @{account.username ||
                      "Instagram account"}
                  </p>
                </div>
              </div>
            </div>

            {/* POST */}

            <div>
              <h2 className="text-lg font-semibold">
                1. Instagram Post
              </h2>

              <p className="mt-2 text-sm text-white/40">
                Select the post where this automation should run.
              </p>

              <PostSelector
                posts={posts}
                initialPost={
                  posts.find(
                    (post) =>
                      post.id ===
                      automationData.instagram_post_id
                  ) ?? null
                }
              />
            </div>

            <div className="my-8 h-px bg-white/10" />

            {/* TRIGGER */}

            <div>
              <h2 className="text-lg font-semibold">
                2. Trigger
              </h2>

              <p className="mt-2 text-sm text-white/40">
                Choose what should trigger the DM.
              </p>

              <div className="mt-5 space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <input
                    type="radio"
                    name="trigger_type"
                    value="keywords"
                    defaultChecked={
                      currentTriggerType ===
                      "keywords"
                    }
                    className="mt-1 h-4 w-4 accent-blue-600"
                  />

                  <div>
                    <p className="font-medium">
                      Specific keywords
                    </p>

                    <p className="mt-1 text-xs text-white/40">
                      Trigger when a comment contains any configured keyword.
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <input
                    type="radio"
                    name="trigger_type"
                    value="any_comment"
                    defaultChecked={
                      currentTriggerType ===
                      "any_comment"
                    }
                    className="mt-1 h-4 w-4 accent-purple-600"
                  />

                  <div>
                    <p className="font-medium">
                      Any comment
                    </p>

                    <p className="mt-1 text-xs text-white/40">
                      Trigger for every comment on the selected post.
                    </p>
                  </div>
                </label>
              </div>

              <label
                htmlFor="trigger_keywords"
                className="mt-6 mb-2 block text-sm font-medium"
              >
                Keywords
              </label>

              <textarea
                id="trigger_keywords"
                name="trigger_keywords"
                rows={4}
                maxLength={1000}
                defaultValue={
                  currentKeywords.join(
                    ", "
                  )
                }
                placeholder="link, price, details"
                className="w-full resize-y rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm leading-6 outline-none placeholder:text-white/20 focus:border-blue-500"
              />

              <p className="mt-2 text-xs text-white/30">
                Separate keywords with commas or new lines.
              </p>
            </div>

            <div className="my-8 h-px bg-white/10" />

            {/* MESSAGE */}

            <div>
              <h2 className="text-lg font-semibold">
                3. DM Message
              </h2>

              <p className="mt-2 text-sm text-white/40">
                This message will be sent when the trigger matches.
              </p>

              <textarea
                name="dm_message"
                required
                rows={7}
                maxLength={2000}
                defaultValue={
                  automationData.dm_message
                }
                className="mt-5 w-full resize-y rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm leading-6 outline-none focus:border-blue-500"
              />

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">

                <label className="flex items-center justify-between">

                  <div>
                    <p className="font-medium">
                      Reply to Comment
                    </p>

                    <p className="mt-1 text-xs text-white/40">
                      Public reply on Instagram comment
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    name="reply_enabled"
                    defaultChecked={
                      automationData.reply_enabled ?? false
                    }
                    className="h-5 w-5 accent-blue-600"
                  />

                </label>


                <div className="mt-5">

                  <label className="mb-2 block text-sm font-medium">
                    Reply Message
                  </label>

                  <textarea
                    name="reply_text"
                    rows={4}
                    defaultValue={
                      automationData.reply_text ?? ""
                    }
                    placeholder="Thanks for commenting ❤️"
                    className="w-full rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />

                </div>

              </div>

              <div className="mt-6 space-y-4">

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
                    defaultValue={
                      automationData.button_name ?? ""
                    }
                    placeholder="Get Course"
                    className="w-full rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm outline-none focus:border-blue-500"
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
                    defaultValue={
                      automationData.button_url ?? ""
                    }
                    placeholder="https://example.com"
                    className="w-full rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>

              </div>
            </div>

            <div className="my-8 h-px bg-white/10" />

            {/* STATUS */}

            <div>
              <h2 className="text-lg font-semibold">
                4. Status
              </h2>

              <label className="mt-5 flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-5">
                <div>
                  <p className="text-sm font-medium">
                    Automation active
                  </p>

                  <p className="mt-1 text-xs text-white/30">
                    Turn this off to temporarily stop the automation.
                  </p>
                </div>

                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={
                    automationData.is_active
                  }
                  className="h-5 w-5 accent-blue-600"
                />
              </label>
            </div>

            {/* ACTIONS */}

            <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/dashboard/automations"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-medium text-white/60 hover:bg-white/[0.08] hover:text-white"
              >
                Cancel
              </Link>

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500"
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