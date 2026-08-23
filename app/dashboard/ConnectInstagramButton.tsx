"use client";

import { useState } from "react";

export default function ConnectInstagramButton({
  label = "Connect Instagram",
}: {
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  function connect() {
    if (loading) return;
    setLoading(true);
    window.location.href = "/api/instagram/oauth/start";
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={loading}
      className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Connecting..." : label}
    </button>
  );
}
