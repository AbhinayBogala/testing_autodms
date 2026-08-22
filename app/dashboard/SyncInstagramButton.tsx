"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncInstagramButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reconnectRequired, setReconnectRequired] = useState(false);

  async function syncInstagram() {
    if (loading) return;
    setLoading(true); setMessage(""); setError(false); setReconnectRequired(false);
    try {
      const response = await fetch("/api/instagram/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(true);
        setReconnectRequired(isRecord(data) && data.reconnectRequired === true);
        setMessage(extractErrorMessage(data));
        return;
      }
      const d = isRecord(data) ? data : {};
      const synced = typeof d.synced === "number" ? d.synced : 0;
      const comments = typeof d.comments === "number" ? d.comments : 0;
      const replies = typeof d.replies === "number" ? d.replies : 0;
      setMessage(`Synced ${synced} posts · ${comments} comments · ${replies} replies`);
      router.refresh();
    } catch (error) {
      setError(true);
      setMessage(error instanceof Error ? error.message : "Instagram sync failed.");
    } finally { setLoading(false); }
  }

  function reconnect() { window.location.href = "/api/instagram/oauth/start"; }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={syncInstagram} disabled={loading} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50">
        {loading ? "Syncing..." : "Sync Instagram"}
      </button>
      {message && <span className={error ? "max-w-xl text-sm text-red-400" : "max-w-xl text-sm text-gray-400"}>{message}</span>}
      {reconnectRequired && <button type="button" onClick={reconnect} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black">Reconnect Instagram</button>}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function extractErrorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "Instagram sync failed.";
  if (typeof value.error === "string") return value.error;
  if (typeof value.message === "string") return value.message;
  if (value.details) return extractErrorMessage(value.details);
  return "Instagram sync failed.";
}
