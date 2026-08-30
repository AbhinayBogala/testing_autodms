"use client";

export default function DeleteAutomationButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        const confirmed = window.confirm(
          "Delete this automation?"
        );

        if (!confirmed) {
          e.preventDefault();
        }
      }}
      className="
        rounded-xl
        border
        border-red-500/30
        px-4
        py-2
        text-sm
        text-red-400
        hover:bg-red-500/10
      "
    >
      Delete
    </button>
  );
}