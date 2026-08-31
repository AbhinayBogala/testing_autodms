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

  const toggle = () => {
    setEnabled((current) => !current);
  };

  return (
    <div className="flex items-center gap-3">
      {/* ON / OFF indicator */}
      <span
        className={`text-xs font-semibold transition-colors ${
          enabled
            ? "text-emerald-400"
            : "text-gray-500"
        }`}
      >
        {enabled ? "ON" : "OFF"}
      </span>

      {/* Toggle */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Turn automation on or off"
        onClick={toggle}
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

      {/* 
        IMPORTANT:
        Always submit a value to the server.
        ON  -> "on"
        OFF -> "off"
      */}
      <input
        type="hidden"
        name="is_active"
        value={enabled ? "on" : "off"}
      />
    </div>
  );
}