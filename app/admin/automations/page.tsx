import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AutomationCard from "./AutomationCard";

export const dynamic = "force-dynamic";

type Automation = {
  id: string;
  instagram_post_id: string;
  trigger_keyword: string;
  dm_message: string;
  is_active: boolean;
  created_at: string;
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
    console.error("AUTH ERROR");
    console.error("message:", authError.message);
    console.error("code:", authError.code);
    console.error("details:", authError.details);
    console.error("hint:", authError.hint);

    return (
      <main className="min-h-screen bg-[#05070d] p-10 text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">
            Authentication Error
          </h1>

          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
            <p className="text-sm text-red-300">
              {authError.message || "Unknown authentication error"}
            </p>

            <div className="mt-4 space-y-2 font-mono text-xs text-white/50">
              <p>
                Code: {authError.code || "none"}
              </p>

              <p>
                Details: {authError.details || "none"}
              </p>

              <p>
                Hint: {authError.hint || "none"}
              </p>
            </div>
          </div>
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

          <p className="mt-2 text-sm text-white/40">
            You need to be logged in to view automations.
          </p>

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
      "id, instagram_post_id, trigger_keyword, dm_message, is_active, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", {
      ascending: false,
    });

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (automationError) {
    console.error("========================================");
    console.error("AUTOMATION DATABASE ERROR");
    console.error("========================================");

    console.error(
      "Full error:",
      JSON.stringify(
        automationError,
        Object.getOwnPropertyNames(automationError),
        2
      )
    );

    console.error(
      "Message:",
      automationError.message
    );

    console.error(
      "Code:",
      automationError.code
    );

    console.error(
      "Details:",
      automationError.details
    );

    console.error(
      "Hint:",
      automationError.hint
    );

    console.error(
      "User ID:",
      user.id
    );

    console.error("========================================");

    return (
      <main className="min-h-screen bg-[#05070d] text-white">
        <header className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <Link
              href="/admin/dashboard"
              className="text-sm text-white/40 transition hover:text-white"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-3 text-2xl font-bold">
              Automations
            </h1>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-300">
                !
              </div>

              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-red-300">
                  Failed to load automations
                </h2>

                <p className="mt-2 text-sm text-white/50">
                  Supabase returned an error while querying the
                  <span className="mx-1 font-mono text-white/80">
                    instagram_automations
                  </span>
                  table.
                </p>
              </div>
            </div>

            {/* Error message */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                Message
              </p>

              <p className="mt-2 break-words font-mono text-sm text-red-300">
                {automationError.message ||
                  "No error message returned"}
              </p>
            </div>

            {/* Error code */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                  Error Code
                </p>

                <p className="mt-2 font-mono text-sm text-yellow-300">
                  {automationError.code || "None"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                  User ID
                </p>

                <p className="mt-2 break-all font-mono text-xs text-white/60">
                  {user.id}
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                Details
              </p>

              <p className="mt-2 break-words font-mono text-sm text-white/70">
                {automationError.details || "None"}
              </p>
            </div>

            {/* Hint */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                Hint
              </p>

              <p className="mt-2 break-words font-mono text-sm text-white/70">
                {automationError.hint || "None"}
              </p>
            </div>

            {/* Query information */}
            <div className="mt-6 rounded-2xl border border-blue-500/10 bg-blue-500/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-300/60">
                Query being executed
              </p>

              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-blue-200/70">
{`FROM: instagram_automations

SELECT:
  id
  instagram_post_id
  trigger_keyword
  dm_message
  is_active
  created_at

FILTER:
  user_id = ${user.id}

ORDER:
  created_at DESC`}
              </pre>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href="/admin/dashboard"
              className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/60 transition hover:bg-white/[0.08] hover:text-white"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================
  // CONVERT DATA
  // =========================================================

  const automationList =
    (automations ?? []) as Automation[];

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <Link
              href="/admin/dashboard"
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

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Stats */}
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
                  (automation) => automation.is_active
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
                  (automation) => !automation.is_active
                ).length
              }
            </p>
          </div>
        </div>

        {/* Empty state */}
        {automationList.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center">
            <div className="text-5xl">
              ⚡
            </div>

            <h2 className="mt-5 text-xl font-semibold">
              No automations yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/40">
              Create your first Instagram comment-to-DM
              automation.
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
            {automationList.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}