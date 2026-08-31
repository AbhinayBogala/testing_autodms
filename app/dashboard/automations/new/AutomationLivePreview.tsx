"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type InstagramPost = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  published_at: string | null;
};

type PreviewTab =
  | "post"
  | "comments"
  | "dm";

type AutomationLivePreviewProps = {
  username: string | null;
  profilePictureUrl: string | null;
  posts: InstagramPost[];
};

function getFormValue(
  form: HTMLFormElement,
  name: string,
): string {
  const field = Array.from(
    form.elements,
  ).find(
    (element) =>
      element.getAttribute("name") ===
      name,
  );

  if (
    field instanceof
      HTMLInputElement ||
    field instanceof
      HTMLTextAreaElement ||
    field instanceof
      HTMLSelectElement
  ) {
    return field.value;
  }

  return "";
}

function getFormValues(
  form: HTMLFormElement,
  name: string,
): string[] {
  return Array.from(
    form.elements,
  )
    .filter(
      (element) =>
        element.getAttribute(
          "name",
        ) === name,
    )
    .map((element) => {
      if (
        element instanceof
          HTMLInputElement ||
        element instanceof
          HTMLTextAreaElement ||
        element instanceof
          HTMLSelectElement
      ) {
        return element.value.trim();
      }

      return "";
    })
    .filter(Boolean);
}

function getCheckboxValue(
  form: HTMLFormElement,
  name: string,
): boolean {
  const field = Array.from(
    form.elements,
  ).find(
    (element) =>
      element.getAttribute("name") ===
      name,
  );

  return (
    field instanceof
      HTMLInputElement &&
    field.type === "checkbox" &&
    field.checked
  );
}

function formatDate(
  value: string | null,
) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
}

function Avatar({
  profilePictureUrl,
}: {
  profilePictureUrl: string | null;
}) {
  if (profilePictureUrl) {
    return (
      <img
        src={profilePictureUrl}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] text-white/50">
      IG
    </div>
  );
}

