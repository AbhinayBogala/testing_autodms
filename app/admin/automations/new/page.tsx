import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import AutomationCard from "./AutomationCard";

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
  // AUTHENTICATION
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

  // =========================================================
  // USER NOT LOGGED IN
  // =========================================================

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
      "========================================"
    );

    console.error(
      "AUTOMATION DATABASE ERROR"
    );

    console.error(
      "========================================"
    );

    console.error(
      "Message:",
      automationError.message
    );

    console.error(
      "Code:",
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

            <p className="mt-1 text-sm text-white/40">
              Manage your Instagram comment-to-DM automations.
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
            <h2 className="text-lg font-semibold text-red-300">
              Failed to load automations
            </h2>

            <p className="mt-4 text-sm text-white/50">
              Supabase returned the following error:
            </p>

            <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-5 text-sm text-red-300">
              {automationError.message}
            </pre>

            <div className="mt-4 text-xs text-white/40">
              <p>
                Code:{" "}
                <span className="text-white/70">
                  {automationError.code ||
                    "unknown"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================
  // AUTOMATION LIST
  // =========================================================

  const automationList =
    (automations ?? []) as Automation[];

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
              {
                automationList.filter(
                  (automation) =>
                    automation.is_active
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wider text-white/30">
              Inactive
            </p>

            <p className="mt-2 text-3xl font-bold text-yellow-400">
              {
                automationList.filter(
                  (automation) =>
                    !automation.is_active
                ).length
              }
            </p>
          </div>
        </div>

        {/* EMPTY STATE */}

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
          <div className="space-y-5">
            {automationList.map(
              (automation) => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                />
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}