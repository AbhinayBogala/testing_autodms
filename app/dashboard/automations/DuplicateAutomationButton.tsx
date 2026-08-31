"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DuplicateAutomationButtonProps = {
  automationId: string;
};

export default function DuplicateAutomationButton({
  automationId,
}: DuplicateAutomationButtonProps) {
  const [isDuplicating, setIsDuplicating] = useState(false);

  const router = useRouter();

  const handleDuplicate = async () => {
    if (isDuplicating) {
      return;
    }

    try {
      setIsDuplicating(true);

      const response = await fetch(
        `/api/automations/${automationId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Failed to duplicate automation."
        );
      }

      const newAutomationId =
        result?.data?.id;

      if (!newAutomationId) {
        throw new Error(
          "Automation was duplicated, but the new automation ID was not returned."
        );
      }

      router.push(
        `/dashboard/automations/${newAutomationId}/edit`
      );

      router.refresh();
    } catch (error) {
      console.error(
        "DUPLICATE AUTOMATION ERROR:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Failed to duplicate automation."
      );

      setIsDuplicating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDuplicate}
      disabled={isDuplicating}
      className="
        rounded-xl
        border
        border-white/[0.08]
        bg-white/[0.02]
        px-4
        py-2.5
        text-xs
        font-medium
        text-gray-400
        transition-colors
        hover:border-white/[0.15]
        hover:bg-white/[0.05]
        hover:text-white
        disabled:cursor-not-allowed
        disabled:opacity-50
      "
    >
      {isDuplicating
        ? "Duplicating..."
        : "Duplicate"}
    </button>
  );
}