"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";


export default function SyncInstagramButton() {

  const [loading, setLoading] = useState(false);

  const router = useRouter();


  async function syncInstagram() {

    if (loading) return;


    setLoading(true);


    try {

      const response = await fetch(
        "/api/instagram/sync",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );


      if (!response.ok) {

        const data = await response.json()
          .catch(() => ({}));


        console.error(
          "Instagram sync failed:",
          data
        );


        return;
      }


      router.refresh();


    } catch (error) {

      console.error(
        "Instagram sync error:",
        error
      );


    } finally {

      setLoading(false);

    }

  }



  return (

    <button

      type="button"

      onClick={syncInstagram}

      disabled={loading}

      className="
        rounded-xl
        border
        border-white/10
        bg-white/5
        px-5
        py-3
        text-sm
        font-semibold
        text-white
        transition
        hover:bg-white/10
        disabled:cursor-not-allowed
        disabled:opacity-50
      "

    >

      {
        loading
          ? "Syncing..."
          : "Sync Instagram"
      }


    </button>

  );

}