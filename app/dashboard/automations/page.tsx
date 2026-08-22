import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import AutomationLiveUpdates from "./AutomationLiveUpdates";

import DeleteAutomationButton from "./DeleteAutomationButton";

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
    .eq("id", String(formData.get("automation_id")))
    .eq("user_id", user.id);
}

export default async function AutomationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-[#05070d] text-white flex items-center justify-center">
        Authentication required
      </main>
    );
  }

  const { data: automationData } = await supabase
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
    .order("created_at", { ascending: false });

  const automations = automationData ?? [];

  const ids = automations.map((item) => item.instagram_post_id);

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

  const list: Automation[] = automations.map((item) => ({
    ...item,
    post:
      posts.find(
        (post) => post.id === item.instagram_post_id
      ) ?? null,
  }));

  const active = list.filter((item) => item.is_active).length;

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <AutomationLiveUpdates />

      <header className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-6 flex justify-between items-center">

          <div>
            <Link
              href="/dashboard"
              className="text-sm text-white/40 hover:text-white"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-2 text-3xl font-bold">
              Automations
            </h1>

            <p className="mt-1 text-white/40">
              Manage Instagram comment-to-DM automations.
            </p>
          </div>

          <Link
            href="/dashboard/automations/new"
            className="
              group relative overflow-hidden
              rounded-2xl
              bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600
              px-6 py-3.5
              text-sm font-semibold
              shadow-lg shadow-blue-500/20
              transition-all duration-300
              hover:scale-105
            "
          >
            <span className="relative flex items-center gap-2">
              <span className="text-xl">+</span>
              New Automation
            </span>
          </Link>

        </div>
      </header>


      <div className="mx-auto max-w-6xl px-6 py-10">

        <div className="mb-8 grid grid-cols-3 gap-4">

          <Stat title="Total" value={String(list.length)} />

          <Stat title="Active" value={String(active)} />

          <Stat
            title="Inactive"
            value={String(list.length - active)}
          />

        </div>


        <div className="space-y-4">

          {list.map((automation) => (

            <div
              key={automation.id}
              className="
                flex items-center gap-5
                rounded-2xl border border-white/10
                bg-white/[0.03] p-5
              "
            >

              <div className="h-24 w-24 overflow-hidden rounded-xl bg-black">

                {automation.post?.media_url ? (

                  automation.post.media_type === "VIDEO" ? (

                    <video
                      src={automation.post.media_url}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                    />

                  ) : (

                    <img
                      src={automation.post.media_url}
                      className="h-full w-full object-cover"
                      alt="Instagram post"
                    />

                  )

                ) : (

                  <div className="flex h-full items-center justify-center">
                    🎬
                  </div>

                )}

              </div>


              <div className="flex-1">

                <div className="flex items-center gap-3">

                  <h2 className="font-semibold">
                    Comment → DM
                  </h2>

                  <span className={
                    automation.is_active
                      ? "rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-400"
                      : "rounded-full bg-white/10 px-3 py-1 text-xs text-white/40"
                  }>
                    {automation.is_active ? "ON" : "OFF"}
                  </span>

                </div>


                <p className="mt-2 line-clamp-2 text-sm text-white/50">
                  {automation.post?.caption || "No reel description"}
                </p>


                <p className="mt-2 text-xs text-white/30">
                  {automation.dm_message}
                </p>


                {automation.button_name && automation.button_url && (
                  <div className="mt-3 inline-flex rounded-lg bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
                    Button: {automation.button_name}
                  </div>
                )}

              </div>


              <Link
                href={`/dashboard/automations/${automation.id}/edit`}
                className="
                  rounded-xl border border-white/10
                  px-4 py-2 text-sm
                  hover:bg-white/10
                "
              >
                Edit
              </Link>


              <form action={deleteAutomation}>

                <input
                  type="hidden"
                  name="automation_id"
                  value={automation.id}
                />

                <DeleteAutomationButton />

              </form>

            </div>

          ))}

        </div>

      </div>

    </main>
  );
}


function Stat({
  title,
  value,
}: {
  title: string;
  value: string;
}) {

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">

      <p className="text-xs text-white/40">
        {title}
      </p>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>

    </div>
  );
}