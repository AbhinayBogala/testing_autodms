import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

import SyncInstagramButton from "../SyncInstagramButton";
import PostsGrid from "../PostsGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContentPage() {
  const supabase = await createClient();

  // ============================================================
  // AUTH
  // ============================================================

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ============================================================
  // ACTIVE INSTAGRAM ACCOUNT
  // ============================================================

  const {
    data: account,
    error: accountError,
  } = await supabase
    .from("instagram_accounts")
    .select(
      `
        id,
        username,
        profile_picture_url,
        is_connected
      `
    )
    .eq("user_id", user.id)
    .eq("is_connected", true)
    .maybeSingle();

  if (accountError) {
    console.error(
      "CONTENT PAGE ACCOUNT ERROR:",
      accountError
    );
  }

  // ============================================================
  // POSTS
  // ============================================================

  const admin = createAdminClient();

  let posts: Array<{
    id: string;
    instagram_media_id: string;
    caption: string | null;
    media_type: string | null;
    media_url: string | null;
    permalink: string | null;
    published_at: string | null;
    likes_count: number | null;
    comments_count: number | null;
  }> = [];

  if (account) {
    const {
      data: postData,
      error: postsError,
    } = await admin
      .from("instagram_posts")
      .select(
        `
          id,
          instagram_media_id,
          caption,
          media_type,
          media_url,
          permalink,
          published_at,
          likes_count,
          comments_count
        `
      )
      .eq(
        "instagram_account_id",
        account.id
      )
      .order(
        "published_at",
        {
          ascending: false,
          nullsFirst: false,
        }
      );

    if (postsError) {
      console.error(
        "CONTENT PAGE POSTS ERROR:",
        postsError
      );
    } else {
      posts = postData ?? [];
    }
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div
        className="
          flex
          items-center
          justify-between
        "
      >
        <div>
          <p className="text-sm text-gray-500">
            Instagram content
          </p>

          <h1
            className="
              mt-1
              text-3xl
              font-bold
            "
          >
            Content
          </h1>

          {account?.username && (
            <p
              className="
                mt-2
                text-sm
                text-gray-500
              "
            >
              Showing posts from{" "}
              <span className="text-white">
                @{account.username}
              </span>
            </p>
          )}
        </div>

        {account?.is_connected && (
          <SyncInstagramButton />
        )}
      </div>

      {/* ======================================================
          NO ACTIVE ACCOUNT
      ====================================================== */}

      {!account && (
        <div
          className="
            mt-8
            rounded-2xl
            border
            border-white/10
            bg-white/[0.03]
            p-6 sm:p-10
            text-center
            text-gray-400
          "
        >
          No active Instagram account connected.
        </div>
      )}

      {/* ======================================================
          POSTS
      ====================================================== */}

      {account && posts.length === 0 && (
        <div
          className="
            mt-8
            rounded-2xl
            border
            border-white/10
            bg-white/[0.03]
            p-6 sm:p-10
            text-center
            text-gray-400
          "
        >
          No posts synced yet.

          <br />

          Click Sync Instagram.
        </div>
      )}

      {/* ======================================================
          POSTS GRID
          
          PostsGrid also performs a client-side newest-first
          sort using published_at.
      ====================================================== */}

      {posts.length > 0 && (
        <PostsGrid
          posts={posts}
        />
      )}
    </div>
  );
}