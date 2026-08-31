import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import PostSelector from "../../new/PostSelector";
import ReplyFieldsEditor from "./ReplyFieldsEditor";
import AutomationLivePreview from "../../new/AutomationLivePreview";
import AutomationStatusToggle from "../../new/AutomationStatusToggle";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
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
  name: string | null;

  user_id: string;
  instagram_account_id: string;
  instagram_post_id: string;

  trigger_type: string | null;
  trigger_keywords: string[] | null;
  trigger_keyword: string | null;

  dm_message: string;

  reply_enabled: boolean | null;
  reply_text: string | null;
  reply_texts: string[] | null;

  button_name: string | null;
  button_url: string | null;

  followup_enabled: boolean | null;
  followup_delay_minutes: number | null;
  followup_message: string | null;

  is_active: boolean;
};

export default async function EditAutomationPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();

  /*
   * =========================================================
   * AUTH
   * =========================================================
   */

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {

  return (
    <main className="min-h-screen bg-[#050505] text-white">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="border-b border-white/[0.07]">

        <div className="mx-auto max-w-7xl px-6 py-6">

          <Link
            href="/dashboard/automations"
            className="text-sm text-gray-500 transition hover:text-white"
          >
            ← Back to Automations
          </Link>

          <h1 className="mt-3 text-2xl font-bold">
            Edit Automation
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Update your Instagram
            comment-to-DM automation.
          </p>

        </div>

      </header>

      {/* ======================================================
          CONTENT
      ====================================================== */}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">

        {/* ====================================================
            ERROR
        ==================================================== */}

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

        {/* ====================================================
            NO ACCOUNT
        ==================================================== */}

        {!account ? (
          <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-5 sm:p-8">

            <div className="text-4xl">
              🔗
            </div>

            <h2 className="mt-4 text-xl font-semibold text-yellow-200">
              Instagram is not connected
            </h2>

            <p className="mt-2 text-sm leading-6 text-yellow-100/60">
              The Instagram account connected to this automation is no longer active.
            </p>

            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-xl border border-white/[0.07] bg-white/[0.05] px-6 py-3 text-sm font-semibold transition hover:bg-white/[0.1]"
            >
              Back to Dashboard
            </Link>

          </div>
        ) : (

          <>
            {/* ==================================================
                TWO COLUMN LAYOUT
            ================================================== */}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px] xl:gap-8">

              {/* =================================================
                  LEFT
              ================================================= */}

              <div>

                {/* ==================================================
                    CONNECTED ACCOUNT
                ================================================== */}

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
                        @
                        {account.username ||
                          "Instagram account"}
                      </p>

                    </div>

                  </div>

                </div>

                {/* ==================================================
                    FORM
                ================================================== */}

                <form
                  id="new-automation-form"
                  action={
                    updateAutomation
                  }
                  className="rounded-3xl border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-8"
                >

                  {/* =================================================
                      AUTOMATION NAME
                  ================================================= */}

                  <div>

                    <h2 className="text-lg font-semibold">
                      1. Automation Name
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                      Give this automation
                      a name so you can
                      easily identify it
                      later from the
                      Scheduler.
                    </p>

                    <label
                      htmlFor="name"
                      className="mt-5 mb-2 block text-sm font-medium"
                    >
                      Name
                    </label>

                    <input
                      id="name"
                      name="name"
                      required
                      maxLength={100}
                      defaultValue={automationData.name ?? ""}
                      placeholder="Course Launch Comments"
                      className="w-full rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
                    />

                    <p className="mt-2 text-xs text-gray-600">
                      Example: Course
                      Launch, Webinar
                      Leads, Product
                      Enquiry
                    </p>

                  </div>

                  <div className="my-8 h-px bg-white/10" />

                  {/* =================================================
                      POST
                  ================================================= */}

                  <div>

                    <h2 className="text-lg font-semibold">
                      2. Select Instagram Post
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                      Choose the post
                      where comments
                      should trigger the
                      automation.
                    </p>

                    {posts.length ===
                    0 ? (
                      <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-5">

                        <p className="font-medium text-yellow-200">
                          No Instagram
                          posts found.
                        </p>

                        <p className="mt-2 text-sm text-yellow-100/50">
                          The Instagram posts for this account could not be loaded.
                        </p>

                        <Link
                          href="/dashboard"
                          className="mt-4 inline-flex rounded-xl bg-[#ff1744] px-5 py-3 text-sm font-semibold hover:bg-[#e9143d]"
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

                    )}

                  </div>

                  <div className="my-8 h-px bg-white/10" />

                  {/* =================================================
                      TRIGGER
                  ================================================= */}

                  <div className="trigger-section">

                    <h2 className="text-lg font-semibold">
                      3. Trigger
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                      Choose what should
                      cause the DM to be
                      sent.
                    </p>

                    <div className="mt-5 space-y-3">

                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition hover:bg-white/[0.04]">

                        <input
                          type="radio"
                          name="trigger_type"
                          value="keywords"
                          defaultChecked={
                            currentTriggerType === "keywords"
                          }
                          className="mt-1 h-4 w-4 accent-[#ff1744]"
                        />

                        <div>

                          <p className="font-medium">
                            Specific keywords
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            Send the DM when a
                            comment contains
                            any of your
                            keywords.
                          </p>

                        </div>

                      </label>

                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition hover:bg-white/[0.04]">

                        <input
                          type="radio"
                          name="trigger_type"
                          value="any_comment"
                          defaultChecked={
                            currentTriggerType === "any_comment"
                          }
                          className="mt-1 h-4 w-4 accent-[#ff1744]"
                        />

                        <div>

                          <p className="font-medium">
                            Any comment
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            Send the DM for
                            every comment on
                            this post.
                          </p>

                        </div>

                      </label>

                    </div>

                    <div className="keywords-field mt-6">

                      <label
                        htmlFor="trigger_keywords"
                        className="mb-2 block text-sm font-medium"
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
                        className="w-full resize-y rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-4 py-3 text-sm leading-6 outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
                      />

                      <p className="mt-2 text-xs text-gray-600">
                        Separate keywords
                        with commas or put
                        each keyword on a
                        new line.
                      </p>

                    </div>

                  </div>

                  <div className="my-8 h-px bg-white/10" />

                  {/* =================================================
                      DM
                  ================================================= */}

                  <div>

                    <h2 className="text-lg font-semibold">
                      4. DM Message
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                      This message will
                      be sent when the
                      trigger matches.
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
                      defaultValue={automationData.dm_message}
                      placeholder={`Hey! 👋

Thanks for commenting!

Here's the link:
https://example.com`}
                      className="w-full resize-y rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-4 py-3 text-sm leading-6 outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
                    />

                    {/* =================================================
                        BUTTON
                    ================================================= */}

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
                          maxLength={20}
                          defaultValue={automationData.button_name ?? ""}
                          placeholder="Get Course"
                          className="w-full rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
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
                          type="url"
                          defaultValue={automationData.button_url ?? ""}
                          placeholder="https://example.com"
                          className="w-full rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
                        />

                      </div>

                    </div>

                    {/* =================================================
                        PUBLIC REPLY
                    ================================================= */}

                    <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">

                      <label className="flex items-center justify-between">

                        <div>

                          <p className="font-medium">
                            Reply to Comment
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            Public reply on
                            Instagram comment
                          </p>

                        </div>

                        <input
                          type="checkbox"
                          name="reply_enabled"
                          value="true"
                          defaultChecked={
                            automationData.reply_enabled ?? false
                          }
                          className="h-5 w-5 accent-[#ff1744]"
                        />

                      </label>

                      <ReplyFieldsEditor
                        initialReplies={currentReplyTexts}
                      />

                    </div>

                  </div>

                  {/* =================================================
                      LINK FOLLOW-UP
                  ================================================= */}

                  <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">

                    <label className="flex items-start justify-between gap-4">

                      <div>

                        <p className="font-medium">
                          Follow up if the
                          link isn&apos;t opened
                        </p>

                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          We track clicks on
                          your Custom DM
                          Button. If it
                          isn&apos;t clicked,
                          send one reminder.
                        </p>

                      </div>

                      <input
                        type="checkbox"
                        name="followup_enabled"
                        defaultChecked={Boolean(automationData.followup_enabled)}
                        className="mt-1 h-5 w-5 shrink-0 accent-[#ff1744]"
                      />

                    </label>

                    <div className="mt-5 space-y-4">

                      {/* DELAY */}

                      <div>

                        <label
                          htmlFor="followup_delay_minutes"
                          className="mb-2 block text-sm font-medium"
                        >
                          Send reminder after
                        </label>

                        <select
                          id="followup_delay_minutes"
                          name="followup_delay_minutes"
                          defaultValue={String(
                            automationData.followup_delay_minutes ?? 360
                          )}
                          className="w-full rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-4 py-3 text-sm text-white outline-none focus:border-[#ff1744]"
                        >

                          <option value="60">
                            1 hour
                          </option>

                          <option value="180">
                            3 hours
                          </option>

                          <option value="360">
                            6 hours
                          </option>

                          <option value="720">
                            12 hours
                          </option>

                          <option value="1380">
                            23 hours
                          </option>

                        </select>

                      </div>

                      {/* MESSAGE */}

                      <div>

                        <label
                          htmlFor="followup_message"
                          className="mb-2 block text-sm font-medium"
                        >
                          Follow-up message
                        </label>

                        <textarea
                          id="followup_message"
                          name="followup_message"
                          rows={4}
                          defaultValue={automationData.followup_message ?? ""}
                          maxLength={2000}
                          placeholder="If you're still curious, don't forget to tap the link ⬆️ I think you’ll love it ❤️"
                          className="w-full resize-y rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-4 py-3 text-sm leading-6 outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
                        />

                      </div>

                    </div>

                    <p className="mt-3 text-[11px] leading-5 text-gray-600">
                      Link tracking works with
                      the Custom DM Button
                      URL. Keep the reminder
                      within Instagram&apos;s
                      messaging window.
                    </p>

                  </div>

                  <div className="my-8 h-px bg-white/10" />

                  {/* =================================================
                      STATUS
                  ================================================= */}

                  <div>

                    <h2 className="text-lg font-semibold">
                      5. Status
                    </h2>

                    <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">

                      <div>

                        <p className="text-sm font-medium">
                          Automation status
                        </p>

                        <p className="mt-1 text-xs leading-5 text-gray-600">
                          ON = automation runs.
                          OFF = automation is
                          paused.
                        </p>

                      </div>

                      <AutomationStatusToggle
                        defaultChecked={automationData.is_active}
                      />

                    </div>

                  </div>

                  {/* =================================================
                      BUTTONS
                  ================================================= */}

                  <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

                    <Link
                      href="/dashboard/automations"
                      className="inline-flex items-center justify-center rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-6 py-3 text-sm font-medium text-white/60 hover:bg-white/[0.08] hover:text-white"
                    >
                      Cancel
                    </Link>

                    <button
                      type="submit"
                      className="rounded-xl bg-[#ff1744] px-6 py-3 text-sm font-semibold hover:bg-[#e9143d] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Save Changes
                    </button>

                  </div>

                </form>

              </div>

              {/* ==================================================
                  RIGHT — LIVE PREVIEW
              ================================================== */}

              <AutomationLivePreview
                username={
                  account.username
                }
                profilePictureUrl={
                  account.profile_picture_url
                }
                posts={posts}
              />

            </div>

          </>

        )}

      </div>

    </main>
  );
}