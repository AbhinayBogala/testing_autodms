"use client";

import { useEffect, useMemo, useState } from "react";

type InstagramPost = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  published_at: string | null;
};

type PreviewTab = "post" | "comments" | "dm";

type FlowButton = {
  id: string;
  label: string;
  action: "link" | "flow";
  url?: string;
  targetMessageId?: string;
};

type FlowMessage = {
  id: string;
  message: string;
  buttons: FlowButton[];
};

type AutomationLivePreviewProps = {
  username: string | null;
  profilePictureUrl: string | null;
  posts: InstagramPost[];
};

function getFormValue(form: HTMLFormElement, name: string): string {
  const field = Array.from(form.elements).find(
    (element) => element.getAttribute("name") === name
  );

  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) {
    return field.value;
  }

  return "";
}

function getFormValues(form: HTMLFormElement, name: string): string[] {
  return Array.from(form.elements)
    .filter((element) => element.getAttribute("name") === name)
    .map((element) => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        return element.value.trim();
      }

      return "";
    })
    .filter(Boolean);
}

function getCheckboxValue(form: HTMLFormElement, name: string): boolean {
  const field = Array.from(form.elements).find(
    (element) => element.getAttribute("name") === name
  );

  return (
    field instanceof HTMLInputElement &&
    field.type === "checkbox" &&
    field.checked
  );
}

function parseFlow(
  value: string,
  fallbackMessage: string,
  fallbackButtonName: string,
  fallbackButtonUrl: string
): FlowMessage[] {
  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const normalized = parsed
        .map((raw, index) => {
          const item = raw as Partial<FlowMessage> | null;
          const buttons = Array.isArray(item?.buttons)
            ? item.buttons.map((rawButton, buttonIndex) => {
                const button = rawButton as Partial<FlowButton> | null;

                const action: "link" | "flow" =
                  button?.action === "flow" ? "flow" : "link";

                return {
                  id: String(
                    button?.id || `button_${index + 1}_${buttonIndex + 1}`
                  ),
                  label: String(button?.label || "").trim(),
                  action,
                  ...(button?.url
                    ? { url: String(button.url).trim() }
                    : {}),
                  ...(button?.targetMessageId
                    ? {
                        targetMessageId: String(
                          button.targetMessageId
                        ),
                      }
                    : {}),
                } satisfies FlowButton;
              })
            : [];

          return {
            id: String(item?.id || `message_${index + 1}`),
            message: String(item?.message || ""),
            buttons,
          } satisfies FlowMessage;
        })
        .filter((message) => message.id);

      if (normalized.length > 0) {
        return normalized;
      }
    }
  } catch {
    // Fall back to legacy fields below.
  }

  return [
    {
      id: "message_1",
      message: fallbackMessage,
      buttons:
        fallbackButtonName && fallbackButtonUrl
          ? [
              {
                id: "button_1",
                label: fallbackButtonName,
                action: "link" as const,
                url: fallbackButtonUrl,
              },
            ]
          : [],
    },
  ];
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

