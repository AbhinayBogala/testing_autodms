import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type InstagramPost = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  published_at: string | null;
};

type SearchParams = {
  error?: string;
};

export default async function NewAutomationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
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

  async function createAutomation(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/admin/login");
    }

    const instagramPostId = String(
      formData.get("instagram_post_id") ?? ""
    ).trim();

    const triggerType = String(
      formData.get("trigger_type") ?? "keywords"
    ).trim();

    const rawKeywords = String(
      formData.get("trigger_keywords") ?? ""
    );

    const dmMessage = String(
      formData.get("dm_message") ?? ""
    ).trim();

    const isActive =
      formData.get("is_active") === "on";

    const triggerKeywords = Array.from(
      new Set(
        rawKeywords
          .split(/[\n,]+/)
          .map((keyword) =>
            keyword.trim().toLowerCase()
          )
          .filter(Boolean)
      )
    );

    if (!instagramPostId) {
      redirect(
        "/admin/automations/new?error=Please+select+an+Instagram+post."
      );
    }

    if (
      triggerType !== "keywords" &&
      triggerType !== "any_comment"
    ) {
      redirect(
        "/admin/automations/new?error=Invalid+trigger+type."
      );
    }

    if (
      triggerType === "keywords" &&
      triggerKeywords.length === 0
    ) {
      redirect(
        "/admin/automations/new?error=Please+enter+at+least+one+keyword."
      );
    }

    if (!dmMessage) {
      redirect(
        "/admin/automations/new?error=Please+enter+a+DM+message."
      );
    }

    const {
      data: account,
      error: accountError,
    } = await supabase
      .from("instagram_accounts")
      .select(
        "id, instagram_user_id, username, profile_picture_url"
      )
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .order("connected_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (accountError) {
      redirect(
        `/admin/automations/new?error=${encodeURIComponent(
          accountError.message
        )}`
      );
    }

    if (!account) {
      redirect(
        "/admin/automations/new?error=No+connected+Instagram+account+was+found."
      );
    }

    const {
      data: post,
      error: postError,
    } = await supabase
      .from("instagram_posts")
      .select(
        "id, instagram_media_id, instagram_account_id"
      )
      .eq("id", instagramPostId)
      .eq("instagram_account_id", account.id)
      .maybeSingle();

    if (postError) {
      redirect(
        `/admin/automations/new?error=${encodeURIComponent(
          postError.message
        )}`
      );
    }

    if (!post) {
      redirect(
        "/admin/automations/new?error=Selected+Instagram+post+was+not+found."
      );
    }

    /*
     * Prevent duplicate automation for the same
     * account + post + trigger configuration.
     */

    const {
      data: existingAutomations,
      error: duplicateError,
    } = await supabase
      .from("instagram_automations")
      .select(
        "id, trigger_type, trigger_keywords, trigger_keyword"
      )
      .eq("instagram_account_id", account.id)
      .eq(
        "instagram_post_id",
        post.instagram_media_id
      );

    if (duplicateError) {
      redirect(
        `/admin/automations/new?error=${encodeURIComponent(
          duplicateError.message
        )}`
      );
    }

    const normalizedExisting =
      existingAutomations ?? [];

    const newKeywords =
      triggerKeywords.map((keyword) =>
        keyword.toLowerCase()
      );

    const duplicate =
      normalizedExisting.some(
        (automation) => {
          const existingType =
            automation.trigger_type ||
            "keywords";

          if (
            existingType !==
            triggerType
          ) {
            return false;
          }

          if (
            triggerType ===
            "any_comment"
          ) {
            return true;
          }

          const existingKeywords =
            Array.isArray(
              automation.trigger_keywords
            )
              ? automation.trigger_keywords
              : automation.trigger_keyword
                ? [
                    automation.trigger_keyword,
                  ]
                : [];

          const a = [
            ...existingKeywords,
          ]
            .map((x) =>
              String(x)
                .trim()
                .toLowerCase()
            )
            .sort();

          const b = [
            ...newKeywords,
          ].sort();

          return (
            a.length === b.length &&
            a.every(
              (value, index) =>
                value === b[index]
            )
          );
        }
      );

    if (duplicate) {
      redirect(
        "/admin/automations/new?error=An+automation+with+the+same+trigger+already+exists+for+this+post."
      );
    }

    /*
     * Keep trigger_keyword populated for backward
     * compatibility with the current webhook.
     */

    const legacyKeyword =
      triggerType === "keywords"
        ? triggerKeywords[0] ?? ""
        : "";

    const { error: insertError } =
      await supabase
        .from("instagram_automations")
        .insert({
          user_id: user.id,
          instagram_account_id:
            account.id,
          instagram_post_id:
            post.instagram_media_id,
          trigger_type:
            triggerType,
          trigger_keywords:
            triggerKeywords,
          trigger_keyword:
            legacyKeyword,
          dm_message: dmMessage,
          is_active: isActive,
        });

    if (insertError) {
      redirect(
        `/admin/automations/new?error=${encodeURIComponent(
          insertError.message
        )}`
      );
    }

    redirect("/admin/automations");
  }

  const {
    data: account,
    error: accountError,
  } = await supabase
    .from("instagram_accounts")
    .select(
      "id, instagram_user_id, username, profile_picture_url"
    )
    .eq("user_id", user.id)
    .eq("is_connected", true)
    .order("connected_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

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
      .limit(50);

    if (error) {
      postsError = error.message;
    } else {
      posts =
        (data ?? []) as InstagramPost[];
    }
  }

  const pageError = params.error
    ? decodeURIComponent(params.error)
    : null;

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Link
            href="/admin/automations"
            className="text-sm text-white/40 transition hover:text-white"
          >
            ← Back to Automations
          </Link>

          <h1 className="mt-3 text-2xl font-bold">
            New Automation
          </h1>

          <p className="mt-1 text-sm text-white/40">
            Create an Instagram comment-to-DM automation.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {(pageError ||
          accountError ||
          postsError) && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
            <h2 className="font-semibold text-red-300">
              Unable to load automation form
            </h2>

            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-200/70">
              {pageError ||
                accountError?.message ||
                postsError}
            </p>
          </div>
        )}

        {!account ? (
          <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-8">
            <div className="text-4xl">
              🔗
            </div>

            <h2 className="mt-4 text-xl font-semibold text-yellow-200">
              Instagram is not connected
            </h2>

            <p className="mt-2 text-sm leading-6 text-yellow-100/60">
              No active Instagram account was found.
            </p>

            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-xl border border-white/10 bg-white/[0.05] px-6 py-3 text-sm font-semibold transition hover:bg-white/[0.1]"
            >
              Back to Dashboard
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-2xl border border-green-500/20 bg-green-500/10 p-5">
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
                    Connected Instagram
                  </p>

                  <p className="mt-1 font-semibold text-green-100">
                    @{account.username ||
                      "Instagram account"}
                  </p>
                </div>
              </div>
            </div>

            <form
              action={createAutomation}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-8"
            >
              <div>
                <h2 className="text-lg font-semibold">
                  1. Select Instagram Post
                </h2>

                <p className="mt-2 text-sm text-white/40">
                  Choose the post where comments should trigger the automation.
                </p>

                {posts.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-5">
                    <p className="font-medium text-yellow-200">
                      No Instagram posts found.
                    </p>

                    <p className="mt-2 text-sm text-yellow-100/50">
                      Sync your Instagram posts from the dashboard first.
                    </p>

                    <Link
                      href="/dashboard"
                      className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500"
                    >
                      Go to Dashboard
                    </Link>
                  </div>
                ) : (
                  <div className="mt-5">
                    <label
                      htmlFor="instagram_post_id"
                      className="mb-2 block text-sm font-medium"
                    >
                      Post
                    </label>

                    <select
                      id="instagram_post_id"
                      name="instagram_post_id"
                      required
                      defaultValue=""
                      className="w-full rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                    >
                      <option
                        value=""
                        disabled
                      >
                        Select a post
                      </option>

                      {posts.map(
                        (post) => {
                          const caption =
                            post.caption
                              ?.replace(
                                /\s+/g,
                                " "
                              )
                              .trim();

                          const title =
                            caption
                              ? caption.length >
                                80
                                ? `${caption.slice(
                                    0,
                                    80
                                  )}...`
                                : caption
                              : `Instagram ${
                                  post.media_type ||
                                  "Post"
                                }`;

                          return (
                            <option
                              key={post.id}
                              value={post.id}
                            >
                              {title}
                            </option>
                          );
                        }
                      )}
                    </select>
                  </div>
                )}
              </div>

              <div className="my-8 h-px bg-white/10" />

              <div>
                <h2 className="text-lg font-semibold">
                  2. Trigger
                </h2>

                <p className="mt-2 text-sm text-white/40">
                  Choose what should cause the DM to be sent.
                </p>

                <div className="mt-5 space-y-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-white/[0.04]">
                    <input
                      type="radio"
                      name="trigger_type"
                      value="keywords"
                      defaultChecked
                      className="mt-1 h-4 w-4 accent-blue-600"
                    />

                    <div>
                      <p className="font-medium">
                        Specific keywords
                      </p>

                      <p className="mt-1 text-xs text-white/40">
                        Send the DM when a comment contains any of your keywords.
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-white/[0.04]">
                    <input
                      type="radio"
                      name="trigger_type"
                      value="any_comment"
                      className="mt-1 h-4 w-4 accent-purple-600"
                    />

                    <div>
                      <p className="font-medium">
                        Any comment
                      </p>

                      <p className="mt-1 text-xs text-white/40">
                        Send the DM for every comment on this post.
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
                  placeholder={
                    "link, price, details"
                  }
                  className="w-full resize-y rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm leading-6 outline-none placeholder:text-white/20 focus:border-blue-500"
                />

                <p className="mt-2 text-xs text-white/30">
                  Separate keywords with commas or put each keyword on a new line.
                </p>
              </div>

              <div className="my-8 h-px bg-white/10" />

              <div>
                <h2 className="text-lg font-semibold">
                  3. DM Message
                </h2>

                <p className="mt-2 text-sm text-white/40">
                  This message will be sent when the trigger matches.
                </p>

                <label
                  htmlFor="dm_message"
                  className="mt-5 mb-2 block text-sm font-medium"
                >
                  Message
                </label>

                <textarea
                  id="dm_message"
                  name="dm_message"
                  required
                  rows={7}
                  maxLength={2000}
                  placeholder={`Hey! 👋

Thanks for commenting!

Here's the link:
https://example.com`}
                  className="w-full resize-y rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm leading-6 outline-none placeholder:text-white/20 focus:border-blue-500"
                />
              </div>

              <div className="my-8 h-px bg-white/10" />

              <div>
                <h2 className="text-lg font-semibold">
                  4. Status
                </h2>

                <label className="mt-5 flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div>
                    <p className="text-sm font-medium">
                      Activate automation
                    </p>

                    <p className="mt-1 text-xs text-white/30">
                      Start processing matching comments immediately.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked
                    className="h-5 w-5 accent-blue-600"
                  />
                </label>
              </div>

              <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Link
                  href="/admin/automations"
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-medium text-white/60 hover:bg-white/[0.08] hover:text-white"
                >
                  Cancel
                </Link>

                <button
                  type="submit"
                  disabled={posts.length === 0}
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Create Automation
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}