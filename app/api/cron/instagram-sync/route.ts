import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import { syncInstagramAccount } from "@/lib/instagram/syncAccount";


export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: accounts, error } =
      await supabase
        .from("instagram_accounts")
        .select("id")
        .eq(
          "is_connected",
          true
        );


    if (error) {
      throw error;
    }


    for (const account of accounts ?? []) {
      try {
        await syncInstagramAccount(
          account.id
        );

        console.log(
          "SYNC SUCCESS:",
          account.id
        );

      } catch (error) {

        console.error(
          "ACCOUNT SYNC FAILED:",
          account.id,
          error
        );

      }
    }


    return NextResponse.json({
      success: true,
      synced:
        accounts?.length ?? 0,
    });


  } catch (error) {

    console.error(
      "INSTAGRAM CRON ERROR:",
      error
    );


    return NextResponse.json(
      {
        success:false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status:500,
      }
    );
  }
}