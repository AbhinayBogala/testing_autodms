"use client";

import { useState } from "react";

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

export default function AutomationCard({
  automation,
}: {
  automation: Automation;
}) {
  const [active, setActive] = useState(
    automation.is_active
  );

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");

  async function toggleAutomation() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/automations/${automation.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            is_active: !active,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to update automation"
        );
      }

      setActive(!active);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      {/* HEADER */}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                active
                  ? "bg-green-400"
                  : "bg-white/20"
              }`}
            />

            <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {active
                ? "Active"
                : "Inactive"}
            </span>
          </div>

          <h2 className="mt-3 text-xl font-semibold">
            Comment → DM
          </h2>

          <p className="mt-1 text-sm text-white/30">
            Post ID:{" "}
            {automation.instagram_post_id}
          </p>
        </div>

        {/* TOGGLE */}

        <button
          type="button"
          onClick={toggleAutomation}
          disabled={loading}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            active
              ? "bg-blue-600"
              : "bg-white/10"
          } ${
            loading
              ? "cursor-not-allowed opacity-50"
              : ""
          }`}
          aria-label={
            active
              ? "Deactivate automation"
              : "Activate automation"
          }
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
              active
                ? "left-6"
                : "left-1"
            }`}
          />
        </button>
      </div>

      {/* KEYWORD */}

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
              active
                ? "text-green-400"
                : "text-white/40"
            }`}
          >
            {active
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

      {/* META */}

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

      {/* ERROR */}

      {message && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {message}
        </div>
      )}
    </div>
  );
}