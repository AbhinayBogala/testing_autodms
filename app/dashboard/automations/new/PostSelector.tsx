"use client";

import { useState } from "react";

type InstagramPost = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
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
    useState<InstagramPost | null>(initialPost);

  const [visibleCount, setVisibleCount] = useState(8);

  return (
    <>
      <input
        type="hidden"
        name="instagram_post_id"
        value={selected?.id ?? ""}
      />

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          w-full rounded-xl border border-white/10
          bg-[#0b0e16] p-4 text-left hover:bg-white/5
        "
      >
        {selected ? (
          <div className="flex items-center gap-4">
            {selected.media_url &&
              (selected.media_type === "VIDEO" ? (
                <video
                  src={selected.media_url}
                  className="h-20 w-20 rounded-xl object-cover"
                  muted
                  playsInline
                  controls={false}
                />
              ) : (
                <img
                  src={selected.media_url}
                  className="h-20 w-20 rounded-xl object-cover"
                  alt="Selected post"
                />
              ))}

            <div>
              <p className="font-semibold">
                {selected.media_type ?? "POST"}
              </p>

              <p className="mt-1 text-sm text-white/50 line-clamp-2">
                {selected.caption || "No caption"}
              </p>

              <p className="mt-2 text-xs text-blue-400">
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

      {open && (
        <div
          className="
            fixed inset-0 z-50 flex items-center justify-center
            bg-black/70 px-5
          "
        >
          <div
            className="
              w-full max-w-5xl max-h-[85vh]
              rounded-3xl border border-white/10
              bg-[#090b12] p-6 flex flex-col
            "
          >
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-xl font-bold">
                Select Instagram Post
              </h2>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div
              className="
                grid grid-cols-2 md:grid-cols-4 gap-5
                overflow-y-auto max-h-[55vh] pr-2
              "
            >
              {posts.slice(0, visibleCount).map((post) => (
                <button
                  type="button"
                  key={post.id}
                  onClick={() => {
                    setSelected(post);
                    setOpen(false);
                  }}
                  className="
                    overflow-hidden rounded-2xl
                    border border-white/10
                    hover:border-purple-500 text-left
                  "
                >
                  {post.media_url &&
                    (post.media_type === "VIDEO" ? (
                      <video
                        src={post.media_url}
                        className="aspect-square w-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={post.media_url}
                        className="aspect-square w-full object-cover"
                        alt="Instagram post"
                      />
                    ))}

                  <div className="p-3">
                    <p className="text-xs text-white/40">
                      {post.media_type}
                    </p>

                    <p className="mt-1 text-sm line-clamp-3">
                      {post.caption || "No caption"}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {visibleCount < posts.length && (
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((prev) => prev + 8)
                }
                className="
                  mt-6 w-full rounded-xl
                  bg-white/10 py-3
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