function MediaPreview({
  post,
}: {
  post: InstagramPost;
}) {
  if (!post.media_url) {
    return (
      <div className="flex aspect-square items-center justify-center bg-[#17181c] text-xs text-white/30">
        No media preview available
      </div>
    );
  }

  const isVideo =
    post.media_type === "VIDEO" ||
    post.media_type === "REEL";

  if (isVideo) {
    return (
      <video
        src={post.media_url}
        className="aspect-square w-full object-cover"
        muted
        playsInline
        controls
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={post.media_url}
      alt="Selected Instagram post"
      className="aspect-square w-full object-cover"
    />
  );
}

export default function AutomationLivePreview({
  username,
  profilePictureUrl,
  posts,
}: AutomationLivePreviewProps) {
  const [tab, setTab] =
    useState<PreviewTab>("post");

  const [message, setMessage] =
    useState("");

  const [followupMessage, setFollowupMessage] =
    useState("");

  const [followupEnabled, setFollowupEnabled] =
    useState(false);

  const [triggerType, setTriggerType] =
    useState("keywords");

  const [triggerKeywords, setTriggerKeywords] =
    useState("");

  const [selectedPostId, setSelectedPostId] =
    useState("");

  const [replyEnabled, setReplyEnabled] =
    useState(false);

  const [replyTexts, setReplyTexts] =
    useState<string[]>([]);

  const [buttonName, setButtonName] =
    useState("");

  const [buttonUrl, setButtonUrl] =
    useState("");

  const [secondMessageEnabled, setSecondMessageEnabled] =
    useState(false);

  const [secondMessage, setSecondMessage] =
    useState("");

  const [secondButtonName, setSecondButtonName] =
    useState("");

  /*
   * ==========================================================
   * FORM SYNCHRONIZATION
   * ==========================================================
   */

  useEffect(() => {
    const findForm = () =>
      document.getElementById(
        "new-automation-form",
      );

    const syncForm = () => {
      const form = findForm();

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      setMessage(
        getFormValue(
          form,
          "dm_message",
        ),
      );

      setFollowupMessage(
        getFormValue(
          form,
          "followup_message",
        ) ||
          getFormValue(
            form,
            "second_message",
          ),
      );

      setFollowupEnabled(
        getCheckboxValue(
          form,
          "followup_enabled",
        ) ||
          getCheckboxValue(
            form,
            "second_message_enabled",
          ),
      );

      setTriggerType(
        getFormValue(
          form,
          "trigger_type",
        ) || "keywords",
      );

      setTriggerKeywords(
        getFormValue(
          form,
          "trigger_keywords",
        ),
      );

      setReplyEnabled(
        getCheckboxValue(
          form,
          "reply_enabled",
        ),
      );

      setReplyTexts(
        getFormValues(
          form,
          "reply_texts",
        ),
      );

      setButtonName(
        getFormValue(
          form,
          "button_name",
        ),
      );

      setButtonUrl(
        getFormValue(
          form,
          "button_url",
        ),
      );

      setSecondMessageEnabled(
        getCheckboxValue(
          form,
          "second_message_enabled",
        ),
      );

      setSecondMessage(
        getFormValue(
          form,
          "second_message",
        ),
      );

      setSecondButtonName(
        getFormValue(
          form,
          "second_button_name",
        ),
      );

      const postField =
        Array.from(
          form.elements,
        ).find(
          (element) =>
            element.getAttribute(
              "name",
            ) ===
            "instagram_post_id",
        );

      if (
        postField instanceof
          HTMLInputElement ||
        postField instanceof
          HTMLSelectElement
      ) {
        setSelectedPostId(
          postField.value,
        );
      }
    };

    /*
     * Initial sync.
     */

    syncForm();

    /*
     * Form may be mounted immediately after
     * the preview effect, so also retry once.
     */

    const retryTimer =
      window.setTimeout(
        syncForm,
        50,
      );

    const retryTimer2 =
      window.setTimeout(
        syncForm,
        250,
      );

    /*
     * Listen globally so custom components
     * can notify the preview.
     */

    const handleInput = () =>
      syncForm();

    const handleChange = () =>
      syncForm();

    const handlePostSelected = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<{
          postId?: string;
        }>;

      if (
        customEvent.detail?.postId
      ) {
        setSelectedPostId(
          customEvent.detail.postId,
        );
      }

      syncForm();
    };

    document.addEventListener(
      "input",
      handleInput,
    );

    document.addEventListener(
      "change",
      handleChange,
    );

    window.addEventListener(
      "devilx:post-selected",
      handlePostSelected,
    );

    return () => {
      window.clearTimeout(
        retryTimer,
      );

      window.clearTimeout(
        retryTimer2,
      );

      document.removeEventListener(
        "input",
        handleInput,
      );

      document.removeEventListener(
        "change",
        handleChange,
      );

      window.removeEventListener(
        "devilx:post-selected",
        handlePostSelected,
      );
    };
  }, []);

  /*
   * ==========================================================
   * SELECTED POST
   * ==========================================================
   */

  const selectedPost =
    useMemo(
      () =>
        posts.find(
          (post) =>
            post.id ===
            selectedPostId,
        ) ?? null,
      [
        posts,
        selectedPostId,
      ],
    );

  /*
   * ==========================================================
   * TRIGGER
   * ==========================================================
   */

  const firstKeyword =
    triggerKeywords
      .split(/[\n,]+/)
      .map((value) =>
        value.trim(),
      )
      .filter(Boolean)[0];

  const triggerComment =
    triggerType ===
      "any_comment" ||
    triggerType === "any" ||
    !firstKeyword
      ? "any word"
      : firstKeyword;

  /*
   * ==========================================================
   * DISPLAY VALUES
   * ==========================================================
   */

  const displayMessage =
    message.trim() ||
    "Your DM message will appear here…";

  const displayFollowup =
    followupMessage.trim();

  const visibleReplies =
    replyTexts.length > 0
      ? replyTexts
      : [
          "Your public reply will appear here…",
        ];

  const displayButtonName =
    buttonName.trim() ||
    "Your Button";

  const hasButton =
    buttonName.trim().length > 0 &&
    buttonUrl.trim().length > 0;

  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0a0a] shadow-2xl shadow-black/30">

        {/* HEADER */}

        <div className="border-b border-white/[0.07] p-5">

          <div className="flex items-start justify-between gap-3">

            <div>

              <div className="flex items-center gap-2">

                <span className="h-2 w-2 rounded-full bg-green-400" />

                <p className="text-sm font-semibold text-white">
                  Live Preview
                </p>

              </div>

              <p className="mt-1 text-xs leading-5 text-white/40">
                Updates automatically as you edit.
              </p>

            </div>

            <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-[10px] font-medium text-green-300">
              LIVE
            </span>

          </div>

          {/* TABS */}

          <div className="mt-4 grid grid-cols-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">

            {(
              [
                [
                  "post",
                  "Post",
                ],
                [
                  "comments",
                  "Comments",
                ],
                [
                  "dm",
                  "DM",
                ],
              ] as const
            ).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setTab(value)
                  }
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                    tab === value
                      ? "bg-white text-black"
                      : "text-white/45 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ),
            )}

          </div>

        </div>

        {/* PHONE */}

        <div className="p-4 sm:p-5">

          <div className="mx-auto max-w-[390px] overflow-hidden rounded-[2rem] border-[6px] border-[#1b1b1b] bg-[#0d0e11] shadow-xl">

            {/* POST */}

            {tab === "post" && (
              <div className="bg-[#0d0e11]">

                <div className="border-b border-white/[0.07] bg-[#111216] px-4 py-3 text-center">

                  <p className="text-[11px] font-semibold text-white/80">
                    {username
                      ? username.toUpperCase()
                      : "INSTAGRAM"}
                  </p>

                  <p className="mt-0.5 text-[9px] text-white/35">
                    Posts
                  </p>

                </div>

                {selectedPost ? (
                  <>
                    <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#111216] px-3 py-2">

                      {profilePictureUrl ? (
                        <img
                          src={
                            profilePictureUrl
                          }
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-white/10" />
                      )}

                      <div className="min-w-0 flex-1">

                        <p className="truncate text-[10px] font-semibold text-white">
                          {username ||
                            "your_instagram"}
                        </p>

                      </div>

                      <span className="text-white/45">
                        •••
                      </span>

                    </div>

                    <MediaPreview
                      post={
                        selectedPost
                      }
                    />

                    <div className="space-y-2 bg-[#111216] px-3 py-3">

                      <div className="flex items-center justify-between text-white/80">

                        <div className="flex items-center gap-3 text-lg">
                          <span>♡</span>
                          <span>◯</span>
                          <span>➤</span>
                        </div>

                        <span>♧</span>

                      </div>

                      <p className="text-[10px] font-semibold text-white">
                        2,040 likes
                      </p>

                      {selectedPost.caption && (
                        <p className="line-clamp-5 whitespace-pre-wrap text-[10px] leading-4 text-white/80">

                          <span className="font-semibold text-white">
                            {username ||
                              "your_instagram"}{" "}
                          </span>

                          {
                            selectedPost.caption
                          }

                        </p>
                      )}

                      <p className="text-[9px] text-white/30">
                        {formatDate(
                          selectedPost.published_at,
                        )}
                      </p>

                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[520px] items-center justify-center px-8 text-center">

                    <div>

                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-xl">
                        ▣
                      </div>

                      <p className="text-sm font-medium text-white/75">
                        Select an Instagram post
                      </p>

                      <p className="mt-1 text-xs leading-5 text-white/35">
                        The selected post will appear here.
                      </p>

                    </div>

                  </div>
                )}

              </div>
            )}

            {/* COMMENTS */}

            {tab ===
              "comments" && (
              <div className="bg-[#0d0e11]">

                <div className="border-b border-white/[0.07] bg-[#111216] px-4 py-3 text-center">

                  <p className="text-[11px] font-semibold text-white/80">
                    Comments
                  </p>

                </div>

                {selectedPost ? (
                  <>
                    <MediaPreview
                      post={
                        selectedPost
                      }
                    />

                    <div className="space-y-4 bg-[#111216] p-4">

                      <div className="flex gap-2">

                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] text-white/60">
                          U
                        </div>

                        <div className="min-w-0 flex-1">

                          <p className="text-[10px] font-semibold text-white">
                            user_name
                          </p>

                          <div className="mt-1 rounded-2xl bg-white/[0.06] px-3 py-2.5">

                            <p className="text-[12px] leading-5 text-white">
                              {
                                triggerComment
                              }
                            </p>

                          </div>

                          <div className="mt-1 flex gap-3 text-[9px] text-white/30">
                            <span>now</span>
                            <span>Reply</span>
                            <span>♥</span>
                          </div>

                        </div>

                      </div>

                      {replyEnabled && (
                        <div className="ml-9 space-y-3">

                          {visibleReplies.map(
                            (
                              reply,
                              index,
                            ) => (
                              <div
                                key={
                                  `preview-reply-${index}`
                                }
                                className="flex gap-2"
                              >

                                <Avatar
                                  profilePictureUrl={
                                    profilePictureUrl
                                  }
                                />

                                <div className="min-w-0 flex-1">

                                  <p className="text-[10px] font-semibold text-white">
                                    {username ||
                                      "your_instagram"}
                                  </p>

                                  <div className="mt-1 rounded-2xl bg-[#26272b] px-3 py-2.5">

                                    <p className="whitespace-pre-wrap break-words text-[12px] leading-5 text-white">
                                      {
                                        reply
                                      }
                                    </p>

                                  </div>

                                  <div className="mt-1 text-[9px] text-white/30">
                                    now
                                  </div>

                                </div>

                              </div>
                            ),
                          )}

                        </div>
                      )}

                      {!replyEnabled && (
                        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-black/10 p-3">

                          <p className="text-[10px] text-white/30">
                            Comment reply is disabled.
                          </p>

                        </div>
                      )}

                      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">

                        <p className="text-[9px] uppercase tracking-wider text-white/30">
                          Trigger
                        </p>

                        <p className="mt-1 text-[11px] text-white/70">
                          {triggerType ===
                            "any_comment"
                            ? "Any word / any comment"
                            : `Keyword: ${
                                firstKeyword ||
                                "your keyword"
                              }`}
                        </p>

                      </div>

                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[520px] items-center justify-center px-8 text-center">

                    <p className="text-xs leading-5 text-white/35">
                      Select a post first to preview its comments.
                    </p>

                  </div>
                )}

              </div>
            )}

            {/* DM */}

            {tab === "dm" && (
              <div className="bg-[#0e0f12]">

                <div className="border-b border-white/[0.07] bg-[#111216] px-4 py-3">

                  <div className="flex items-center gap-3">

                    <span className="text-xl leading-none text-white/80">
                      ‹
                    </span>

                    {profilePictureUrl ? (
                      <img
                        src={
                          profilePictureUrl
                        }
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white/70">
                        IG
                      </div>
                    )}

                    <div className="min-w-0 flex-1">

                      <p className="truncate text-xs font-semibold text-white">
                        {username ||
                          "your_instagram"}
                      </p>

                      <p className="text-[9px] text-white/30">
                        Active now
                      </p>

                    </div>

                  </div>

                </div>

                <div className="min-h-[430px] space-y-4 px-4 py-6">

                  <p className="mb-7 text-center text-[10px] text-white/30">
                    Today
                  </p>

                  <div className="flex items-end gap-2">

                    <Avatar
                      profilePictureUrl={
                        profilePictureUrl
                      }
                    />

                    <div className="max-w-[82%] rounded-[20px] rounded-bl-[6px] bg-[#26272b] px-4 py-3 text-[13px] leading-[1.55] text-white/95">

                      <span className="whitespace-pre-wrap break-words">
                        {
                          displayMessage
                        }
                      </span>

                      {hasButton && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1b1c20]">

                          <button
                            type="button"
                            className="w-full border-t border-white/[0.08] px-4 py-2.5 text-center text-[12px] font-semibold text-[#4ade80]"
                          >
                            {
                              displayButtonName
                            }
                          </button>

                        </div>
                      )}

                    </div>

                  </div>

                  {followupEnabled &&
                    displayFollowup && (
                      <div className="flex items-end gap-2">

                        <Avatar
                          profilePictureUrl={
                            profilePictureUrl
                          }
                        />

                        <div className="max-w-[82%] rounded-[20px] rounded-bl-[6px] bg-[#26272b] px-4 py-3 text-[13px] leading-[1.55] text-white/95">

                          <span className="whitespace-pre-wrap break-words">
                            {
                              displayFollowup
                            }
                          </span>

                          {secondMessageEnabled &&
                            secondButtonName && (
                              <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1b1c20]">

                                <button
                                  type="button"
                                  className="w-full border-t border-white/[0.08] px-4 py-2.5 text-center text-[12px] font-semibold text-[#4ade80]"
                                >
                                  {
                                    secondButtonName
                                  }
                                </button>

                              </div>
                            )}

                        </div>

                      </div>
                    )}

                </div>

                <div className="border-t border-white/[0.07] bg-[#111216] p-3">

                  <div className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-[#191a1e] px-3 py-2.5">

                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs text-black">
                      ◎
                    </span>

                    <span className="flex-1 text-[11px] text-white/30">
                      Message...
                    </span>

                    <span className="text-sm text-white/40">
                      🎙
                    </span>

                    <span className="text-sm text-white/40">
                      ▣
                    </span>

                  </div>

                </div>

              </div>
            )}

          </div>

          <p className="mx-auto mt-4 max-w-[390px] text-center text-[11px] leading-5 text-white/35">

            {tab === "post"
              ? "Shows the real Instagram post you selected."
              : tab === "comments"
                ? replyEnabled
                  ? "Shows the trigger comment and your public comment replies."
                  : "Shows the comment that triggers this automation."
                : hasButton
                  ? "Shows the DM and the button the user will receive."
                  : "Shows the DM inbox conversation the user receives."}

          </p>

        </div>

      </div>
    </aside>
  );
}