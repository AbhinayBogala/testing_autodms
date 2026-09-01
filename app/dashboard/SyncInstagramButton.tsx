"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SyncResult = {
  success?: boolean;
  synced?: number;
  deletedPosts?: number;
  totalPostsFetched?: number;
  error?: string;
};

export default function SyncInstagramButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const router = useRouter();

  // ---------------------------------------------------------
  // Hide result after 3 seconds
  // ---------------------------------------------------------

  useEffect(() => {
    if (!result) return;

    const timer = window.setTimeout(() => {
      setResult(null);
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [result]);

  // ---------------------------------------------------------
  // Sync Instagram
  // ---------------------------------------------------------

  async function syncInstagram() {
    if (loading) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/instagram/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      const rawResponse = await response.text();

      console.log("========================================");
      console.log("INSTAGRAM SYNC RESPONSE");
      console.log("STATUS:", response.status);
      console.log("OK:", response.ok);
      console.log("RAW RESPONSE:", rawResponse);
      console.log("========================================");

      let data: SyncResult = {};

      try {
        data = JSON.parse(rawResponse);
      } catch {
        console.error(
          "Instagram sync returned invalid JSON:",
          rawResponse
        );

        setResult({
          success: false,
          error: "Sync returned an invalid response.",
        });

        return;
      }

      // -------------------------------------------------------
      // Error
      // -------------------------------------------------------

      if (!response.ok || data.success === false) {
        console.error("Instagram sync failed:", data);

        setResult({
          success: false,
          error:
            data.error ||
            "Instagram sync failed. Please try again.",
        });

        return;
      }

      // -------------------------------------------------------
      // Success
      // -------------------------------------------------------

      console.log("Instagram sync completed:", data);

      setResult({
        success: true,
        synced: data.synced ?? 0,
        deletedPosts: data.deletedPosts ?? 0,
        totalPostsFetched: data.totalPostsFetched ?? 0,
      });

      router.refresh();
    } catch (error) {
      console.error("Instagram sync error:", error);

      setResult({
        success: false,
        error: "Something went wrong while syncing.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    /*
     * IMPORTANT:
     * relative = popup is positioned relative to this button area
     * The popup uses absolute positioning, so it does NOT
     * change the layout or move the other buttons.
     */
    <div className="relative inline-flex">
      {/* ---------------------------------------------------
          SYNC BUTTON
          This stays completely fixed.
      --------------------------------------------------- */}

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
          transition-all
          duration-200
          hover:border-white/15
          hover:bg-white/10
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        {loading ? "Syncing..." : "Sync Instagram"}
      </button>

      {/* ---------------------------------------------------
          RESULT POPUP

          absolute = DOES NOT affect layout
          top-full = directly below button
          mt-2 = small gap
      --------------------------------------------------- */}

      {result && (
        <div
          className={`
            absolute
            left-0
            top-full
            z-50
            mt-2
            w-[260px]
            overflow-hidden
            rounded-xl
            border
            shadow-xl
            backdrop-blur-xl
            animate-in
            fade-in
            slide-in-from-top-1
            duration-200
            ${
              result.success
                ? "border-emerald-400/15 bg-[#07130f]/95"
                : "border-red-400/15 bg-[#160909]/95"
            }
          `}
        >
          {result.success ? (
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              {/* Success icon */}

              <div
                className="
                  flex
                  h-7
                  w-7
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  bg-emerald-400/10
                "
              >
                <svg
                  className="h-3.5 w-3.5 text-emerald-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.884a1 1 0 01.012 1.414l-7.2 7.3a1 1 0 01-1.416.012l-3.5-3.4a1 1 0 011.4-1.428l2.79 2.72 6.5-6.59a1 1 0 011.414-.028z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              {/* Text */}

              <div className="min-w-0">
                <div className="text-[11px] font-medium text-emerald-300/90">
                  Sync complete
                </div>

                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/50">
                  <span>
                    <span className="font-medium text-white/80">
                      {result.synced ?? 0}
                    </span>{" "}
                    synced
                  </span>

                  <span className="text-white/15">
                    •
                  </span>

                  <span>
                    <span className="font-medium text-white/80">
                      {result.deletedPosts ?? 0}
                    </span>{" "}
                    deleted
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              {/* Error icon */}

              <div
                className="
                  flex
                  h-7
                  w-7
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  bg-red-400/10
                "
              >
                <svg
                  className="h-3.5 w-3.5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 00-1.5 0v4a.75.75 0 001.5 0v-4zM10 14a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              <div className="min-w-0 text-[11px] text-red-300/80">
                {result.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}