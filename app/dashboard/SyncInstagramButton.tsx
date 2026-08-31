"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncResult = {
  synced?: number;
  totalPostsFetched?: number;
  deletedPosts?: number;
  deactivatedAutomations?: number;
};

export default function SyncInstagramButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] =
    useState<SyncResult | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const router = useRouter();

  async function syncInstagram() {
    if (loading) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/instagram/sync",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      const rawResponse =
        await response.text();

      let data: any = {};

      try {
        data =
          rawResponse
            ? JSON.parse(rawResponse)
            : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const message =
          data?.error ||
          data?.details ||
          "Instagram sync failed.";

        setError(String(message));
        console.error(
          "Instagram sync failed:",
          data
        );

        return;
      }

      setResult({
        synced:
          Number(data?.synced ?? 0),

        totalPostsFetched:
          Number(
            data?.totalPostsFetched ?? 0
          ),

        deletedPosts:
          Number(
            data?.deletedPosts ?? 0
          ),

        deactivatedAutomations:
          Number(
            data?.deactivatedAutomations ?? 0
          ),
      });

      /*
       * Refresh the Server Component so My Content immediately
       * reflects newly added, updated, and deleted Instagram posts.
       */
      router.refresh();
    } catch (syncError) {
      console.error(
        "Instagram sync error:",
        syncError
      );

      setError(
        syncError instanceof Error
          ? syncError.message
          : "Instagram sync failed."
      );
    } finally {
      setLoading(false);
    }
  }

  const deleted =
    result?.deletedPosts ?? 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={syncInstagram}
        disabled={loading}
        className="
          rounded-xl
          border
          border-white/10
          bg-white/5
          px-5
          py-3
          text-sm
          font-semibold
          text-white
          transition
          hover:bg-white/10
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        {loading
          ? "Syncing..."
          : "Sync Instagram"}
      </button>

      {result && (
        <p className="text-right text-xs text-gray-500">
          {result.totalPostsFetched ?? 0} posts synced
          {deleted > 0
            ? ` • ${deleted} removed`
            : " • No deleted posts"}
        </p>
      )}

      {error && (
        <p className="max-w-xs text-right text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