function MediaPreview({ post }: { post: InstagramPost }) {
  if (!post.media_url) {
    return (
      <div className="flex aspect-square items-center justify-center bg-[#17181c] text-xs text-white/30">
        No media preview available
      </div>
    );
  }

  const isVideo =
    post.media_type === "VIDEO" || post.media_type === "REEL";

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
  const [tab, setTab] = useState<PreviewTab>("post");

  const [message, setMessage] = useState("");
  const [followupMessage, setFollowupMessage] = useState("");
  const [followupEnabled, setFollowupEnabled] = useState(false);

  const [triggerType, setTriggerType] = useState("keywords");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [selectedPostId, setSelectedPostId] = useState("");

  const [replyEnabled, setReplyEnabled] = useState(false);
  const [replyTexts, setReplyTexts] = useState<string[]>([]);

  const [buttonName, setButtonName] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [dmFlow, setDmFlow] = useState<FlowMessage[]>([]);
  const [previewMessageId, setPreviewMessageId] = useState("");

  useEffect(() => {
    const form = document.getElementById(
      "new-automation-form"
    );

    if (!(form instanceof HTMLFormElement)) return;

    const syncForm = () => {
      const dmMessage = getFormValue(form, "dm_message");

      setMessage(dmMessage);
      setFollowupMessage(getFormValue(form, "followup_message"));
      setFollowupEnabled(
        getCheckboxValue(form, "followup_enabled")
      );

      setTriggerType(
        getFormValue(form, "trigger_type") || "keywords"
      );
      setTriggerKeywords(
        getFormValue(form, "trigger_keywords")
      );

      setReplyEnabled(
        getCheckboxValue(form, "reply_enabled")
      );
      setReplyTexts(
        getFormValues(form, "reply_texts")
      );

      const legacyButtonName = getFormValue(form, "button_name");
      const legacyButtonUrl = getFormValue(form, "button_url");

      setButtonName(legacyButtonName);
      setButtonUrl(legacyButtonUrl);

      const flow = parseFlow(
        getFormValue(form, "dm_flow"),
        dmMessage,
        legacyButtonName,
        legacyButtonUrl
      );

      setDmFlow(flow);

      setPreviewMessageId((current) =>
        flow.some((item) => item.id === current)
          ? current
          : flow[0]?.id || ""
      );

      const postField = Array.from(form.elements).find(
        (element) =>
          element.getAttribute("name") === "instagram_post_id"
      );

      if (
        postField instanceof HTMLInputElement ||
        postField instanceof HTMLSelectElement
      ) {
        setSelectedPostId(postField.value);
      }
    };

    const handlePostSelected = (event: Event) => {
      const customEvent = event as CustomEvent<{
        postId?: string;
      }>;

      if (customEvent.detail?.postId) {
        setSelectedPostId(customEvent.detail.postId);
      }
    };

    syncForm();

    form.addEventListener("input", syncForm);
    form.addEventListener("change", syncForm);
    window.addEventListener(
      "devilx:post-selected",
      handlePostSelected
    );

    return () => {
      form.removeEventListener("input", syncForm);
      form.removeEventListener("change", syncForm);
      window.removeEventListener(
        "devilx:post-selected",
        handlePostSelected
      );
    };
  }, []);

  const selectedPost = useMemo(
    () =>
      posts.find((post) => post.id === selectedPostId) ?? null,
    [posts, selectedPostId]
  );

  const firstKeyword =
    triggerKeywords
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)[0];

  const triggerComment =
    triggerType === "any_comment" ||
    triggerType === "any" ||
    !firstKeyword
      ? "Any comment"
      : firstKeyword;

  const visibleReplies =
    replyTexts.length > 0
      ? replyTexts
      : ["Your public reply will appear here…"];

  const currentMessage =
    dmFlow.find((item) => item.id === previewMessageId) ??
    dmFlow[0] ??
    null;

  const displayMessage =
    currentMessage?.message.trim() ||
    message.trim() ||
    "Your DM message will appear here…";

  const resetFlow = () => {
    setPreviewMessageId(dmFlow[0]?.id || "");
  };

  const openFlowMessage = (button: FlowButton) => {
    if (
      button.action === "flow" &&
      button.targetMessageId &&
      dmFlow.some((messageItem) => messageItem.id === button.targetMessageId)
    ) {
      setPreviewMessageId(button.targetMessageId);
    }
  };

  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0a0a] shadow-2xl shadow-black/30">
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
                See exactly what people will experience.
              </p>
            </div>

            <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-[10px] font-medium text-green-300">
              LIVE
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
            {(
              [
                ["post", "Post"],
                ["comments", "Comments"],
                ["dm", "DM"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                  tab === value
                    ? "bg-white text-black"
                    : "text-white/45 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-black shadow-xl">
            {tab === "post" && (
              <div className="bg-[#0e0f12]">
                {selectedPost ? (
                  <>
                    <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
                      <Avatar
                        profilePictureUrl={profilePictureUrl}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white">
                          {username || "your_instagram"}
                        </p>
                        <p className="text-[10px] text-white/35">
                          Original post
                        </p>
                      </div>
                      <span className="text-white/30">•••</span>
                    </div>

                    <MediaPreview post={selectedPost} />

                    <div className="space-y-2 p-4">
                      <div className="flex items-center gap-4 text-lg text-white/70">
                        <span>♡</span>
                        <span>◯</span>
                        <span>⌁</span>
                        <span className="ml-auto">⌑</span>
                      </div>

                      <p className="text-[11px] font-semibold text-white">
                        {username || "your_instagram"}
                      </p>

                      {selectedPost.caption && (
                        <p className="whitespace-pre-wrap text-[11px] leading-5 text-white/70">
                          {selectedPost.caption}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[520px] items-center justify-center px-8 text-center">
                    <p className="text-xs leading-5 text-white/35">
                      Select a post to preview it here.
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "comments" && (
              <div className="bg-[#0e0f12]">
                {selectedPost ? (
                  <>
                    <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
                      <Avatar
                        profilePictureUrl={profilePictureUrl}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white">
                          {username || "your_instagram"}
                        </p>
                        <p className="text-[10px] text-white/35">
                          Comments
                        </p>
                      </div>
                    </div>

                    <MediaPreview post={selectedPost} />

                    <div className="space-y-4 p-4">
                      <div className="flex gap-2">
                        <div className="h-7 w-7 shrink-0 rounded-full bg-white/10" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-white">
                            someone
                          </p>
                          <div className="mt-1 rounded-2xl bg-[#26272b] px-3 py-2.5">
                            <p className="text-[12px] leading-5 text-white">
                              {triggerComment}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                        <p className="text-[9px] uppercase tracking-wider text-white/30">
                          Trigger
                        </p>
                        <p className="mt-1 text-[11px] text-white/70">
                          {triggerType === "any_comment" ||
                          triggerType === "any"
                            ? "Any comment"
                            : `Keyword: ${
                                firstKeyword || "your keyword"
                              }`}
                        </p>
                      </div>

                      {replyEnabled ? (
                        <div className="space-y-3">
                          {visibleReplies.map((reply, index) => (
                            <div
                              key={`${reply}-${index}`}
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
                                    {reply}
                                  </p>
                                </div>
                                <div className="mt-1 text-[9px] text-white/30">
                                  now
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/[0.08] p-3">
                          <p className="text-[10px] text-white/30">
                            Comment reply is disabled.
                          </p>
                        </div>
                      )}
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

            {tab === "dm" && (
              <div className="bg-[#0e0f12]">
                <div className="border-b border-white/[0.07] bg-[#111216] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={resetFlow}
                      className="text-xl leading-none text-white/80"
                      aria-label="Reset DM preview"
                    >
                      ‹
                    </button>

                    {profilePictureUrl ? (
                      <img
                        src={profilePictureUrl}
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
                        {username || "your_instagram"}
                      </p>
                      <p className="text-[10px] text-white/40">
                        Active now
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-white/50">
                      <span>☎</span>
                      <span>▣</span>
                      <span>ⓘ</span>
                    </div>
                  </div>
                </div>

                <div className="min-h-[430px] space-y-4 px-4 py-6">
                  <p className="mb-7 text-center text-[10px] text-white/30">
                    Today
                  </p>

                  <div className="flex items-end gap-2">
                    <Avatar
                      profilePictureUrl={profilePictureUrl}
                    />

                    <div className="max-w-[82%] rounded-[20px] rounded-bl-[6px] bg-[#26272b] px-4 py-3 text-[13px] leading-[1.55] text-white/95">
                      <span className="whitespace-pre-wrap break-words">
                        {displayMessage}
                      </span>

                      {currentMessage?.buttons.length ? (
                        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1b1c20]">
                          {currentMessage.buttons.map(
                            (button, index) => (
                              <button
                                key={button.id}
                                type="button"
                                onClick={() =>
                                  openFlowMessage(button)
                                }
                                className={`w-full px-4 py-2.5 text-center text-[12px] font-semibold ${
                                  index > 0
                                    ? "border-t border-white/[0.08]"
                                    : ""
                                } ${
                                  button.action === "flow"
                                    ? "text-[#4ade80]"
                                    : "text-[#60a5fa]"
                                }`}
                              >
                                {button.label ||
                                  "Your Button"}
                              </button>
                            )
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {currentMessage &&
                    currentMessage.id !== dmFlow[0]?.id && (
                      <p className="pl-9 text-[10px] text-white/25">
                        Flow step {Math.max(
                          1,
                          dmFlow.findIndex(
                            (item) =>
                              item.id === currentMessage.id
                          ) + 1
                        )}
                      </p>
                    )}

                  {followupEnabled &&
                    followupMessage.trim() && (
                      <div className="flex items-end gap-2">
                        <Avatar
                          profilePictureUrl={
                            profilePictureUrl
                          }
                        />
                        <div className="max-w-[82%] rounded-[20px] rounded-bl-[6px] bg-[#26272b] px-4 py-3 text-[13px] leading-[1.55] text-white/95">
                          <span className="whitespace-pre-wrap break-words">
                            {followupMessage.trim()}
                          </span>
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
                : currentMessage?.buttons.length
                  ? "Click a Flow button to preview the next DM step."
                  : "Shows the DM inbox conversation the user receives."}
          </p>
        </div>
      </div>
    </aside>
  );
}
