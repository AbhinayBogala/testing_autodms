"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DisconnectInstagramButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function disconnect() {
    if (!confirm("Disconnect Instagram account?")) return;

    setLoading(true);

    await fetch("/api/instagram/disconnect", {
      method: "POST",
    });

    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={disconnect}
      disabled={loading}
      className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/20 disabled:opacity-50"
    >
      {loading ? "Disconnecting..." : "Disconnect"}
    </button>
  );
}