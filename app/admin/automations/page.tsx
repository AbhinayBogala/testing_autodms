import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Automation = {
  id: string;
  user_id: string;
  instagram_account_id: string;
  instagram_post_id: string;
  trigger_keyword: string;
  dm_message: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export default async function AutomationsPage() {
  const supabase = await createClient();

  // =========================================================
  // AUTH
  // =========================================================

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error(
      "AUTH ERROR:",
      authError.message
    );

    return (
      <main className="min-h-screen bg-[#05070d] p-10 text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">
            Authentication Error
          </h1>

          <pre className="mt-5 overflow-x-auto rounded-xl bg-red-500/10 p-5 text-sm text-red-300">
            {authError.message}
          </pre>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold">
            Authentication required
          </h1>

          <Link
            href="/admin/login"
            className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500"
          >
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  // =========================================================
  // LOAD AUTOMATIONS
  // =========================================================

  const {
    data: automations,
    error: automationError,
  } = await supabase
    .from("instagram_automations")
    .select(
      `
      id,
      user_id,
      instagram_account_id,
      instagram_post_id,
      trigger_keyword,
      dm_message,
      is_active,
      created_at,
      updated_at
      `
    )
    .eq("user_id", user.id)
    .order("created_at", {
      ascending: false,
    });

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (automationError) {
    console.error(
      "AUTOMATION DATABASE ERROR:",
      automationError.message
    );

    console.error(
      "AUTOMATION DATABASE CODE:",
      automationError.code
    );

    return (
      <main className="min-h-screen bg-[#05070d] text-white">
        <header className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <Link
              href="/dashboard"
              className="text-sm text-white/40 transition hover:text-white"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-2 text-2xl font-bold">
              Automations
            </h1>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
            <h2 className="text-lg font-semibold text-red-300">
              Failed to load automations
            </h2>

            <p className="mt-4 text-sm text-white/50">
              Supabase returned:
            </p>

            <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-5 text-sm text-red-300">
              {automationError.message}
            </pre>

            <p className="mt-4 text-xs text-white/40">
              Code:{" "}
              {automationError.code ||
                "unknown"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const automationList =
    (automations ?? []) as Automation[];

  // =========================================================
  // STATS
  // =========================================================

  const activeCount =
    automationList.filter(
      (automation) =>
        automation.is_active
    ).length;

  const inactiveCount =
    automationList.length -
    activeCount;

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      {/* HEADER */}

      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-white/40 transition hover:text-white"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-2 text-2xl font-bold">
              Automations
            </h1>

            <p className="mt-1 text-sm text-white/40">
              Manage your Instagram comment-to-DM automations.
            </p>
          </div>

          <Link
            href="/admin/automations/new"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold transition hover:bg-blue-500"
          >
            + New Automation
          </Link>
        </div>
      </header>

      {/* CONTENT */}

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* STATS */}

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wider text-white/30">
              Total
            </p>

            <p className="mt-2 text-3xl font-bold">
              {automationList.length}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wider text-white/30">
              Active
            </p>

            <p className="mt-2 text-3xl font-bold text-green-400">
              {activeCount}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wider text-white/30">
              Inactive
            </p>

            <p className="mt-2 text-3xl font-bold text-yellow-400">
              {inactiveCount}
            </p>
          </div>
        </div>

        {/* EMPTY */}

        {automationList.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center">
            <div className="text-5xl">
              ⚡
            </div>

            <h2 className="mt-5 text-xl font-semibold">
              No automations yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/40">
              Create your first Instagram
              comment-to-DM automation.
            </p>

            <Link
              href="/admin/automations/new"
              className="mt-6 inline-flex rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold transition hover:bg-blue-500"
            >
              Create Automation
            </Link>
          </div>
        ) : (
          /* AUTOMATION CARDS */

          <div className="space-y-5">
            {automationList.map(
              (automation) => (
                <div
                  key={automation.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
                >
                  {/* TOP */}

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            automation.is_active
                              ? "bg-green-400"
                              : "bg-white/20"
                          }`}
                        />

                        <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                          {automation.is_active
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </div>

                      <h2 className="mt-3 text-xl font-semibold">
                        Comment → DM
                      </h2>

                      <p className="mt-1 text-sm text-white/30">
                        Post ID:{" "}
                        {
                          automation.instagram_post_id
                        }
                      </p>
                    </div>

                    <div
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        automation.is_active
                          ? "bg-green-400/10 text-green-400"
                          : "bg-white/5 text-white/40"
                      }`}
                    >
                      {automation.is_active
                        ? "Running"
                        : "Paused"}
                    </div>
                  </div>

                  {/* DETAILS */}

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-white/30">
                        Trigger keyword
                      </p>

                      <p className="mt-2 text-lg font-semibold text-blue-300">
                        {automation.trigger_keyword}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-wider text-white/30">
                        Status
                      </p>

                      <p
                        className={`mt-2 text-lg font-semibold ${
                          automation.is_active
                            ? "text-green-400"
                            : "text-white/40"
                        }`}
                      >
                        {automation.is_active
                          ? "Running"
                          : "Paused"}
                      </p>
                    </div>
                  </div>

                  {/* DM */}

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-wider text-white/30">
                      DM message
                    </p>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">
                      {automation.dm_message}
                    </p>
                  </div>

                  {/* FOOTER */}

                  <div className="mt-5 flex flex-col gap-2 text-xs text-white/30 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Created{" "}
                      {new Date(
                        automation.created_at
                      ).toLocaleString()}
                    </span>

                    <span>
                      ID: {automation.id}
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}