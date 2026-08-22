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
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {posts.map((post) => (
          <button
            key={post.id}
            onClick={() => setSelectedPost(post)}
            className="overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left"
          >
            <div className="aspect-square overflow-hidden bg-black">
              {post.media_type === "VIDEO" || post.media_type === "REEL" ? (
                <video
                  src={post.media_url ?? ""}
                  className="h-full w-full object-cover"
                  muted
                />
              ) : (
                <img
                  src={post.media_url ?? ""}
                  alt={post.caption ?? "Instagram media"}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="p-3">
              <p className="line-clamp-2 text-xs text-gray-400">
                {post.caption ?? "No description"}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                ❤️ {post.likes_count ?? 0} · 💬 {post.comments_count ?? 0}
              </p>
            </div>
          </button>
        ))}
      </div>

      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] lg:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center bg-black">
              {selectedPost.media_type === "VIDEO" ||
              selectedPost.media_type === "REEL" ? (
                <video
                  src={selectedPost.media_url ?? ""}
                  controls
                  className="max-h-[80vh] max-w-full"
                />
              ) : (
                <img
                  src={selectedPost.media_url ?? ""}
                  alt={selectedPost.caption ?? "Instagram media"}
                  className="max-h-[80vh] max-w-full object-contain"
                />
              )}
            </div>

            <div className="p-6">
              <h2 className="text-lg font-semibold">
                Description
              </h2>

              <p className="mt-4 text-sm leading-6 text-gray-300">
                {selectedPost.caption ?? "No description available."}
              </p>

              <p className="mt-5 text-sm text-gray-400">
                ❤️ {selectedPost.likes_count ?? 0} · 💬{" "}
                {selectedPost.comments_count ?? 0}
              </p>

              {selectedPost.permalink && (
                <a
                  href={selectedPost.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-block text-sm text-gray-300 hover:text-white"
                >
                  View on Instagram ↗
                </a>
              )}

              <button
                onClick={() => setSelectedPost(null)}
                className="mt-6 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}