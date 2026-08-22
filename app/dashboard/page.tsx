import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConnectInstagramButton from "./ConnectInstagramButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");

 const {data:account}=await supabase
 .from("instagram_accounts")
 .select("is_connected,username")
 .eq("user_id",user.id)
 .maybeSingle();

 return (
 <div className="px-10 py-10">
   <h1 className="text-4xl font-bold">Dashboard</h1>
   <p className="mt-2 text-gray-400">Manage Instagram content, DMs and automations.</p>

   {!account?.is_connected && (
    <div className="mt-20 mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center backdrop-blur-xl">
      <div className="text-5xl">✨</div>
      <h2 className="mt-5 text-2xl font-bold">Connect your Instagram</h2>
      <p className="mt-3 text-gray-400">
        Connect your professional account to start managing comments, DMs and automations.
      </p>
      <div className="mt-8 flex justify-center">
        <ConnectInstagramButton label="Connect Instagram"/>
      </div>
    </div>
   )}
 </div>
 )
}