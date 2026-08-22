"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InstagramComment } from "@/types/instagram";

type Post = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  published_at: string | null;
  likes_count: number | null;
  comments_count: number | null;
};

export default function PostsGrid({
  posts,
  comments: initialComments,
}: {
  posts: Post[];
  comments: InstagramComment[];
}) {
  const [selectedPost, setSelectedPost] =
    useState<Post | null>(null);

  const [comments, setComments] =
    useState<InstagramComment[]>(
      initialComments
    );

  const [replyingTo, setReplyingTo] =
    useState<string | null>(null);

  const [replyText, setReplyText] =
    useState("");

  const [replyLoading, setReplyLoading] =
    useState(false);

  const [replyError, setReplyError] =
    useState("");

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        closePopup();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  });

  useEffect(() => {
    if (selectedPost) {
      document.body.style.overflow =
        "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedPost]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("instagram-comments-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "instagram_comments",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newComment =
              payload.new as InstagramComment;

            setComments((current) => {
              const exists = current.some(
                (comment) =>
                  comment.id === newComment.id
              );

              if (exists) {
                return current;
              }

              return [
                ...current,
                {
                  ...newComment,
                  replies: [],
                },
              ];
            });
          }

          if (payload.eventType === "UPDATE") {
            const updatedComment =
              payload.new as InstagramComment;

            setComments((current) =>
              current.map((comment) =>
                comment.id === updatedComment.id
                  ? {
                      ...comment,
                      ...updatedComment,
                    }
                  : comment
              )
            );
          }

          if (payload.eventType === "DELETE") {
            const deletedComment =
              payload.old as {
                id: string;
              };

            setComments((current) =>
              current.filter(
                (comment) =>
                  comment.id !== deletedComment.id
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "instagram_posts",
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedPost =
              payload.old as {
                id: string;
              };

            setSelectedPost((current) =>
              current?.id === deletedPost.id
                ? null
                : current
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  function closePopup() {
    setSelectedPost(null);
    setReplyingTo(null);
    setReplyText("");
    setReplyError("");
  }

  const selectedComments = useMemo(() => {
    if (!selectedPost) return [];

    return comments.filter(
      (comment) =>
        comment.instagram_post_id === selectedPost.id
    );
  }, [comments, selectedPost]);

  const topLevelCommentCount = useMemo(
    () =>
      selectedComments.filter(
        (comment) => !comment.parent_comment_id
      ).length,
    [selectedComments]
  );

  /*
   * Convert the flat database comments
   * into a parent → child tree.
   */
  const commentTree = useMemo(() => {
    return buildCommentTree(
      selectedComments
    );
  }, [selectedComments]);

  function openReply(
    comment: InstagramComment
  ) {
    setReplyingTo(comment.id);
    setReplyText("");
    setReplyError("");
  }

  function cancelReply() {
    setReplyingTo(null);
    setReplyText("");
    setReplyError("");
  }

  async function sendReply(
    comment: InstagramComment
  ) {
    const text = replyText.trim();

    if (!text) {
      setReplyError(
        "Please enter a reply."
      );
      return;
    }

    if (text.length > 1000) {
      setReplyError(
        "Reply is too long."
      );
      return;
    }

    setReplyLoading(true);
    setReplyError("");

    try {
      const response = await fetch(
        "/api/instagram/comments/reply",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            commentId: comment.id,
            replyText: text,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setReplyError(
          data?.details?.error?.message ||
            data?.details?.message ||
            data?.error ||
            "Failed to send reply."
        );

        return;
      }

      /*
       * Add the reply as a real
       * InstagramComment node.
       */
      const newComment: InstagramComment = {
        id:
          data?.comment?.id ??
          data?.reply?.id ??
          `local-${Date.now()}`,

        instagram_post_id:
          comment.instagram_post_id,

        instagram_comment_id:
          data?.instagramReplyId ??
          data?.reply?.instagram_reply_id ??
          null,

        commenter_instagram_id:
          null,

        commenter_username:
          "You",

        comment_text:
          text,

        /*
         * Parent relationship.
         */
        parent_comment_id:
          comment.instagram_comment_id ??
          comment.id,

        public_reply_sent: true,

        public_reply_text: text,

        public_reply_at:
          new Date().toISOString(),

        dm_sent: false,

        created_at:
          data?.reply?.created_at ??
          new Date().toISOString(),

        replies: [],
      };

      /*
       * Add it to the flat list.
       * buildCommentTree() will put it
       * under the correct parent.
       */
      setComments(
        (current) => [
          ...current,
          newComment,
        ]
      );

      setReplyingTo(null);
      setReplyText("");
      setReplyError("");
    } catch (error) {
      console.error(
        "INSTAGRAM REPLY ERROR:",
        error
      );

      setReplyError(
        "Something went wrong while sending the reply."
      );
    } finally {
      setReplyLoading(false);
    }
  }

  return (
    <>
      {/* ==================================================
          POSTS GRID
      ================================================== */}

      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {posts.map((post) => (
          <button
            key={post.id}
            type="button"
            onClick={() =>
              setSelectedPost(post)
            }
            className="
              group
              overflow-hidden
              rounded-xl
              border
              border-white/10
              bg-white/5
              text-left
              transition
              hover:border-white/20
              hover:bg-white/10
            "
          >
            <div className="relative aspect-square overflow-hidden bg-black">
              {post.media_url ? (
                isVideo(
                  post.media_type
                ) ? (
                  <div className="relative h-full w-full">
                    <video
                      src={post.media_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />

                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white">
                        ▶
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={post.media_url}
                    alt={
                      post.caption ||
                      "Instagram post"
                    }
                    className="
                      h-full
                      w-full
                      object-cover
                      transition
                      duration-300
                      group-hover:scale-105
                    "
                  />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-600">
                  No media
                </div>
              )}
            </div>

            <div className="p-3">
              <p className="line-clamp-2 text-xs text-gray-400">
                {post.caption ||
                  "No caption"}
              </p>

              <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                <span>
                  ♥ {post.likes_count ?? 0}
                </span>

                <span>
                  💬{" "}
                  {post.comments_count ??
                    0}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ==================================================
          COMMENTS POPUP
      ================================================== */}

      {selectedPost && (
        <div
          className="
            fixed
            inset-0
            z-50
            flex
            items-center
            justify-center
            bg-black/80
            p-4
            backdrop-blur-sm
          "
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closePopup();
            }
          }}
        >
          <div
            className="
              flex
              h-[92vh]
              w-full
              max-w-7xl
              overflow-hidden
              rounded-2xl
              border
              border-white/10
              bg-[#0d0d0d]
              shadow-2xl
            "
          >
            {/* ==========================================
                POST
            ========================================== */}

            <div
              className="
                hidden
                w-[55%]
                min-w-0
                flex-col
                bg-black
                lg:flex
              "
            >
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                {selectedPost.media_url ? (
                isVideo(
                  selectedPost.media_type
                ) ? (
                  <video
                    src={
                      selectedPost.media_url
                    }
                    controls
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <img
                    src={
                      selectedPost.media_url
                    }
                    alt={
                      selectedPost.caption ||
                      "Instagram post"
                    }
                    className="max-h-full max-w-full object-contain"
                  />
                )
                ) : (
                  <div className="text-gray-600">
                    No media
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-white/10 px-5 py-4">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>♥ {selectedPost.likes_count ?? 0}</span>
                  <span>💬 {selectedPost.comments_count ?? 0}</span>
                  {selectedPost.permalink && (
                    <a
                      href={selectedPost.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-gray-400 hover:text-white"
                    >
                      View on Instagram ↗
                    </a>
                  )}
                </div>
                {selectedPost.caption && (
                  <p className="mt-2 line-clamp-3 text-sm leading-5 text-gray-300">
                    {selectedPost.caption}
                  </p>
                )}
              </div>
            </div>

            {/* ==========================================
                COMMENTS
            ========================================== */}

            <div className="flex min-w-0 w-full flex-col lg:w-[45%]">
              <div
                className="
                  flex
                  shrink-0
                  items-center
                  justify-between
                  border-b
                  border-white/10
                  px-5
                  py-4
                "
              >
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Comments
                  </h2>

                  <p className="mt-0.5 text-xs text-gray-500">
                    {topLevelCommentCount}
                    {topLevelCommentCount === 1 ? " comment" : " comments"}
                    {selectedComments.length > topLevelCommentCount
                      ? ` · ${selectedComments.length - topLevelCommentCount} replies`
                      : ""}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closePopup}
                  className="
                    flex
                    h-8
                    w-8
                    items-center
                    justify-center
                    rounded-full
                    text-xl
                    text-gray-500
                    hover:bg-white/10
                    hover:text-white
                  "
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {commentTree.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-600">
                    No comments yet.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {commentTree.map(
                      (comment) => (
                        <ThreadedComment
                          key={comment.id}
                          comment={comment}
                          depth={0}
                          replyingTo={
                            replyingTo
                          }
                          replyText={
                            replyText
                          }
                          replyLoading={
                            replyLoading
                          }
                          replyError={
                            replyError
                          }
                          onReply={
                            openReply
                          }
                          onCancelReply={
                            cancelReply
                          }
                          onReplyTextChange={
                            setReplyText
                          }
                          onSendReply={
                            sendReply
                          }
                        />
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-white/10 px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-600">Reply to any comment to continue the thread.</p>
                  <button
                    type="button"
                    onClick={closePopup}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/10 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ========================================================
   RECURSIVE COMMENT
======================================================== */

function ThreadedComment({
  comment,
  depth,
  replyingTo,
  replyText,
  replyLoading,
  replyError,
  onReply,
  onCancelReply,
  onReplyTextChange,
  onSendReply,
}: {
  comment: InstagramComment;
  depth: number;
  replyingTo: string | null;
  replyText: string;
  replyLoading: boolean;
  replyError: string;

  onReply: (
    comment: InstagramComment
  ) => void;

  onCancelReply: () => void;

  onReplyTextChange: (
    value: string
  ) => void;

  onSendReply: (
    comment: InstagramComment
  ) => void;
}) {
  const indentation =
    Math.min(depth, 6) * 24;

  return (
    <div
      style={{
        marginLeft:
          depth > 0
            ? `${indentation}px`
            : undefined,
      }}
    >
      <div className="relative">
        {depth > 0 && (
          <div
            className="
              absolute
              -left-3
              top-0
              bottom-0
              w-px
              bg-white/10
            "
          />
        )}

        <div className="flex gap-3 rounded-xl px-2 py-1.5 transition hover:bg-white/[0.03]">
          <div
            className="
              flex
              h-8
              w-8
              shrink-0
              items-center
              justify-center
              rounded-full
              bg-white/10
              text-xs
              font-semibold
              text-gray-300
            "
          >
            {getInitial(
              comment.commenter_username
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">
                {comment.commenter_username
                  ? `@${comment.commenter_username}`
                  : "Instagram user"}
              </p>

              {comment.created_at && (
                <span className="text-[10px] text-gray-600">
                  {formatCommentTime(
                    comment.created_at
                  )}
                </span>
              )}
            </div>

            <p className="mt-1 text-sm leading-5 text-gray-300">
              {comment.comment_text ||
                "No comment text"}
            </p>

            <div className="mt-2 flex items-center gap-4">
              <button
                type="button"
                onClick={() =>
                  onReply(comment)
                }
                className="
                  text-xs
                  font-semibold
                  text-gray-500
                  hover:text-white
                "
              >
                Reply
              </button>

              {comment.public_reply_sent && (
                <span className="text-[10px] text-emerald-500/80">
                  Replied
                </span>
              )}

              {comment.replies.length >
                0 && (
                <span className="text-[10px] text-gray-600">
                  {comment.replies.length}{" "}
                  {comment.replies.length ===
                  1
                    ? "reply"
                    : "replies"}
                </span>
              )}
            </div>

            {/* REPLY BOX */}

            {replyingTo ===
              comment.id && (
              <div className="mt-3">
                <textarea
                  value={replyText}
                  onChange={(event) =>
                    onReplyTextChange(
                      event.target.value
                    )
                  }
                  placeholder="Reply to this comment..."
                  rows={3}
                  maxLength={1000}
                  autoFocus
                  className="
                    w-full
                    resize-none
                    rounded-lg
                    border
                    border-white/10
                    bg-black/40
                    px-3
                    py-2.5
                    text-sm
                    text-white
                    outline-none
                    placeholder:text-gray-600
                    focus:border-white/20
                  "
                />

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-600">
                    {replyText.length}/1000
                  </span>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={
                        onCancelReply
                      }
                      disabled={
                        replyLoading
                      }
                      className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onSendReply(
                          comment
                        )
                      }
                      disabled={
                        replyLoading ||
                        !replyText.trim()
                      }
                      className="
                        rounded-lg
                        bg-white
                        px-3
                        py-1.5
                        text-xs
                        font-semibold
                        text-black
                        hover:bg-gray-200
                        disabled:opacity-50
                      "
                    >
                      {replyLoading
                        ? "Sending..."
                        : "Send Reply"}
                    </button>
                  </div>
                </div>

                {replyError && (
                  <p className="mt-2 text-xs text-red-400">
                    {replyError}
                  </p>
                )}
              </div>
            )}

            {/* CHILDREN */}

            {comment.replies.length >
              0 && (
              <div className="mt-4 space-y-4">
                {comment.replies.map(
                  (child) => (
                    <ThreadedComment
                      key={child.id}
                      comment={child}
                      depth={depth + 1}
                      replyingTo={
                        replyingTo
                      }
                      replyText={
                        replyText
                      }
                      replyLoading={
                        replyLoading
                      }
                      replyError={
                        replyError
                      }
                      onReply={
                        onReply
                      }
                      onCancelReply={
                        onCancelReply
                      }
                      onReplyTextChange={
                        onReplyTextChange
                      }
                      onSendReply={
                        onSendReply
                      }
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================
   BUILD COMMENT TREE
======================================================== */

function buildCommentTree(
  flatComments: InstagramComment[]
): InstagramComment[] {
  const comments =
    flatComments.map(
      (comment) => ({
        ...comment,
        replies: [],
      })
    );

  const commentMap =
    new Map<
      string,
      InstagramComment
    >();

  for (const comment of comments) {
    commentMap.set(
      comment.id,
      comment
    );

    if (comment.instagram_comment_id) {
      commentMap.set(
        comment.instagram_comment_id,
        comment
      );
    }
  }

  const roots: InstagramComment[] =
    [];

  for (const comment of comments) {
    const parentId =
      comment.parent_comment_id;

    if (!parentId) {
      roots.push(comment);
      continue;
    }

    const parent =
      commentMap.get(parentId);

    if (parent) {
      parent.replies.push(comment);
    } else {
      /*
       * Don't lose comments if their
       * parent isn't currently loaded.
       */
      roots.push(comment);
    }
  }

  return roots;
}

/* ========================================================
   HELPERS
======================================================== */

function isVideo(
  mediaType: string | null
) {
  return (
    mediaType === "VIDEO" ||
    mediaType === "REEL"
  );
}

function formatCommentTime(
  date: string
) {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(new Date(date));
}

function getInitial(
  username: string | null
) {
  if (!username) {
    return "?";
  }

  return username
    .charAt(0)
    .toUpperCase();
}