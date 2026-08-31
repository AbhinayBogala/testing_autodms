"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type AutomationToggleProps = {
  automationId: string;
  initialActive: boolean;
};

export default function AutomationToggle({
  automationId,
  initialActive,
}: AutomationToggleProps) {
  const router = useRouter();

  const [isActive, setIsActive] =
    useState(initialActive);

  const [isSaving, setIsSaving] =
    useState(false);

  /*
   * Keep the local toggle synchronized with
   * the latest Server Component value.
   */
  useEffect(() => {
    setIsActive(initialActive);
  }, [initialActive]);

  async function handleToggle() {
    if (isSaving) return;

    const nextValue = !isActive;

    /*
     * Update UI immediately.
     */
    setIsActive(nextValue);

    setIsSaving(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("instagram_automations")
        .update({
          is_active: nextValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", automationId);

      if (error) {
        console.error(
          "AUTOMATION TOGGLE ERROR:",
          error
        );

        /*
         * Roll back if database update fails.
         */
        setIsActive(!nextValue);

        return;
      }

      /*
       * Refresh the Server Component so:
       *
       * - status badge
       * - Active count
       * - Inactive count
       * - toggle
       *
       * all use the database value.
       */
      router.refresh();
    } catch (error) {
      console.error(
        "AUTOMATION TOGGLE ERROR:",
        error
      );

      setIsActive(!nextValue);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isSaving}
      aria-label={
        isActive
          ? "Turn automation off"
          : "Turn automation on"
      }
      aria-pressed={isActive}
      className={`relative flex h-7 w-[48px] shrink-0 items-center rounded-full p-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/10 ${
        isActive
          ? "bg-emerald-500"
          : "bg-white/[0.16]"
      } ${
        isSaving
          ? "cursor-wait opacity-60"
          : "cursor-pointer"
      }`}
    >
      <span
        className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          isActive
            ? "translate-x-[20px]"
            : "translate-x-0"
        }`}
      />
    </button>
  );
}