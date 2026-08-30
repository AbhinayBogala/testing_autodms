"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncInstagramButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function syncInstagram() {
    if (loading) return;

    setLoading(true);

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

      /*
       * Read the response as text first.
       *
       * This prevents an empty/invalid response from
       * being converted into {} and hiding the real error.
       */
      const rawResponse =
        await response.text();

      console.log(
        "========================================"
      );

      console.log(
        "INSTAGRAM SYNC RESPONSE"
      );

      console.log(
        "STATUS:",
        response.status
      );

      console.log(
        "OK:",
        response.ok
      );

      console.log(
        "RAW RESPONSE:",
        rawResponse
      );

      console.log(
        "========================================"
      );

      if (!response.ok) {
        let errorData: unknown =
          rawResponse;

        try {
          errorData =
            JSON.parse(rawResponse);
        } catch {
          // Response was not JSON.
          // Keep the raw response.
        }

        console.error(
          "Instagram sync failed:",
          errorData
        );

        return;
      }

      let data: unknown = {};

      try {
        data =
          JSON.parse(rawResponse);
      } catch {
        console.error(
          "Instagram sync returned invalid JSON:",
          rawResponse
        );

        return;
      }

      console.log(
        "Instagram sync completed:",
        data
      );

      router.refresh();
    } catch (error) {
      console.error(
        "Instagram sync error:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}