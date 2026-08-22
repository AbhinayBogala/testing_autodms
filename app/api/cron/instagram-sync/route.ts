import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncInstagramAccount } from "@/lib/instagram/syncAccount";


export async function GET() {

  const supabase =
    createAdminClient();


  const { data: accounts } =
    await supabase
      .from("instagram_accounts")
      .select("id")
      .eq(
        "is_connected",
        true
      );


  for (
    const account of accounts ?? []
  ) {

    try {

      await syncInstagramAccount(
        account.id
      );

    } catch(error){

      console.error(
        "ACCOUNT SYNC FAILED",
        account.id,
        error
      );

    }
  }


  return NextResponse.json({
    success:true,
  });

}