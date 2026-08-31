"use client";

import { useState } from "react";

type TriggerTypeSelectorProps = {
  initialTriggerType: string;
  initialKeywords: string[];
};

export default function TriggerTypeSelector({
  initialTriggerType,
  initialKeywords,
}: TriggerTypeSelectorProps) {
  const [triggerType, setTriggerType] = useState(
    initialTriggerType === "any_comment"
      ? "any_comment"
      : "keywords"
  );

  const [keywords, setKeywords] = useState(
    initialKeywords.join(", ")
  );

  return (
    <div className="mt-5">
      {/* =========================================
          SPECIFIC KEYWORDS
      ========================================= */}
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
          triggerType === "keywords"
            ? "border-white/[0.12] bg-white/[0.04]"
            : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]"
        }`}
      >
        <input
          type="radio"
          name="trigger_type"
          value="keywords"
          checked={triggerType === "keywords"}
          onChange={() => setTriggerType("keywords")}
          className="mt-1 h-5 w-5 shrink-0 accent-[#ff1744]"
        />

        <div>
          <p className="font-medium text-white">
            Specific keywords
          </p>

          <p className="mt-1 text-xs leading-5 text-gray-500">
            Send the DM when a comment contains any
            of your keywords.
          </p>
        </div>
      </label>

      {/* =========================================
          ANY COMMENT
      ========================================= */}
      <label
        className={`mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
          triggerType === "any_comment"
            ? "border-white/[0.12] bg-white/[0.04]"
            : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]"
        }`}
      >
        <input
          type="radio"
          name="trigger_type"
          value="any_comment"
          checked={triggerType === "any_comment"}
          onChange={() => setTriggerType("any_comment")}
          className="mt-1 h-5 w-5 shrink-0 accent-[#ff1744]"
        />

        <div>
          <p className="font-medium text-white">
            Any comment
          </p>

          <p className="mt-1 text-xs leading-5 text-gray-500">
            Send the DM for every comment on this post.
          </p>
        </div>
      </label>

      {/* =========================================
          KEYWORDS
          ONLY VISIBLE WHEN SPECIFIC KEYWORDS
          IS SELECTED
      ========================================= */}
      {triggerType === "keywords" && (
        <div className="mt-6">
          <label
            htmlFor="trigger_keywords"
            className="mb-2 block text-sm font-medium"
          >
            Keywords
          </label>

          <textarea
            id="trigger_keywords"
            name="trigger_keywords"
            rows={4}
            maxLength={1000}
            value={keywords}
            onChange={(event) =>
              setKeywords(event.target.value)
            }
            placeholder="link, price, details"
            className="w-full resize-y rounded-xl border border-white/[0.07] bg-[#0b0b0b] px-4 py-3 text-sm leading-6 outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
          />

          <p className="mt-2 text-xs text-gray-600">
            Separate keywords with commas or put each
            keyword on a new line.
          </p>
        </div>
      )}
    </div>
  );
}