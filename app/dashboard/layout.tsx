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
    name: "Scheduler",
    href: "/dashboard/scheduler",
    icon: "◷",
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
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /*
   * A user can have multiple Instagram accounts.
   *
   * Fetch all accounts and then select the account
   * that is currently marked as connected.
   */

  const {
    data: accounts,
    error: accountError,
  } = await supabase
    .from("instagram_accounts")
    .select(`
      id,
      username,
      profile_picture_url,
      is_connected
    `)
    .eq("user_id", user.id)
    .order("updated_at", {
      ascending: false,
    });

  if (accountError) {
    console.error(
      "DASHBOARD LAYOUT ACCOUNT ERROR:",
      accountError
    );
  }

  /*
   * The active Instagram account is the account
   * whose is_connected value is true.
   */

  const account =
    accounts?.find(
      (item) => item.is_connected === true
    ) ?? null;

  const connected = Boolean(
    account?.is_connected
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white">

      {/* =========================================================
          SIDEBAR
      ========================================================= */}

      <aside
        className="
          fixed
          left-0
          top-0
          z-50
          flex
          h-screen
          w-72
          flex-col
          border-r
          border-white/[0.07]
          bg-[#080808]
          px-5
          py-6
        "
      >

        {/* =======================================================
            DEVILX BRAND
        ======================================================= */}

        <div className="px-2">

          <div className="flex items-center">

            <span
              className="
                text-[27px]
                font-black
                leading-none
                tracking-[-0.07em]
                text-white
              "
            >
              Devil
            </span>

            <span
              className="
                text-[27px]
                font-black
                leading-none
                tracking-[-0.07em]
                text-[#ff1744]
              "
            >
              X
            </span>

          </div>

          <div className="mt-3 flex items-center gap-2">

            <span className="h-px w-7 bg-[#ff1744]" />

            <p
              className="
                text-[9px]
                font-medium
                uppercase
                tracking-[0.2em]
                text-gray-600
              "
            >
              Instagram Automation
            </p>

          </div>

        </div>

        {/* =======================================================
            ACCOUNT CARD
        ======================================================= */}

        <div
          className="
            mt-9
            rounded-[22px]
            border
            border-white/[0.07]
            bg-[#0d0d0d]
            p-4
          "
        >

          {/* Account label */}

          <div className="mb-4 flex items-center justify-between">

            <p
              className="
                text-[9px]
                font-semibold
                uppercase
                tracking-[0.16em]
                text-gray-600
              "
            >
              Connected Account
            </p>

            <span
              className="
                h-1.5
                w-1.5
                rounded-full
                bg-[#ff1744]
              "
            />

          </div>

          {/* Account */}

          <div className="flex items-center gap-3">

            {account?.profile_picture_url ? (

              <img
                src={account.profile_picture_url}
                alt={
                  account.username
                    ? `@${account.username}`
                    : "Instagram"
                }
                referrerPolicy="no-referrer"
                className="
                  h-12
                  w-12
                  rounded-full
                  object-cover
                  ring-2
                  ring-white/[0.06]
                "
              />

            ) : (

              <div
                className="
                  flex
                  h-12
                  w-12
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  border
                  border-white/[0.07]
                  bg-white/[0.04]
                  text-lg
                  text-gray-500
                "
              >
                ◎
              </div>

            )}

            <div className="min-w-0">

              <p
                className="
                  truncate
                  text-sm
                  font-semibold
                  text-white
                "
              >
                {account?.username
                  ? `@${account.username}`
                  : "@Instagram"}
              </p>

              <div className="mt-1 flex items-center gap-1.5">

                <span
                  className={
                    connected
                      ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
                      : "h-1.5 w-1.5 rounded-full bg-red-400"
                  }
                />

                <p
                  className={
                    connected
                      ? "text-[11px] text-emerald-400"
                      : "text-[11px] text-red-400"
                  }
                >
                  {connected
                    ? "Connected"
                    : "Disconnected"}
                </p>

              </div>

            </div>

          </div>

          {/* Connect */}

          {!connected && (
            <div className="mt-4">

              <ConnectInstagramButton
                label="Connect Instagram"
              />

            </div>
          )}

        </div>

        {/* =======================================================
            NAVIGATION
        ======================================================= */}

        <div className="mt-9">

          <p
            className="
              mb-3
              px-3
              text-[9px]
              font-semibold
              uppercase
              tracking-[0.18em]
              text-gray-700
            "
          >
            Workspace
          </p>

          <nav className="space-y-1">

            {navigation.map((item) => (

              <a
                key={item.href}
                href={item.href}
                className="
                  group
                  relative
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  border
                  border-transparent
                  px-3.5
                  py-3
                  text-sm
                  text-gray-500
                  transition-colors
                  duration-200
                  hover:border-white/[0.05]
                  hover:bg-white/[0.035]
                  hover:text-white
                "
              >

                {/* Left indicator */}

                <span
                  className="
                    absolute
                    left-0
                    top-1/2
                    h-5
                    w-0.5
                    -translate-y-1/2
                    rounded-full
                    bg-[#ff1744]
                    opacity-0
                    transition-opacity
                    duration-200
                    group-hover:opacity-100
                  "
                />

                {/* Icon */}

                <span
                  className="
                    flex
                    h-8
                    w-8
                    items-center
                    justify-center
                    rounded-lg
                    border
                    border-white/[0.05]
                    bg-white/[0.025]
                    text-sm
                    text-gray-500
                    transition-colors
                    duration-200
                    group-hover:border-[#ff1744]/15
                    group-hover:bg-[#ff1744]/[0.05]
                    group-hover:text-[#ff1744]
                  "
                >
                  {item.icon}
                </span>

                <span className="font-medium">
                  {item.name}
                </span>

              </a>

            ))}

          </nav>

        </div>

        {/* =======================================================
            SIDEBAR FOOTER
        ======================================================= */}

        <div
          className="
            mt-auto
            border-t
            border-white/[0.06]
            pt-5
          "
        >

          <div className="flex items-center gap-3">

            <div
              className="
                flex
                h-9
                w-9
                shrink-0
                items-center
                justify-center
                rounded-xl
                bg-white/[0.04]
                text-xs
                font-semibold
                text-gray-400
              "
            >
              {user.email?.charAt(0).toUpperCase() ?? "U"}
            </div>

            <div className="min-w-0">

              <p
                className="
                  text-[9px]
                  font-semibold
                  uppercase
                  tracking-[0.15em]
                  text-gray-700
                "
              >
                Account
              </p>

              <p
                className="
                  mt-1
                  truncate
                  text-xs
                  text-gray-500
                "
              >
                {user.email}
              </p>

            </div>

          </div>

          <div className="mt-4 flex items-center justify-between">

            <p
              className="
                text-[9px]
                uppercase
                tracking-[0.15em]
                text-gray-700
              "
            >
              DevilX
            </p>

            <p
              className="
                text-[9px]
                uppercase
                tracking-[0.12em]
                text-gray-700
              "
            >
              v1.0
            </p>

          </div>

        </div>

      </aside>

      {/* =========================================================
          MAIN CONTENT
      ========================================================= */}

      <main
        className="
          ml-72
          min-h-screen
          bg-[#050505]
          px-8
          py-8
          lg:px-10
        "
      >
        {children}
      </main>

    </div>
  );
}