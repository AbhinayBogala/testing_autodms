import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import ConnectInstagramButton from "./ConnectInstagramButton";


const navigation = [

  {
    name: "Dashboard",
    href: "/dashboard",
    icon: "⌂",
  },

  {
    name: "Content",
    href: "/dashboard/content",
    icon: "▣",
  },

  {
    name: "Automations",
    href: "/dashboard/automations",
    icon: "⚡",
  },

  {
    name: "Analytics",
    href: "/dashboard/analytics",
    icon: "◒",
  },

  {
    name: "Settings",
    href: "/dashboard/settings",
    icon: "⚙",
  },

];




export default async function DashboardLayout({

  children,

}: {

  children: React.ReactNode;

}) {



  const supabase = await createClient();




  const {

    data:{
      user
    }

  } = await supabase.auth.getUser();





  if(!user){

    redirect("/login");

  }







  const {

    data:account

  } = await supabase

    .from("instagram_accounts")

    .select(
      `
      username,
      profile_picture_url,
      is_connected
      `
    )

    .eq(
      "user_id",
      user.id
    )

    .maybeSingle();





  const connected =
    Boolean(
      account?.is_connected
    );








  return (

    <div

      className="
        min-h-screen
        bg-[#050505]
        text-white
      "

    >





      {/* SIDEBAR */}

      <aside

        className="
          fixed
          left-0
          top-0
          z-50
          h-screen
          w-72
          border-r
          border-white/10
          bg-[#080808]/90
          backdrop-blur-xl
          px-5
          py-6
        "

      >





        {/* BRAND */}


        <div>


          <h1

            className="
              text-2xl
              font-bold
              tracking-tight
            "

          >

            AUTO DM

          </h1>



          <p

            className="
              mt-1
              text-xs
              text-gray-500
            "

          >

            Instagram Automation

          </p>


        </div>









        {/* ACCOUNT CARD */}


        <div

          className="
            mt-8
            rounded-3xl
            border
            border-white/10
            bg-white/[0.04]
            p-5
          "

        >




          <div

            className="
              flex
              items-center
              gap-3
            "

          >



            {
              account?.profile_picture_url

              ?

              <img

                src={
                  account.profile_picture_url
                }

                alt="Instagram"

                referrerPolicy="no-referrer"

                className="
                  h-12
                  w-12
                  rounded-full
                  object-cover
                "

              />

              :

              <div

                className="
                  flex
                  h-12
                  w-12
                  items-center
                  justify-center
                  rounded-full
                  bg-white/10
                "

              >

                ◎

              </div>

            }








            <div>


              <p

                className="
                  font-semibold
                "

              >

                @{account?.username ?? "Instagram"}

              </p>





              <p

                className={

                  connected

                  ?

                  "text-xs text-green-400"

                  :

                  "text-xs text-red-400"

                }

              >

                ● {connected ? "Connected" : "Disconnected"}

              </p>



            </div>



          </div>







          {
            !connected && (

              <div className="mt-5">

                <ConnectInstagramButton

                  label="Connect Instagram"

                />

              </div>

            )
          }






        </div>












        {/* NAVIGATION */}


        <nav

          className="
            mt-8
            space-y-2
          "

        >



          {
            navigation.map(
              item => (

                <a

                  key={item.href}

                  href={item.href}

                  className="
                    group
                    flex
                    items-center
                    gap-3
                    rounded-xl
                    px-4
                    py-3
                    text-sm
                    text-gray-400
                    transition
                    hover:bg-white/[0.06]
                    hover:text-white
                  "

                >


                  <span

                    className="
                      text-lg
                      transition
                      group-hover:scale-110
                    "

                  >

                    {item.icon}

                  </span>



                  {item.name}



                </a>


              )
            )
          }


        </nav>









        {/* FOOTER */}


        <div

          className="
            absolute
            bottom-6
            left-5
            right-5
            border-t
            border-white/10
            pt-5
          "

        >


          <p

            className="
              truncate
              text-xs
              text-gray-500
            "

          >

            {user.email}

          </p>


        </div>






      </aside>









      {/* PAGE CONTENT */}


      <main

        className="
          ml-72
          min-h-screen
          px-8
          py-8
        "

      >

        {children}


      </main>





    </div>

  );

}