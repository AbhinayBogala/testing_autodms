"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8">
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 sm:p-8">
        <h1 className="text-xl font-semibold text-red-300">
          Automations could not be loaded
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
