"use client";

import { useState } from "react";

type AutomationStatusToggleProps = {
  defaultChecked?: boolean;
};

export default function AutomationStatusToggle({
  defaultChecked = true,
}: AutomationStatusToggleProps) {
  const [enabled, setEnabled] =
    useState(defaultChecked);

  return (
    <div className="flex items-center gap-3">

      <span
        className={`text-xs font-medium transition-colors ${
          enabled
            ? "text-emerald-400"
            : "text-gray-500"
        }`}
      >
        {enabled ? "ON" : "OFF"}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() =>
          setEnabled(
            (current) =>
              !current,
          )
        }
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/10 ${
          enabled
            ? "bg-emerald-500"
            : "bg-white/10"
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled
              ? "translate-x-5"
              : "translate-x-0"
          }`}
        />
      </button>

      {/* IMPORTANT:
          This hidden checkbox is what the
          server action receives. */}

      <input
        type="checkbox"
        name="is_active"
        checked={enabled}
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />

    </div>
  );
}