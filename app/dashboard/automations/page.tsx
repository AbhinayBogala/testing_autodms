import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import AutomationLiveUpdates from "./AutomationLiveUpdates";
import DeleteAutomationButton from "./DeleteAutomationButton";
import DuplicateAutomationButton from "./DuplicateAutomationButton";

export const dynamic = "force-dynamic";

type Automation = {
  id: string;
  instagram_post_id: string;
  trigger_type: string;
  dm_message: string;
  is_active: boolean;
  created_at: string;
  button_name?: string | null;
  button_url?: string | null;
  post?: {
    caption: string | null;
    media_url: string | null;
    media_type: string | null;
  } | null;
};

async function deleteAutomation(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("instagram_automations")
    .delete()
    .eq(
      "id",
      String(formData.get("automation_id"))
    )
    .eq("user_id", user.id);
}

export default async function AutomationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
        Authentication required
      </main>
    );
  }

  const { data: automationData } =
    await supabase
      .from("instagram_automations")
      .select(`
        id,
        instagram_post_id,
        trigger_type,
        dm_message,
        is_active,
        created_at,
        button_name,
        button_url
      `)
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false,
      });

  const automations = automationData ?? [];

  const ids = automations.map(
    (item) => item.instagram_post_id
  );

  const { data: postData } = ids.length
    ? await supabase
        .from("instagram_posts")
        .select(`
          id,
          caption,
          media_url,
          media_type
        `)
        .in("id", ids)
    : { data: [] };

  const posts = postData ?? [];

  const list: Automation[] =
    automations.map((item) => ({
      ...item,
      post:
        posts.find(
          (post) =>
            post.id ===
            item.instagram_post_id
        ) ?? null,
    }));

  const active = list.filter(
    (item) => item.is_active
  ).length;

  return (
    <main className="min-h-screen bg-[#050505] text-white">

      <AutomationLiveUpdates />

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="border-b border-white/[0.06] bg-[#070707]">

        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-7">

          <div>

            <Link
              href="/dashboard"
              className="
                inline-flex
                items-center
                gap-2
                text-xs
                font-medium
                text-gray-600
                transition-colors
                hover:text-white
              "
            >
              <span className="text-base">
                ←
              </span>

              Dashboard
            </Link>

            <div className="mt-4 flex items-center gap-2">

              <span className="h-1.5 w-1.5 rounded-full bg-[#ff1744]" />

              <p
                className="
                  text-[10px]
                  font-semibold
                  uppercase
                  tracking-[0.2em]
                  text-gray-600
                "
              >
                DevilX / Automation Engine
              </p>

            </div>

            <h1
              className="
                mt-3
                text-3xl
                font-bold
                tracking-[-0.04em]
              "
            >
              Automations
            </h1>

            <p
              className="
                mt-2
                text-sm
                text-gray-500
              "
            >
              Manage Instagram comment-to-DM automations.
            </p>

          </div>

          {/* NEW AUTOMATION */}

          <Link
            href="/dashboard/automations/new"
            className="
              inline-flex
              items-center
              gap-2
              rounded-xl
              bg-[#ff1744]
              px-5
              py-3
              text-sm
              font-semibold
              text-white
              shadow-lg
              shadow-[#ff1744]/10
              transition-colors
              hover:bg-[#e9143d]
            "
          >
            <span className="text-lg leading-none">
              +
            </span>

            New Automation
          </Link>

        </div>

      </header>

      {/* =====================================================
          CONTENT
      ===================================================== */}

      <div className="mx-auto max-w-7xl px-8 py-9">

        {/* ===================================================
            STATS
        =================================================== */}

        <div
          className="
            grid
            gap-4
            sm:grid-cols-3
          "
        >

          <Stat
            title="Total Automations"
            value={String(list.length)}
            accent="default"
          />

          <Stat
            title="Active"
            value={String(active)}
            accent="green"
          />

          <Stat
            title="Inactive"
            value={String(list.length - active)}
            accent="muted"
          />

        </div>

        {/* ===================================================
            AUTOMATION LIST
        =================================================== */}

        <div className="mt-8">

          <div
            className="
              mb-4
              flex
              items-center
              justify-between
            "
          >

            <div>

              <div className="flex items-center gap-2">

                <span
                  className="
                    h-1
                    w-1
                    rounded-full
                    bg-[#ff1744]
                  "
                />

                <h2
                  className="
                    text-lg
                    font-semibold
                  "
                >
                  Your Automations
                </h2>

              </div>

              <p
                className="
                  mt-1
                  text-xs
                  text-gray-600
                "
              >
                Comment triggers and automatic DM responses.
              </p>

            </div>

            <span
              className="
                rounded-full
                border
                border-white/[0.06]
                bg-white/[0.025]
                px-3
                py-1.5
                text-[10px]
                font-medium
                text-gray-500
              "
            >
              {list.length} total
            </span>

          </div>

          <div className="space-y-3">

            {list.length === 0 ? (

              /* EMPTY STATE */

              <div
                className="
                  rounded-[24px]
                  border
                  border-white/[0.07]
                  bg-[#0b0b0b]
                  px-6
                  py-16
                  text-center
                "
              >

                <div
                  className="
                    mx-auto
                    flex
                    h-14
                    w-14
                    items-center
                    justify-center
                    rounded-2xl
                    border
                    border-[#ff1744]/10
                    bg-[#ff1744]/[0.05]
                    text-xl
                    text-[#ff1744]
                  "
                >
                  ⚡
                </div>

                <h3
                  className="
                    mt-5
                    text-lg
                    font-semibold
                  "
                >
                  No automations yet
                </h3>

                <p
                  className="
                    mx-auto
                    mt-2
                    max-w-sm
                    text-sm
                    leading-6
                    text-gray-600
                  "
                >
                  Create your first comment-to-DM automation
                  to start automatically responding to Instagram
                  comments.
                </p>

                <Link
                  href="/dashboard/automations/new"
                  className="
                    mt-7
                    inline-flex
                    items-center
                    gap-2
                    rounded-xl
                    bg-[#ff1744]
                    px-5
                    py-3
                    text-sm
                    font-semibold
                    text-white
                    transition-colors
                    hover:bg-[#e9143d]
                  "
                >
                  <span className="text-lg">
                    +
                  </span>

                  Create Automation
                </Link>

              </div>

            ) : (

              list.map((automation) => (

                <div
                  key={automation.id}
                  className="
                    group
                    rounded-[22px]
                    border
                    border-white/[0.07]
                    bg-[#0b0b0b]
                    p-5
                    transition-colors
                    duration-200
                    hover:border-white/[0.12]
                    hover:bg-[#0d0d0d]
                  "
                >

                  <div
                    className="
                      flex
                      flex-col
                      gap-5
                      xl:flex-row
                      xl:items-center
                    "
                  >

                    {/* =======================================
                        POST PREVIEW
                    ======================================= */}

                    <div
                      className="
                        h-24
                        w-24
                        shrink-0
                        overflow-hidden
                        rounded-xl
                        border
                        border-white/[0.06]
                        bg-black
                      "
                    >

                      {automation.post?.media_url ? (

                        automation.post.media_type ===
                        "VIDEO" ? (

                          <video
                            src={
                              automation.post.media_url
                            }
                            className="
                              h-full
                              w-full
                              object-cover
                            "
                            muted
                            playsInline
                          />

                        ) : (

                          <img
                            src={
                              automation.post.media_url
                            }
                            className="
                              h-full
                              w-full
                              object-cover
                            "
                            alt="Instagram post"
                          />

                        )

                      ) : (

                        <div
                          className="
                            flex
                            h-full
                            items-center
                            justify-center
                            text-gray-600
                          "
                        >
                          🎬
                        </div>

                      )}

                    </div>

                    {/* =======================================
                        AUTOMATION INFO
                    ======================================= */}

                    <div className="min-w-0 flex-1">

                      <div
                        className="
                          flex
                          flex-wrap
                          items-center
                          gap-3
                        "
                      >

                        <div className="flex items-center gap-2">

                          <span
                            className="
                              flex
                              h-7
                              w-7
                              items-center
                              justify-center
                              rounded-lg
                              bg-[#ff1744]/[0.06]
                              text-xs
                              text-[#ff1744]
                            "
                          >
                            ⚡
                          </span>

                          <h2
                            className="
                              font-semibold
                              text-white
                            "
                          >
                            Comment → DM
                          </h2>

                        </div>

                        <span
                          className={
                            automation.is_active
                              ? `
                                rounded-full
                                border
                                border-emerald-500/10
                                bg-emerald-500/[0.06]
                                px-3
                                py-1
                                text-[10px]
                                font-semibold
                                uppercase
                                tracking-wider
                                text-emerald-400
                              `
                              : `
                                rounded-full
                                border
                                border-white/[0.06]
                                bg-white/[0.03]
                                px-3
                                py-1
                                text-[10px]
                                font-semibold
                                uppercase
                                tracking-wider
                                text-gray-600
                              `
                          }
                        >
                          <span className="mr-1.5">
                            ●
                          </span>

                          {automation.is_active
                            ? "ON"
                            : "OFF"}
                        </span>

                      </div>

                      {/* Caption */}

                      <p
                        className="
                          mt-3
                          line-clamp-2
                          text-sm
                          leading-5
                          text-gray-500
                        "
                      >
                        {automation.post?.caption ||
                          "No reel description"}
                      </p>

                      {/* DM */}

                      <div
                        className="
                          mt-3
                          rounded-xl
                          border
                          border-white/[0.05]
                          bg-white/[0.02]
                          px-3
                          py-2.5
                        "
                      >

                        <p
                          className="
                            text-[9px]
                            font-semibold
                            uppercase
                            tracking-[0.15em]
                            text-gray-700
                          "
                        >
                          Automatic DM
                        </p>

                        <p
                          className="
                            mt-1
                            line-clamp-2
                            text-xs
                            leading-5
                            text-gray-400
                          "
                        >
                          {automation.dm_message}
                        </p>

                      </div>

                      {/* Button */}

                      {automation.button_name &&
                        automation.button_url && (

                          <div
                            className="
                              mt-3
                              inline-flex
                              items-center
                              gap-2
                              rounded-lg
                              border
                              border-[#ff1744]/10
                              bg-[#ff1744]/[0.04]
                              px-3
                              py-1.5
                              text-[10px]
                              font-medium
                              text-[#ff6b86]
                            "
                          >

                            <span>
                              ↗
                            </span>

                            Button:{" "}
                            {automation.button_name}

                          </div>

                        )}

                    </div>

                    {/* =======================================
                        ACTIONS
                    ======================================= */}

                    <div
                      className="
                        flex
                        shrink-0
                        items-center
                        gap-2
                        xl:flex-col
                      "
                    >

                      {/* Edit */}

                      <Link
                        href={`/dashboard/automations/${automation.id}/edit`}
                        className="
                          rounded-xl
                          border
                          border-white/[0.08]
                          bg-white/[0.02]
                          px-4
                          py-2.5
                          text-xs
                          font-medium
                          text-gray-400
                          transition-colors
                          hover:border-white/[0.15]
                          hover:bg-white/[0.05]
                          hover:text-white
                        "
                      >
                        Edit
                      </Link>

                      {/* Duplicate */}

                      <DuplicateAutomationButton
                        automationId={automation.id}
                      />

                      {/* Delete */}

                      <form action={deleteAutomation}>
                        <input
                          type="hidden"
                          name="automation_id"
                          value={automation.id}
                        />

                        <DeleteAutomationButton />
                      </form>

                    </div>

                  </div>

                </div>

              ))

            )}

          </div>

        </div>

      </div>

    </main>
  );
}

/* ============================================================
   STAT
============================================================ */

function Stat({
  title,
  value,
  accent = "default",
}: {
  title: string;
  value: string;
  accent?: "default" | "green" | "muted";
}) {
  const valueClass =
    accent === "green"
      ? "text-emerald-400"
      : accent === "muted"
        ? "text-gray-400"
        : "text-white";

  return (
    <div
      className="
        rounded-[22px]
        border
        border-white/[0.07]
        bg-[#0b0b0b]
        p-6
      "
    >

      <div
        className="
          flex
          items-center
          justify-between
        "
      >

        <p
          className="
            text-[10px]
            font-semibold
            uppercase
            tracking-[0.16em]
            text-gray-600
          "
        >
          {title}
        </p>

        <span
          className={
            accent === "green"
              ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
              : "h-1.5 w-1.5 rounded-full bg-[#ff1744]"
          }
        />

      </div>

      <p
        className={`
          mt-5
          text-3xl
          font-bold
          tracking-[-0.04em]
          ${valueClass}
        `}
      >
        {value}
      </p>

      <div
        className="
          mt-5
          h-px
          bg-white/[0.05]
        "
      />

      <p
        className="
          mt-3
          text-[9px]
          uppercase
          tracking-[0.14em]
          text-gray-700
        "
      >
        DevilX Automation Engine
      </p>

    </div>
  );
}