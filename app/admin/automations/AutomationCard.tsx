"use client";

type Automation = {
  id: string;
  instagram_post_id: string;
  trigger_keyword: string;
  dm_message: string;
  is_active: boolean;
  created_at: string;
};

export default function AutomationCard({
  automation,
}: {
  automation: Automation;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Comment → DM</h3>
          <p className="mt-1 text-sm text-white/50">
            Keyword:{" "}
            <span className="text-blue-400">
              {automation.trigger_keyword}
            </span>
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs ${
            automation.is_active
              ? "bg-green-500/20 text-green-400"
              : "bg-yellow-500/20 text-yellow-400"
          }`}
        >
          {automation.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-black/20 p-4">
        <p className="text-xs text-white/40">DM Message</p>
        <p className="mt-2 text-sm text-white/80">
          {automation.dm_message}
        </p>
      </div>

      <p className="mt-4 text-xs text-white/30">
        Post ID: {automation.instagram_post_id}
      </p>
    </div>
  );
}