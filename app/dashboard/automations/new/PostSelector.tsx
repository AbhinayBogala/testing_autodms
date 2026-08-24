"use client";

import { useState } from "react";

type InstagramPost = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  published_at: string | null;
};

export default function PostSelector({
  posts,
  initialPost = null,
}: {
  posts: InstagramPost[];
  initialPost?: InstagramPost | null;
}) {
  const [open, setOpen] = useState(false);

  const [selected, setSelected] =
    useState<InstagramPost | null>(
      initialPost
    );

  const [visibleCount, setVisibleCount] =
    useState(8);

  // ============================================================
  // SORT POSTS
  // Latest Instagram media first
  // Oldest media last
  // ============================================================

  const sortedPosts = [...posts].sort(
    (a, b) => {
      const dateA = a.published_at
        ? new Date(
            a.published_at
          ).getTime()
        : 0;

      const dateB = b.published_at
        ? new Date(
            b.published_at
          ).getTime()
        : 0;

      return dateB - dateA;
    }
  );

  return (
    <>
      {/* ========================================================
          HIDDEN FORM VALUE
      ======================================================== */}

      <input
        type="hidden"
        name="instagram_post_id"
        value={selected?.id ?? ""}
      />

      {/* ========================================================
          SELECTED POST
      ======================================================== */}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          w-full
          rounded-xl
          border
          border-white/10
          bg-[#0b0e16]
          p-4
          text-left
          hover:bg-white/5
        "
      >
        {selected ? (
          <div className="flex items-center gap-4">
            {selected.media_url &&
              (selected.media_type === "VIDEO" ||
              selected.media_type === "REEL" ? (
                <video
                  src={selected.media_url}
                  className="
                    h-20
                    w-20
                    rounded-xl
                    object-cover
                  "
                  muted
                  playsInline
                  controls={false}
                />
              ) : (
                <img
                  src={selected.media_url}
                  className="
                    h-20
                    w-20
                    rounded-xl
                    object-cover
                  "
                  alt="Selected post"
                />
              ))}

            <div>
              <p className="font-semibold">
                {selected.media_type ??
                  "POST"}
              </p>

              <p className="
                mt-1
                line-clamp-2
                text-sm
                text-white/50
              ">
                {selected.caption ||
                  "No caption"}
              </p>

              {selected.published_at && (
                <p className="
                  mt-2
                  text-xs
                  text-white/30
                ">
                  {new Date(
                    selected.published_at
                  ).toLocaleString(
                    "en-IN",
                    {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}
                </p>
              )}

              <p className="
                mt-2
                text-xs
                text-blue-400
              ">
                Click to change post
              </p>
            </div>
          </div>
        ) : (
          <p className="text-white/50">
            Select Instagram Post
          </p>
        )}
      </button>

      {/* ========================================================
          POST SELECTOR MODAL
      ======================================================== */}

      {open && (
        <div
          className="
            fixed
            inset-0
            z-50
            flex
            items-center
            justify-center
            bg-black/70
            px-5
          "
        >
          <div
            className="
              flex
              max-h-[85vh]
              w-full
              max-w-5xl
              flex-col
              rounded-3xl
              border
              border-white/10
              bg-[#090b12]
              p-6
            "
          >
            {/* ==================================================
                HEADER
            ================================================== */}

            <div className="
              mb-6
              flex
              items-center
              justify-between
            ">
              <div>
                <h2 className="text-xl font-bold">
                  Select Instagram Post
                </h2>

                <p className="
                  mt-1
                  text-xs
                  text-white/40
                ">
                  Latest posts appear first
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="
                  text-white/50
                  hover:text-white
                "
              >
                ✕
              </button>
            </div>

            {/* ==================================================
                POSTS
            ================================================== */}

            <div
              className="
                grid
                max-h-[55vh]
                grid-cols-2
                gap-5
                overflow-y-auto
                pr-2
                md:grid-cols-4
              "
            >
              {sortedPosts
                .slice(
                  0,
                  visibleCount
                )
                .map((post) => (
                  <button
                    type="button"
                    key={post.id}
                    onClick={() => {
                      setSelected(post);
                      setOpen(false);
                    }}
                    className="
                      overflow-hidden
                      rounded-2xl
                      border
                      border-white/10
                      text-left
                      hover:border-purple-500
                    "
                  >
                    {/* ==================================================
                        MEDIA
                    ================================================== */}

                    {post.media_url &&
                      (post.media_type ===
                        "VIDEO" ||
                      post.media_type ===
                        "REEL" ? (
                        <video
                          src={
                            post.media_url
                          }
                          className="
                            aspect-square
                            w-full
                            object-cover
                          "
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={
                            post.media_url
                          }
                          className="
                            aspect-square
                            w-full
                            object-cover
                          "
                          alt="Instagram post"
                        />
                      ))}

                    {/* ==================================================
                        POST INFO
                    ================================================== */}

                    <div className="p-3">
                      <p className="
                        text-xs
                        text-white/40
                      ">
                        {post.media_type ??
                          "POST"}
                      </p>

                      <p className="
                        mt-1
                        line-clamp-3
                        text-sm
                      ">
                        {post.caption ||
                          "No caption"}
                      </p>

                      {post.published_at && (
                        <p className="
                          mt-2
                          text-[10px]
                          text-white/30
                        ">
                          {new Date(
                            post.published_at
                          ).toLocaleDateString(
                            "en-IN",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
            </div>

            {/* ==================================================
                LOAD MORE
            ================================================== */}

            {visibleCount <
              sortedPosts.length && (
              <button
                type="button"
                onClick={() =>
                  setVisibleCount(
                    (prev) =>
                      prev + 8
                  )
                }
                className="
                  mt-6
                  w-full
                  rounded-xl
                  bg-white/10
                  py-3
                  hover:bg-white/20
                "
              >
                Load More
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}