"use client";

import { useState } from "react";

type Post = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  likes_count: number | null;
  comments_count: number | null;
};

export default function PostsGrid({
  posts,
}: {
  posts: Post[];
}) {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-6">
        {posts.map((post) => (
          <button
            key={post.id}
            onClick={() => setSelectedPost(post)}
            className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition hover:border-white/30"
          >
            <div className="aspect-square overflow-hidden bg-black">
              {post.media_type === "VIDEO" || post.media_type === "REEL" ? (
                <video
                  src={post.media_url ?? ""}
                  muted
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <img
                  src={post.media_url ?? ""}
                  alt="Instagram post"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              )}
            </div>

            <div className="p-3">
              <p className="line-clamp-2 text-xs text-gray-300">
                {post.caption || "No description"}
              </p>

              <div className="mt-3 flex gap-3 text-xs text-gray-500">
                <span>❤️ {post.likes_count ?? 0}</span>
                <span>💬 {post.comments_count ?? 0}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="relative grid w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[#101010] shadow-2xl lg:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPost(null)}
              className="absolute right-5 top-5 z-10 rounded-full border border-white/10 bg-black/50 px-3 py-2 text-gray-300 hover:bg-white/10"
            >
              ✕
            </button>

            <div className="flex min-h-[420px] items-center justify-center bg-black">
              {selectedPost.media_type === "VIDEO" ||
              selectedPost.media_type === "REEL" ? (
                <video
                  src={selectedPost.media_url ?? ""}
                  controls
                  className="max-h-[80vh] max-w-full object-contain"
                />
              ) : (
                <img
                  src={selectedPost.media_url ?? ""}
                  alt="Instagram post"
                  className="max-h-[80vh] max-w-full object-contain"
                />
              )}
            </div>

            <div className="flex flex-col p-8">
              <span className="mb-5 w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300">
                {selectedPost.media_type || "MEDIA"}
              </span>

              <h2 className="text-2xl font-semibold text-white">
                Post Details
              </h2>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-gray-500">Likes</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    ❤️ {selectedPost.likes_count ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-gray-500">Comments</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    💬 {selectedPost.comments_count ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-400">
                  Description
                </h3>

                <p className="mt-3 max-h-40 overflow-y-auto text-sm leading-6 text-gray-200">
                  {selectedPost.caption || "No description available."}
                </p>
              </div>

              {selectedPost.permalink && (
                <a
                  href={selectedPost.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-auto pt-8"
                >
                  <button className="w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-gray-200">
                    View on Instagram ↗
                  </button>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}