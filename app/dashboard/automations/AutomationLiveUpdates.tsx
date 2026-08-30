"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function AutomationLiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("automations-live-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "instagram_automations",
        },
        (payload) => {
          console.log(
            "AUTOMATION LIVE UPDATE:",
            payload
          );

          /*
           * Refresh the Server Component data
           * without a full browser reload.
           */
          router.refresh();
        }
      )
      .subscribe((status) => {
        console.log(
          "AUTOMATION REALTIME STATUS:",
          status
        );
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}