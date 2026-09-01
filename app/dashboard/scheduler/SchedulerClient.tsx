"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

/* ============================================================
   TYPES
============================================================ */

type InstagramAccount = {
  id: string;
  username: string | null;
  is_connected: boolean;
};

type Automation = {
  id: string;
  name?: string | null;
  instagram_account_id: string;
  instagram_post_id: string | null;
  trigger_type: string | null;
  trigger_keywords: string[] | null;
  trigger_keyword: string | null;
  dm_message: string | null;
  reply_enabled: boolean | null;
  reply_text: string | null;
  reply_texts: string[] | null;
  followup_enabled: boolean | null;
  followup_delay_minutes: number | null;
  followup_message: string | null;
  button_name: string | null;
  button_url: string | null;
  is_active: boolean;
  scheduled_media_url?: string | null;
  scheduled_media_type?: MediaType | null;
};

type MediaType = "image" | "video";
type MediaItem = {
  url: string;
  type: MediaType;
  name?: string;
  source?: "upload" | "google_drive";
};
type PostType = "post" | "reel";
type PostStatus =
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

type ScheduledPost = {
  id: string;
  instagram_account_id: string;
  media_url: string;
  media_type: MediaType;
  post_type: PostType;
  media_items?: MediaItem[] | null;
  caption: string | null;
  scheduled_at: string;
  timezone: string | null;
  automation_enabled: boolean;
  automation_id: string | null;
  status: PostStatus;
  instagram_media_id: string | null;
  published_at: string | null;
  error_message: string | null;
  created_at: string;
};

type SchedulerClientProps = {
  accounts: InstagramAccount[];
  scheduledPosts: ScheduledPost[];
  automations?: Automation[];
};

type AutomationForm = {
  name: string;
  trigger_type: "any_comment" | "keywords";
  trigger_keywords: string;
  trigger_keyword: string;
  dm_message: string;
  reply_enabled: boolean;
  reply_text: string;
  reply_texts: string[];
  followup_enabled: boolean;
  followup_delay_minutes: number;
  followup_message: string;
  button_name: string;
  button_url: string;
  is_active: boolean;
};

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const COMPRESSION_TARGET_BYTES = 190 * 1024 * 1024;
const FFMPEG_CORE_VERSION = "0.12.10";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function parseApiResponse(response: Response): Promise<any> {
  const raw = await response.text();

  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw.trim() };
  }
}

async function getFFmpeg(
  onProgress?: (progress: number) => void,
): Promise<FFmpeg> {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }

  const ffmpeg = ffmpegInstance;

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const baseURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

      const coreURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        "text/javascript",
      );
      const wasmURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm",
      );

      await ffmpeg.load({
        coreURL,
        wasmURL,
      });

      return ffmpeg;
    })().catch((error) => {
      ffmpegLoadPromise = null;
      throw error;
    });
  }

  const loaded = await ffmpegLoadPromise;

  if (onProgress) {
    loaded.on("progress", ({ progress }) => {
      onProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
    });
  }

  return loaded;
}

function getVideoMetadata(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      cleanup();

      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Could not determine video duration."));
        return;
      }

      if (!width || !height) {
        reject(new Error("Could not determine video dimensions."));
        return;
      }

      resolve({ duration, width, height });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read video metadata."));
    };
  });
}

function calculateCompressionSettings(
  fileSize: number,
  duration: number,
  width: number,
  height: number,
) {
  const targetBitsPerSecond =
    (COMPRESSION_TARGET_BYTES * 8 * 0.94) / duration;

  const originalBitsPerSecond =
    (fileSize * 8) / duration;

  const totalBitrateKbps = Math.max(900, Math.floor(targetBitsPerSecond / 1000));
  const audioBitrateKbps = 160;
  let videoBitrateKbps = Math.max(700, totalBitrateKbps - audioBitrateKbps);

  const sourceIsVertical = height > width;
  const sourceLongSide = Math.max(width, height);

  let scale = "1920:1920";

  if (sourceLongSide <= 1280) {
    scale = "1280:1280";
  } else if (videoBitrateKbps < 3500) {
    scale = "1280:1280";
    videoBitrateKbps = Math.max(1800, videoBitrateKbps);
  }

  if (originalBitsPerSecond < targetBitsPerSecond * 1.05) {
    videoBitrateKbps = Math.max(1200, Math.floor(originalBitsPerSecond / 1000) - audioBitrateKbps);
  }

  return {
    videoBitrateKbps,
    audioBitrateKbps,
    scale,
  };
}

async function compressVideoForUpload(
  file: File,
  onProgress: (progress: number) => void,
): Promise<File> {
  if (file.size <= COMPRESSION_TARGET_BYTES) {
    return file;
  }

  const { duration, width, height } = await getVideoMetadata(file);
  const ffmpeg = await getFFmpeg(onProgress);
  const inputName = `scheduler-input-${Date.now()}.mp4`;
  const outputName = `scheduler-output-${Date.now()}.mp4`;

  try {
    onProgress(2);

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const settings = calculateCompressionSettings(
      file.size,
      duration,
      width,
      height,
    );

    await ffmpeg.exec([
      "-i",
      inputName,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      `scale=${settings.scale}:force_original_aspect_ratio=decrease`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      `${settings.videoBitrateKbps}k`,
      "-maxrate",
      `${Math.round(settings.videoBitrateKbps * 1.15)}k`,
      "-bufsize",
      `${settings.videoBitrateKbps * 2}k`,
      "-c:a",
      "aac",
      "-b:a",
      `${settings.audioBitrateKbps}k`,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-shortest",
      "-y",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const bytes =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : data;
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    
    
    const compressedBlob = new Blob([buffer], {
      type: "video/mp4",
    });

    onProgress(100);

    if (compressedBlob.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Video is still too large after compression (${(compressedBlob.size / (1024 * 1024)).toFixed(1)} MB). Please use a shorter video.`,
      );
    }

    return new File(
      [compressedBlob],
      file.name.replace(/\.[^.]+$/, "") + "-compressed.mp4",
      { type: "video/mp4", lastModified: Date.now() },
    );
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {}
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {}
  }
}

const EMPTY_AUTOMATION_FORM: AutomationForm = {
  name: "",
  trigger_type: "any_comment",
  trigger_keywords: "",
  trigger_keyword: "",
  dm_message: "",
  reply_enabled: false,
  reply_text: "",
  reply_texts: [""],
  followup_enabled: false,
  followup_delay_minutes: 360,
  followup_message: "",
  button_name: "",
  button_url: "",
  is_active: true,
};

/* ============================================================
   AUTOMATION HELPERS
============================================================ */

function getAutomationName(automation: Automation): string {
  if (automation.name?.trim()) {
    return automation.name.trim();
  }

  const trigger = automation.trigger_type?.toLowerCase();

  if (trigger === "any_comment") {
    return "Any Comment → DM";
  }

  const keywords = Array.isArray(automation.trigger_keywords)
    ? automation.trigger_keywords.filter(Boolean)
    : automation.trigger_keyword
      ? [automation.trigger_keyword]
      : [];

  if (keywords.length) {
    return `Keyword: ${keywords.join(", ")}`;
  }

  return "Automation → DM";
}

function automationToForm(automation: Automation): AutomationForm {
  const keywords = Array.isArray(automation.trigger_keywords)
    ? automation.trigger_keywords.join(", ")
    : automation.trigger_keyword ?? "";

  return {
    name: automation.name ?? getAutomationName(automation),
    trigger_type:
      automation.trigger_type === "keywords" ||
      automation.trigger_type === "keyword"
        ? "keywords"
        : "any_comment",
    trigger_keywords: keywords,
    trigger_keyword: automation.trigger_keyword ?? "",
    dm_message: automation.dm_message ?? "",
    reply_enabled: Boolean(automation.reply_enabled),
    reply_text: automation.reply_text ?? "",
    reply_texts:
      Array.isArray(automation.reply_texts) && automation.reply_texts.length > 0
        ? automation.reply_texts
        : automation.reply_text
          ? [automation.reply_text]
          : [""],
    followup_enabled: Boolean(automation.followup_enabled),
    followup_delay_minutes: automation.followup_delay_minutes ?? 360,
    followup_message: automation.followup_message ?? "",
    button_name: automation.button_name ?? "",
    button_url: automation.button_url ?? "",
    is_active: Boolean(automation.is_active),
  };
}

function getKeywords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/* ============================================================
   MAIN COMPONENT
============================================================ */

export default function SchedulerClient({
  accounts,
  scheduledPosts,
  automations = [],
}: SchedulerClientProps) {
  const [localScheduledPosts, setLocalScheduledPosts] =
    useState<ScheduledPost[]>(scheduledPosts);
  const [localAutomations, setLocalAutomations] =
    useState<Automation[]>(automations);
  const [showComposer, setShowComposer] = useState(false);
  const [editingScheduledPost, setEditingScheduledPost] =
    useState<ScheduledPost | null>(null);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    setLocalScheduledPosts(scheduledPosts);
  }, [scheduledPosts]);

  useEffect(() => {
    setLocalAutomations(automations);
  }, [automations]);

  useEffect(() => {
    const now = new Date();
    const count = localScheduledPosts.filter((post) => {
      const date = new Date(post.scheduled_at);
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );
    }).length;

    setTodayCount(count);
  }, [localScheduledPosts]);

  const scheduledCount = localScheduledPosts.filter(
    (post) => post.status === "scheduled",
  ).length;
  const publishedCount = localScheduledPosts.filter(
    (post) => post.status === "published",
  ).length;
  const failedCount = localScheduledPosts.filter(
    (post) => post.status === "failed",
  ).length;

  function openNewComposer() {
    setEditingScheduledPost(null);
    setShowComposer(true);
  }

  function openEditComposer(post: ScheduledPost) {
    if (post.status !== "scheduled") {
      return;
    }

    setEditingScheduledPost(post);
    setShowComposer(true);
  }

  async function handleCancelScheduledPost(post: ScheduledPost) {
    if (post.status !== "scheduled") {
      return;
    }

    const confirmed = window.confirm(
      "Cancel this scheduled post? This cannot be undone from the Scheduler.",
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/scheduler/${post.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "cancelled",
        }),
      });

      const result = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(
          result?.details
            ? `${result.error}: ${result.details}`
            : result?.error || "Failed to cancel scheduled post.",
        );
      }

      const updatedPost = (result?.post ?? result?.data) as
        | ScheduledPost
        | undefined;

      setLocalScheduledPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? updatedPost ?? { ...item, status: "cancelled" }
            : item,
        ),
      );
    } catch (error) {
      console.error("CANCEL SCHEDULED POST ERROR:", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Failed to cancel scheduled post.",
      );
    }
  }

  function handleScheduledPostSaved(updatedPost: ScheduledPost) {
    setLocalScheduledPosts((current) => {
      const existingIndex = current.findIndex(
        (item) => item.id === updatedPost.id,
      );

      // A new scheduled post is not in the current list yet.
      // Add it immediately so it appears in the dashboard.
      if (existingIndex === -1) {
        return [updatedPost, ...current];
      }

      // Editing an existing scheduled post.
      return current.map((item) =>
        item.id === updatedPost.id ? updatedPost : item,
      );
    });

    setEditingScheduledPost(null);
    setShowComposer(false);
  }

  return (
    <main className="min-h-screen bg-[#050505] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-white/[0.06] pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gray-600">
              Instagram
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Scheduler
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Schedule and manage your Instagram posts and Reels.
            </p>
          </div>

          <button
            type="button"
            onClick={openNewComposer}
            className="w-full rounded-xl bg-[#ff1744] px-5 py-3 text-sm font-semibold transition hover:bg-[#e9143e] sm:w-auto"
          >
            + Schedule Post
          </button>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Scheduled"
            value={String(scheduledCount)}
            description="Upcoming posts"
          />
          <StatCard
            title="Today"
            value={String(todayCount)}
            description="Posts scheduled today"
          />
          <StatCard
            title="Published"
            value={String(publishedCount)}
            description="Successfully published"
          />
          <StatCard
            title="Failed"
            value={String(failedCount)}
            description="Posts that failed"
          />
        </div>

        <section className="mt-10">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Upcoming Posts</h2>
            <p className="mt-1 text-xs text-gray-600">
              Your scheduled Instagram posts and Reels.
            </p>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#0b0b0b]">
            {localScheduledPosts.length === 0 ? (
              <EmptyState onSchedule={openNewComposer} />
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {localScheduledPosts.map((post) => {
                  const account = accounts.find(
                    (item) => item.id === post.instagram_account_id,
                  );
                  const automation = localAutomations.find(
                    (item) => item.id === post.automation_id,
                  );

                  return (
                    <ScheduledPostRow
                      key={post.id}
                      post={post}
                      username={account?.username ?? null}
                      automationName={
                        automation
                          ? getAutomationName(automation)
                          : null
                      }
                      onEdit={() => openEditComposer(post)}
                      onCancel={() => handleCancelScheduledPost(post)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {showComposer && (
          <ScheduleComposer
            accounts={accounts}
            automations={localAutomations}
            setAutomations={setLocalAutomations}
            editingPost={editingScheduledPost}
            onClose={() => {
              setEditingScheduledPost(null);
              setShowComposer(false);
            }}
            onSaved={handleScheduledPostSaved}
          />
        )}
      </div>
    </main>
  );
}

/* ============================================================
   STAT CARD
============================================================ */

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-[#0b0b0b] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-600">
        {title}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
    </div>
  );
}

/* ============================================================
   EMPTY STATE
============================================================ */

function EmptyState({
  onSchedule,
}: {
  onSchedule: () => void;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03] text-2xl text-gray-500">
        ◷
      </div>
      <h3 className="mt-5 text-base font-semibold">
        No posts scheduled yet
      </h3>
      <p className="mt-2 max-w-sm text-sm text-gray-600">
        Schedule your first Instagram post or Reel and it will appear here.
      </p>
      <button
        type="button"
        onClick={onSchedule}
        className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-gray-400 transition hover:bg-white/[0.06] hover:text-white"
      >
        Schedule your first post
      </button>
    </div>
  );
}

/* ============================================================
   SCHEDULED POST ROW
============================================================ */

function ScheduledPostRow({
  post,
  username,
  automationName,
  onEdit,
  onCancel,
}: {
  post: ScheduledPost;
  username: string | null;
  automationName: string | null;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const date = new Date(post.scheduled_at);
  const formattedDate = formatScheduledDate(
    date,
    post.timezone || "UTC",
  );
  const formattedTime = formatScheduledTime(
    date,
    post.timezone || "UTC",
  );
  const canEdit = post.status === "scheduled";
  const canCancel = post.status === "scheduled";

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.04] sm:h-24 sm:w-24 md:h-20 md:w-20">
        {post.media_type === "image" ? (
          <img
            src={post.media_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="relative h-full w-full">
            <video
              src={post.media_url}
              className="h-full w-full object-cover"
              muted
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-xs text-white">
                ▶
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-wider text-gray-500">
            {post.post_type}
          </span>

          {post.media_items && post.media_items.length > 1 && (
            <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[9px] text-gray-500">
              {post.media_items.length} images
            </span>
          )}

          {username && (
            <span className="text-xs text-gray-600">@{username}</span>
          )}

          {post.automation_enabled && automationName && (
            <span className="max-w-[280px] truncate rounded-md border border-[#ff1744]/10 bg-[#ff1744]/[0.04] px-2 py-1 text-[9px] text-[#ff1744]">
              ⚡ {automationName}
            </span>
          )}
        </div>

        <p className="mt-2 truncate text-sm font-medium text-gray-300">
          {post.caption || "No caption"}
        </p>

        <p className="mt-1 text-xs text-gray-600">
          {formattedDate} • {formattedTime}
        </p>

        {post.error_message && (
          <p className="mt-2 truncate text-xs text-red-400">
            {post.error_message}
          </p>
        )}
      </div>

      <StatusBadge status={post.status} />

      <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          onClick={onEdit}
          disabled={!canEdit}
          className="flex-1 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-gray-500 transition hover:bg-white/[0.03] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 sm:flex-none"
        >
          Edit
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={!canCancel}
          className="flex-1 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-gray-500 transition hover:border-red-500/20 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 sm:flex-none"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   STATUS
============================================================ */

function StatusBadge({ status }: { status: PostStatus }) {
  const labels: Record<PostStatus, string> = {
    scheduled: "Scheduled",
    publishing: "Publishing",
    published: "Published",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  const className =
    status === "scheduled"
      ? "border-blue-500/10 bg-blue-500/[0.05] text-blue-400"
      : status === "published"
        ? "border-emerald-500/10 bg-emerald-500/[0.05] text-emerald-400"
        : status === "failed"
          ? "border-red-500/10 bg-red-500/[0.05] text-red-400"
          : status === "publishing"
            ? "border-yellow-500/10 bg-yellow-500/[0.05] text-yellow-400"
            : "border-white/[0.07] bg-white/[0.03] text-gray-500";

  return (
    <span
      className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-medium ${className}`}
    >
      {labels[status]}
    </span>
  );
}

/* ============================================================
   SCHEDULE COMPOSER
============================================================ */

function ScheduleComposer({
  accounts,
  automations,
  setAutomations,
  editingPost,
  onClose,
  onSaved,
}: {
  accounts: InstagramAccount[];
  automations: Automation[];
  setAutomations: Dispatch<SetStateAction<Automation[]>>;
  editingPost: ScheduledPost | null;
  onClose: () => void;
  onSaved: (post: ScheduledPost) => void;
}) {
  const isEditingScheduledPost = Boolean(editingPost);

  const [postType, setPostType] = useState<PostType>(
    editingPost?.post_type ?? "reel",
  );
  const [selectedAccount, setSelectedAccount] = useState(
    editingPost?.instagram_account_id ?? accounts[0]?.id ?? "",
  );
  const initialMediaItems: MediaItem[] = editingPost?.media_items?.length
    ? editingPost.media_items
    : editingPost?.media_url
      ? [{ url: editingPost.media_url, type: editingPost.media_type, source: "upload" }]
      : [];

  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialMediaItems);
  const initialSource = initialMediaItems[0]?.source === "google_drive" ? "google_drive" : "upload";
  const [mediaSource, setMediaSource] = useState<"upload" | "google_drive">(initialSource);
  const [googleDriveUrl, setGoogleDriveUrl] = useState(
    initialSource === "google_drive" ? initialMediaItems[0]?.url ?? "" : "",
  );
  const [mediaUrl, setMediaUrl] = useState(editingPost?.media_url ?? initialMediaItems[0]?.url ?? "");
  const [mediaType, setMediaType] = useState<MediaType | null>(
    editingPost?.media_type ?? initialMediaItems[0]?.type ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionStatus, setCompressionStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [caption, setCaption] = useState(editingPost?.caption ?? "");
  const [scheduleDate, setScheduleDate] = useState(
    editingPost
      ? getDateInputValue(editingPost.scheduled_at, editingPost.timezone)
      : "",
  );
  const [scheduleTime, setScheduleTime] = useState(
    editingPost
      ? getTimeInputValue(editingPost.scheduled_at, editingPost.timezone)
      : "",
  );
  const [automationEnabled, setAutomationEnabled] = useState(
    Boolean(editingPost?.automation_enabled),
  );
  const [selectedAutomationId, setSelectedAutomationId] = useState(
    editingPost?.automation_id ?? "",
  );
  const [preparedAutomationId, setPreparedAutomationId] = useState<string | null>(
    editingPost?.automation_id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [creatingAutomation, setCreatingAutomation] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(false);
  const [previewAutomation, setPreviewAutomation] = useState<Automation | null>(
    null,
  );
  const [automationError, setAutomationError] = useState("");
  // All scheduled times are entered and stored as India Standard Time (IST).
  const timezone = "Asia/Kolkata";

  const [automationForm, setAutomationForm] = useState<AutomationForm>(
    EMPTY_AUTOMATION_FORM,
  );


  const availableAutomations = useMemo(
    () =>
      automations.filter(
        (automation) =>
          automation.instagram_account_id === selectedAccount,
      ),
    [automations, selectedAccount],
  );

  const selectedAutomation =
    availableAutomations.find(
      (automation) => automation.id === selectedAutomationId,
    ) ?? null;

  const automationReady =
    !automationEnabled ||
    Boolean(
      selectedAutomationId &&
        preparedAutomationId === selectedAutomationId,
    );

  function handleAccountChange(accountId: string) {
    setSelectedAccount(accountId);
    setSelectedAutomationId("");
    setPreparedAutomationId(null);
    setPreviewAutomation(null);
    setAutomationError("");
  }

  function handleAutomationSelection(id: string) {
    setSelectedAutomationId(id);
    setPreparedAutomationId(null);
    setPreviewAutomation(null);
    setAutomationError("");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setUploadError("");
    setUploading(true);
    setUploadProgress(0);
    setCompressionProgress(0);
    setCompressionStatus("");

    try {
      const hasVideo = files.some((file) => file.type.startsWith("video/"));

      if (hasVideo && files.length > 1) {
        throw new Error("A Reel can contain only one video. Upload one video, or upload multiple images for a carousel post.");
      }

      if (!hasVideo && mediaItems.filter((item) => item.type === "image").length + files.length > 10) {
        throw new Error("Instagram carousel posts support up to 10 images.");
      }

      const uploadedItems: MediaItem[] = [];

      for (let index = 0; index < files.length; index++) {
        const originalFile = files[index];
        const detectedType: MediaType = originalFile.type.startsWith("video/") ? "video" : "image";

        let fileToUpload = originalFile;

        if (detectedType === "video" && originalFile.size > COMPRESSION_TARGET_BYTES) {
          setCompressionStatus(`Compressing video ${index + 1}/${files.length}...`);
          fileToUpload = await compressVideoForUpload(originalFile, (progress) => {
            setCompressionProgress(progress);
          });
        }

        if (fileToUpload.size > MAX_UPLOAD_BYTES) {
          throw new Error(`${originalFile.name} is larger than 200 MB after compression.`);
        }

        const formData = new FormData();
        formData.append("file", fileToUpload);

        setUploadProgress(Math.round((index / files.length) * 100));

        const response = await fetch("/api/scheduler/upload", {
          method: "POST",
          body: formData,
        });

        const result = await parseApiResponse(response);

        if (!response.ok || !result?.url) {
          throw new Error(
            result?.details
              ? `${result.error}: ${result.details}`
              : result?.error || `Could not upload ${originalFile.name}.`,
          );
        }

        uploadedItems.push({
          url: result.url,
          type: detectedType,
          name: originalFile.name,
          source: "upload",
        });

        setUploadProgress(Math.round(((index + 1) / files.length) * 100));
      }

      const nextMediaItems = hasVideo
        ? uploadedItems
        : [
            ...mediaItems.filter((item) => item.type === "image"),
            ...uploadedItems,
          ];

      if (nextMediaItems.length > 10) {
        throw new Error("Instagram carousel posts support up to 10 images.");
      }

      setMediaItems(nextMediaItems);
      setMediaUrl(nextMediaItems[0]?.url ?? "");
      setMediaType(nextMediaItems[0]?.type ?? null);

      // Automatic post/reel mode based on selected media.
      setPostType(hasVideo ? "reel" : "post");
      setGoogleDriveUrl("");
      setMediaSource("upload");
      setCompressionProgress(100);
      setCompressionStatus("");
    } catch (error) {
      console.error("MEDIA UPLOAD ERROR:", error);
      setUploadError(error instanceof Error ? error.message : "Could not upload media.");
      setUploadProgress(0);
      setCompressionProgress(0);
      setCompressionStatus("");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  function extractGoogleDriveFileId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const patterns = [
      /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
      /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
      /drive\.google\.com\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match?.[1]) return match[1];
    }

    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  function addGoogleDriveVideo() {
    setUploadError("");
    const fileId = extractGoogleDriveFileId(googleDriveUrl);

    if (!fileId) {
      setUploadError("Enter a valid Google Drive file link or file ID.");
      return;
    }

    const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    setMediaItems([
      {
        url: directUrl,
        type: "video",
        name: `Google Drive video (${fileId.slice(0, 8)}...)`,
        source: "google_drive",
      },
    ]);
    setMediaUrl(directUrl);
    setMediaType("video");
    setPostType("reel");
    setMediaSource("google_drive");
  }

  function removeMediaItem(index: number) {
    setMediaItems((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      setMediaUrl(next[0]?.url ?? "");
      setMediaType(next[0]?.type ?? null);
      setPostType(next.some((item) => item.type === "video") ? "reel" : "post");
      return next;
    });
  }

  function openCreateAutomation() {
    setAutomationError("");
    setAutomationForm({ ...EMPTY_AUTOMATION_FORM });
    setCreatingAutomation(true);
    setEditingAutomation(false);
    setPreviewAutomation(null);
  }

  function openEditAutomation() {
    if (!selectedAutomation) {
      setAutomationError("Please select an automation first.");
      return;
    }

    setAutomationForm(automationToForm(selectedAutomation));
    setAutomationError("");
    setCreatingAutomation(false);
    setEditingAutomation(true);
    setPreviewAutomation(null);
  }

  function closeAutomationEditor() {
    setCreatingAutomation(false);
    setEditingAutomation(false);
    setAutomationError("");
  }

  async function saveInlineAutomation() {
    setAutomationError("");

    if (!selectedAccount) {
      setAutomationError("Please select an Instagram account first.");
      return;
    }

    if (!automationForm.name.trim()) {
      setAutomationError("Automation name is required.");
      return;
    }

    if (!automationForm.dm_message.trim()) {
      setAutomationError("DM message is required.");
      return;
    }

    if (
      automationForm.trigger_type === "keywords" &&
      getKeywords(automationForm.trigger_keywords).length === 0
    ) {
      setAutomationError("Please enter at least one keyword.");
      return;
    }

    const replyTexts = Array.from(
      new Set(
        automationForm.reply_texts
          .map((reply) => reply.trim())
          .filter(Boolean)
          .slice(0, 20),
      ),
    );

    if (automationForm.reply_enabled && replyTexts.length === 0) {
      setAutomationError("Please add at least one public reply message.");
      return;
    }

    if (
      automationForm.followup_enabled &&
      (!automationForm.button_name.trim() ||
        !automationForm.button_url.trim() ||
        !automationForm.followup_message.trim())
    ) {
      setAutomationError(
        "Follow-up requires a button name, button URL, and follow-up message.",
      );
      return;
    }

    setAutomationSaving(true);

    try {
      const keywords = getKeywords(automationForm.trigger_keywords);

      const response = await fetch("/api/automations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: automationForm.name.trim(),
          instagramAccountId: selectedAccount,
          triggerType: automationForm.trigger_type,
          triggerKeywords: keywords,
          triggerKeyword: keywords[0] ?? null,
          dmMessage: automationForm.dm_message.trim(),
          replyEnabled: automationForm.reply_enabled,
          replyText: replyTexts[0] ?? "",
          replyTexts: automationForm.reply_enabled ? replyTexts : [],
          buttonName: automationForm.button_name.trim(),
          buttonUrl: automationForm.button_url.trim(),
          followupEnabled: automationForm.followup_enabled,
          followupDelayMinutes: automationForm.followup_delay_minutes,
          followupMessage: automationForm.followup_message.trim(),
          isActive: automationForm.is_active,
          source: "scheduler",
          schedulerMode: true,
          scheduledPostId: editingPost?.id ?? null,
          instagramPostId: null,
        }),
      });

      const result = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(
          result?.details
            ? `${result.error}: ${result.details}`
            : result?.error || "Failed to create automation.",
        );
      }

      const newAutomation = (result?.data ?? result?.automation) as
        | Automation
        | undefined;

      if (!newAutomation?.id) {
        throw new Error(
          "Automation was created but no automation ID was returned.",
        );
      }

      setAutomations((current) => [
        newAutomation,
        ...current.filter((item) => item.id !== newAutomation.id),
      ]);
      setSelectedAutomationId(newAutomation.id);
      setPreparedAutomationId(newAutomation.id);
      setCreatingAutomation(false);
      setEditingAutomation(false);
      setAutomationError("");
    } catch (error) {
      console.error("CREATE INLINE AUTOMATION ERROR:", error);
      setAutomationError(
        error instanceof Error ? error.message : "Failed to create automation.",
      );
    } finally {
      setAutomationSaving(false);
    }
  }

  async function saveInlineAutomationEdit() {
    if (!selectedAutomation) {
      setAutomationError("Please select an automation first.");
      return;
    }

    setAutomationError("");

    if (!automationForm.name.trim()) {
      setAutomationError("Automation name is required.");
      return;
    }

    if (!automationForm.dm_message.trim()) {
      setAutomationError("DM message is required.");
      return;
    }

    if (
      automationForm.trigger_type === "keywords" &&
      getKeywords(automationForm.trigger_keywords).length === 0
    ) {
      setAutomationError("Please enter at least one keyword.");
      return;
    }

    const replyTexts = Array.from(
      new Set(
        automationForm.reply_texts
          .map((reply) => reply.trim())
          .filter(Boolean)
          .slice(0, 20),
      ),
    );

    if (automationForm.reply_enabled && replyTexts.length === 0) {
      setAutomationError("Please add at least one public reply message.");
      return;
    }

    if (
      automationForm.followup_enabled &&
      (!automationForm.button_name.trim() ||
        !automationForm.button_url.trim() ||
        !automationForm.followup_message.trim())
    ) {
      setAutomationError(
        "Follow-up requires a button name, button URL, and follow-up message.",
      );
      return;
    }

    setAutomationSaving(true);

    try {
      const keywords = getKeywords(automationForm.trigger_keywords);

      const response = await fetch(
        `/api/automations/${selectedAutomation.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: automationForm.name.trim(),
            triggerType: automationForm.trigger_type,
            triggerKeywords: keywords,
            triggerKeyword: keywords[0] ?? null,
            dmMessage: automationForm.dm_message.trim(),
            replyEnabled: automationForm.reply_enabled,
            replyText: replyTexts[0] ?? "",
            replyTexts: automationForm.reply_enabled ? replyTexts : [],
            buttonName: automationForm.button_name.trim(),
            buttonUrl: automationForm.button_url.trim(),
            followupEnabled: automationForm.followup_enabled,
            followupDelayMinutes: automationForm.followup_delay_minutes,
            followupMessage: automationForm.followup_message.trim(),
            isActive: automationForm.is_active,
          }),
        },
      );

      const result = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(
          result?.details
            ? `${result.error}: ${result.details}`
            : result?.error || "Failed to update automation.",
        );
      }

      const updatedAutomation = (result?.data ?? result?.automation) as
        | Automation
        | undefined;

      if (!updatedAutomation?.id) {
        throw new Error("Updated automation was not returned by the API.");
      }

      setAutomations((current) =>
        current.map((item) =>
          item.id === updatedAutomation.id ? updatedAutomation : item,
        ),
      );
      setSelectedAutomationId(updatedAutomation.id);
      setPreparedAutomationId(updatedAutomation.id);
      setCreatingAutomation(false);
      setEditingAutomation(false);
      setAutomationError("");
    } catch (error) {
      console.error("UPDATE INLINE AUTOMATION ERROR:", error);
      setAutomationError(
        error instanceof Error ? error.message : "Failed to update automation.",
      );
    } finally {
      setAutomationSaving(false);
    }
  }

  async function handleDuplicateAutomation() {
    setAutomationError("");

    if (!selectedAutomation) {
      setAutomationError("Please select an automation first.");
      return;
    }

    if (!scheduleDate) {
      setAutomationError("Please select the scheduled date first.");
      return;
    }

    const scheduledDateTime = createLocalDateTime(
      scheduleDate,
      scheduleTime || "00:00",
    );

    if (!scheduledDateTime) {
      setAutomationError("Invalid scheduled date or time.");
      return;
    }

    setDuplicating(true);

    try {
      const response = await fetch(
        `/api/automations/${selectedAutomation.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: "scheduler",
            schedulerMode: true,
            scheduledDate: scheduledDateTime.toISOString(),
            scheduledPostId: editingPost?.id ?? null,
            /*
             * The scheduled media belongs to scheduled_posts.
             * It is passed only as UI metadata and never replaces
             * instagram_automations.instagram_post_id.
             */
            scheduledMediaUrl: mediaUrl || null,
            scheduledMediaType: mediaType || null,
            instagramPostId: null,
          }),
        },
      );

      const result = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(
          result?.details
            ? `${result.error}: ${result.details}`
            : result?.error || "Failed to duplicate automation.",
        );
      }

      const duplicate = (result?.data ?? result?.automation) as
        | Automation
        | undefined;

      if (!duplicate?.id) {
        throw new Error(
          "Automation was duplicated but the new automation ID was not returned.",
        );
      }

      setAutomations((current) => [
        duplicate,
        ...current.filter((item) => item.id !== duplicate.id),
      ]);
      setSelectedAutomationId(duplicate.id);
      setPreparedAutomationId(duplicate.id);

      setPreviewAutomation({
        ...duplicate,
        instagram_post_id: null,
        scheduled_media_url: mediaUrl || null,
        scheduled_media_type: mediaType || null,
      });
      setAutomationError("");
    } catch (error) {
      console.error("SCHEDULER DUPLICATE AUTOMATION ERROR:", error);
      setAutomationError(
        error instanceof Error
          ? error.message
          : "Failed to duplicate automation.",
      );
    } finally {
      setDuplicating(false);
    }
  }

  function handlePreviewAutomation() {
    if (!selectedAutomation) {
      setAutomationError("Please select an automation first.");
      return;
    }

    setPreviewAutomation(selectedAutomation);
  }

  async function handleSchedule() {
    setSaveError("");

    if (!selectedAccount) {
      setSaveError("Please select an Instagram account.");
      return;
    }

    if (!mediaItems.length || !mediaUrl || !mediaType) {
      setSaveError("Please upload at least one image or video.");
      return;
    }

    if (mediaItems.length > 10) {
      setSaveError("Instagram carousel posts support up to 10 images.");
      return;
    }

    if (mediaItems.some((item) => item.type === "video") && mediaItems.length !== 1) {
      setSaveError("A Reel must contain exactly one video.");
      return;
    }

    if (!scheduleDate) {
      setSaveError("Please select a date.");
      return;
    }

    if (!scheduleTime) {
      setSaveError("Please select a time.");
      return;
    }

    if (automationEnabled) {
      if (!selectedAutomationId) {
        setSaveError("Please select an automation.");
        return;
      }

      if (!preparedAutomationId || preparedAutomationId !== selectedAutomationId) {
        setSaveError(
          "You must duplicate the selected automation or create a new automation before scheduling the post.",
        );
        return;
      }
    }

    const scheduledAt = createLocalDateTime(scheduleDate, scheduleTime);

    if (!scheduledAt) {
      setSaveError("Invalid schedule date or time.");
      return;
    }

    if (scheduledAt.getTime() <= Date.now() + 30_000) {
      setSaveError("Please select a future date and time.");
      return;
    }

    setSaving(true);

    try {
      /*
       * A scheduled post does NOT have an Instagram media/post ID yet.
       * The Instagram post ID is created only after the scheduler publishes
       * this media. When an automation is attached, explicitly mark this
       * request as Scheduler mode so the backend never applies the normal
       * "Instagram post is required" automation validation.
       */
      const payload = {
        instagramAccountId: selectedAccount,
        mediaUrl,
        mediaType,
        mediaItems,
        postType,
        caption,
        scheduledAt: scheduledAt.toISOString(),
        timezone,
        automationEnabled,
        automationId: automationEnabled ? preparedAutomationId : null,

        // Scheduler-specific metadata.
        source: "scheduler",
        schedulerMode: automationEnabled,
        scheduledPostId: editingPost?.id ?? null,

        // There is intentionally NO Instagram post ID at scheduling time.
        instagramPostId: null,
        postIds: [],
      };

      const response = await fetch(
        isEditingScheduledPost
          ? `/api/scheduler/${editingPost!.id}`
          : "/api/scheduler",
        {
          method: isEditingScheduledPost ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(
          result?.details
            ? `${result.error}: ${result.details}`
            : result?.error ||
                (isEditingScheduledPost
                  ? "Could not update scheduled post."
                  : "Could not schedule post."),
        );
      }

      const savedPost = (result?.post ?? result?.data) as
        | ScheduledPost
        | undefined;

      if (!savedPost?.id) {
        throw new Error("The server did not return the saved scheduled post.");
      }

      onSaved(savedPost);
    } catch (error) {
      console.error(
        isEditingScheduledPost
          ? "UPDATE SCHEDULED POST ERROR:"
          : "SCHEDULE POST ERROR:",
        error,
      );
      setSaveError(
        error instanceof Error
          ? error.message
          : isEditingScheduledPost
            ? "Could not update scheduled post."
            : "Could not schedule post.",
      );
    } finally {
      setSaving(false);
    }
  }

  const editorOpen = creatingAutomation || editingAutomation;
  const editingExistingAutomation = editingAutomation && Boolean(selectedAutomation);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white/[0.08] bg-[#0b0b0b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold">
              {editorOpen
                ? editingExistingAutomation
                  ? "Edit Automation"
                  : "Create Automation"
                : isEditingScheduledPost
                  ? "Edit Scheduled Post"
                  : "Schedule Post"}
            </h2>
            <p className="mt-1 text-xs text-gray-600">
              {editorOpen
                ? "Configure the automation without leaving Scheduler."
                : isEditingScheduledPost
                  ? "Update this scheduled post without losing its scheduling data."
                  : "Choose your media and publishing time."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving || duplicating || automationSaving}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-gray-500 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {editorOpen ? (
          <div className="space-y-5 p-6">
            <InlineAutomationEditor
              form={automationForm}
              setForm={setAutomationForm}
            />

            {automationError && (
              <ErrorBox message={automationError} />
            )}

            <div className="flex justify-between gap-3 border-t border-white/[0.06] pt-5">
              <button
                type="button"
                onClick={closeAutomationEditor}
                disabled={automationSaving}
                className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-gray-500 hover:text-white disabled:opacity-40"
              >
                ← Back to Schedule
              </button>

              <button
                type="button"
                onClick={
                  editingExistingAutomation
                    ? saveInlineAutomationEdit
                    : saveInlineAutomation
                }
                disabled={automationSaving}
                className="rounded-xl bg-[#ff1744] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e9143e] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {automationSaving
                  ? "Saving..."
                  : editingExistingAutomation
                    ? "Save Automation"
                    : "Create Automation"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-6 p-6">
              {/* ACCOUNT */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-400">
                  Instagram Account
                </label>
                {accounts.length ? (
                  <select
                    value={selectedAccount}
                    onChange={(event) =>
                      handleAccountChange(event.target.value)
                    }
                    disabled={isEditingScheduledPost}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-gray-300 outline-none focus:border-[#ff1744]/50 disabled:opacity-50"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        @{account.username ?? "Instagram account"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-red-500/10 bg-red-500/[0.04] p-4 text-sm text-red-400">
                    No connected Instagram account found.
                  </div>
                )}
              </div>

              {/* MEDIA */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-400">
                  Media
                </label>

                <div className="mb-3 grid grid-cols-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
                  <button
                    type="button"
                    onClick={() => setMediaSource("upload")}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${mediaSource === "upload" ? "bg-white text-black" : "text-gray-500"}`}
                  >
                    Upload Media
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaSource("google_drive")}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${mediaSource === "google_drive" ? "bg-white text-black" : "text-gray-500"}`}
                  >
                    Google Drive Video
                  </button>
                </div>

                {mediaSource === "upload" ? (
                  <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.1] bg-white/[0.015] px-4 text-center transition hover:bg-white/[0.03]">
                    <span className="text-sm text-gray-400">
                      {mediaItems.length > 1
                        ? `${mediaItems.length} images selected`
                        : "Upload image or video"}
                    </span>
                    <span className="mt-2 text-xs text-gray-600">
                      Multiple images = carousel Post • Video = Reel
                    </span>
                    <span className="mt-1 text-[10px] text-gray-700">
                      Up to 10 images or 1 video
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                      className="hidden"
                      disabled={uploading}
                      onChange={handleFileChange}
                    />
                  </label>
                ) : (
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-4">
                    <p className="text-xs text-gray-500">
                      Paste a Google Drive video link. The file must be shared as “Anyone with the link”.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={googleDriveUrl}
                        onChange={(event) => setGoogleDriveUrl(event.target.value)}
                        placeholder="https://drive.google.com/file/d/.../view"
                        className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/50"
                      />
                      <button
                        type="button"
                        onClick={addGoogleDriveVideo}
                        className="h-11 rounded-xl bg-[#ff1744] px-4 text-xs font-semibold text-white hover:bg-[#e9143e]"
                      >
                        Use Video
                      </button>
                    </div>
                  </div>
                )}

                {mediaItems.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {mediaItems.map((item, index) => (
                      <div key={`${item.url}-${index}`} className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-black">
                        {item.type === "video" ? (
                          <video src={item.url} className="aspect-square w-full object-cover" muted playsInline preload="metadata" />
                        ) : (
                          <img src={item.url} alt={item.name || "Scheduled image"} className="aspect-square w-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeMediaItem(index)}
                          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-sm text-white"
                          aria-label={`Remove media ${index + 1}`}
                        >
                          ×
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/65 px-2 py-1 text-[9px] text-white/70">
                          {item.source === "google_drive" ? "Google Drive" : `Media ${index + 1}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {uploading && (
                  <div className="mt-3 space-y-2">
                    {compressionStatus && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{compressionStatus}</span>
                        {compressionProgress > 0 && <span className="text-gray-600">{compressionProgress}%</span>}
                      </div>
                    )}
                    {compressionProgress > 0 && compressionProgress < 100 && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-[#ff1744] transition-all" style={{ width: `${compressionProgress}%` }} />
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Uploading media...</span>
                      <span className="text-gray-600">{uploadProgress}%</span>
                    </div>
                  </div>
                )}

                {uploadError && <ErrorBox message={uploadError} />}
              </div>

              {/* POST TYPE */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-400">
                  Publish as
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled
                    className={`rounded-xl border px-4 py-3 text-sm ${postType === "post" ? "border-[#ff1744]/40 bg-[#ff1744]/[0.08] text-white" : "border-white/[0.07] text-gray-500 opacity-50"}`}
                  >
                    Post {postType === "post" ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    disabled
                    className={`rounded-xl border px-4 py-3 text-sm ${postType === "reel" ? "border-[#ff1744]/40 bg-[#ff1744]/[0.08] text-white" : "border-white/[0.07] text-gray-500 opacity-50"}`}
                  >
                    Reel {postType === "reel" ? "✓" : ""}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-gray-600">
                  Media determines the format automatically: image(s) → Post, video → Reel.
                </p>
              </div>

              {/* CAPTION */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-400">
                    Caption
                  </label>
                  <span className="text-[10px] text-gray-700">
                    {caption.length} characters
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Write your caption..."
                  className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#111111] p-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/50"
                />
              </div>

              {/* DATE + TIME */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-400">
                    Date
                  </label>
                  <input
                    type="date"
                    value={scheduleDate}
                    min={getTodayDateString()}
                    onChange={(event) => setScheduleDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-gray-300 outline-none focus:border-[#ff1744]/50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-400">
                    Time
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(event) => setScheduleTime(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-gray-300 outline-none focus:border-[#ff1744]/50"
                  />
                </div>
              </div>

              {/* TIMEZONE */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400">
                      Timezone
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      {timezone}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-700">
                    Local time
                  </span>
                </div>
              </div>

              {/* AUTOMATION */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      Run automation after publishing
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      A separate automation copy will be used for this scheduled post.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={automationEnabled}
                    onClick={() => {
                      const next = !automationEnabled;
                      setAutomationEnabled(next);
                      if (!next) {
                        setSelectedAutomationId("");
                        setPreparedAutomationId(null);
                        setPreviewAutomation(null);
                        setAutomationError("");
                      }
                    }}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                      automationEnabled
                        ? "bg-[#ff1744]"
                        : "bg-white/[0.12]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                        automationEnabled ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {automationEnabled && (
                  <div className="mt-4 border-t border-white/[0.06] pt-4">
                    <label className="mb-2 block text-xs font-medium text-gray-400">
                      Select automation
                    </label>

                    <select
                      value={selectedAutomationId}
                      onChange={(event) =>
                        handleAutomationSelection(event.target.value)
                      }
                      className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-gray-300 outline-none focus:border-[#ff1744]/50"
                    >
                      <option value="">Choose an automation</option>
                      {availableAutomations.map((automation) => (
                        <option key={automation.id} value={automation.id}>
                          {getAutomationName(automation)}
                          {!automation.is_active ? " — Inactive" : ""}
                        </option>
                      ))}
                    </select>

                    {selectedAutomation && (
                      <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">
                              Selected automation
                            </p>
                            <p className="mt-1 truncate text-sm font-medium text-gray-300">
                              {getAutomationName(selectedAutomation)}
                            </p>
                            <p
                              className={`mt-1 text-[11px] ${
                                preparedAutomationId === selectedAutomation.id
                                  ? "text-emerald-400"
                                  : "text-gray-600"
                              }`}
                            >
                              {preparedAutomationId === selectedAutomation.id
                                ? "Ready for this scheduled post"
                                : "Not yet prepared for this scheduled post"}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={handlePreviewAutomation}
                            className="shrink-0 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[10px] text-gray-500 hover:bg-white/[0.04] hover:text-white"
                          >
                            Preview
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleDuplicateAutomation}
                        disabled={
                          duplicating ||
                          !selectedAutomationId ||
                          preparedAutomationId === selectedAutomationId
                        }
                        className="rounded-xl border border-[#ff1744]/20 bg-[#ff1744]/[0.06] px-4 py-2.5 text-xs font-semibold text-[#ff6b86] transition hover:border-[#ff1744]/40 hover:bg-[#ff1744]/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {duplicating
                          ? "Duplicating..."
                          : preparedAutomationId === selectedAutomationId
                            ? "✓ Duplicated for this post"
                            : "Duplicate for this scheduled post"}
                      </button>

                      <button
                        type="button"
                        onClick={openCreateAutomation}
                        disabled={duplicating || automationSaving}
                        className="rounded-xl bg-white/[0.05] px-4 py-2.5 text-xs font-medium text-gray-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                      >
                        + Create New Automation
                      </button>
                    </div>

                    {selectedAutomation && (
                      <button
                        type="button"
                        onClick={openEditAutomation}
                        disabled={duplicating || automationSaving}
                        className="mt-2 w-full rounded-xl border border-white/[0.08] px-4 py-2.5 text-xs text-gray-400 hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
                      >
                        Edit Selected Automation Here
                      </button>
                    )}

                    {automationError && (
                      <div className="mt-3">
                        <ErrorBox message={automationError} />
                      </div>
                    )}

                    {selectedAutomation && !automationReady && (
                      <p className="mt-3 text-[11px] text-yellow-500">
                        You must duplicate this automation before you can schedule the post.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {saveError && <ErrorBox message={saveError} />}
            </div>

            <div className="flex justify-end gap-3 border-t border-white/[0.06] px-6 py-5">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || uploading || duplicating}
                className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-gray-500 hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSchedule}
                disabled={
                  saving ||
                  uploading ||
                  accounts.length === 0 ||
                  !automationReady
                }
                className="rounded-xl bg-[#ff1744] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e9143e] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving
                  ? isEditingScheduledPost
                    ? "Saving Changes..."
                    : "Scheduling..."
                  : uploading
                    ? "Uploading..."
                    : isEditingScheduledPost
                      ? "Save Changes"
                      : "Schedule Post"}
              </button>
            </div>
          </>
        )}
      </div>

      {previewAutomation && (
        <AutomationPreviewModal
          automation={previewAutomation}
          onClose={() => setPreviewAutomation(null)}
          onEdit={() => {
            setPreviewAutomation(null);
            openEditAutomation();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   INLINE AUTOMATION EDITOR
============================================================ */

function InlineAutomationEditor({
  form,
  setForm,
}: {
  form: AutomationForm;
  setForm: Dispatch<SetStateAction<AutomationForm>>;
}) {
  function update<K extends keyof AutomationForm>(
    key: K,
    value: AutomationForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateReply(index: number, value: string) {
    setForm((current) => ({
      ...current,
      reply_texts: current.reply_texts.map((reply, replyIndex) =>
        replyIndex === index ? value : reply,
      ),
      reply_text:
        index === 0 ? value : current.reply_text,
    }));
  }

  function addReply() {
    setForm((current) => ({
      ...current,
      reply_texts: [...current.reply_texts, ""],
    }));
  }

  function removeReply(index: number) {
    setForm((current) => {
      const next = current.reply_texts.filter(
        (_, replyIndex) => replyIndex !== index,
      );

      const replies = next.length > 0 ? next : [""];

      return {
        ...current,
        reply_texts: replies,
        reply_text: replies[0] ?? "",
      };
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-400">
          Automation Name
        </label>
        <input
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
          maxLength={100}
          placeholder="Course Launch"
          className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/50"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-gray-400">
          Trigger
        </label>
        <select
          value={form.trigger_type}
          onChange={(event) =>
            update(
              "trigger_type",
              event.target.value as AutomationForm["trigger_type"],
            )
          }
          className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-gray-300 outline-none focus:border-[#ff1744]/50"
        >
          <option value="any_comment">Any Comment</option>
          <option value="keywords">Specific Keywords</option>
        </select>
      </div>

      {form.trigger_type === "keywords" && (
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-400">
            Keywords
          </label>
          <textarea
            rows={3}
            value={form.trigger_keywords}
            onChange={(event) =>
              update("trigger_keywords", event.target.value)
            }
            placeholder="price, link, details"
            className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#111111] p-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/50"
          />
          <p className="mt-1 text-[10px] text-gray-600">
            Separate keywords with commas or new lines.
          </p>
        </div>
      )}

      <div>
        <label className="mb-2 block text-xs font-medium text-gray-400">
          DM Message
        </label>
        <textarea
          rows={6}
          value={form.dm_message}
          onChange={(event) => update("dm_message", event.target.value)}
          placeholder="Write the DM message..."
          className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#111111] p-3 text-sm leading-6 text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/50"
        />
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <label className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-300">
              Public Reply
            </p>
            <p className="mt-1 text-xs text-gray-600">
              Add multiple replies. They rotate automatically.
            </p>
          </div>
          <input
            type="checkbox"
            checked={form.reply_enabled}
            onChange={(event) =>
              update("reply_enabled", event.target.checked)
            }
            className="h-5 w-5 accent-[#ff1744]"
          />
        </label>

        {form.reply_enabled && (
          <div className="mt-4 space-y-3">
            {form.reply_texts.map((reply, index) => (
              <div
                key={`scheduler-reply-${index}`}
                className="rounded-2xl border border-white/[0.07] bg-[#070707] p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-gray-400">
                    Reply {index + 1}
                  </label>
                  {form.reply_texts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeReply(index)}
                      className="text-xs text-gray-600 hover:text-red-400"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={reply}
                  onChange={(event) => updateReply(index, event.target.value)}
                  placeholder="Thanks for commenting ❤️"
                  className="w-full resize-y rounded-xl border border-white/[0.08] bg-[#0b0b0b] p-3 text-sm leading-6 text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/40"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addReply}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-xs font-medium text-gray-400 hover:border-[#ff1744]/20 hover:text-white"
            >
              <span className="text-base leading-none">+</span>
              Add Reply
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <label className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-300">
              Follow up if the link isn&apos;t opened
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-600">
              Track clicks on the Custom DM Button and send one reminder if it is not opened.
            </p>
          </div>
          <input
            type="checkbox"
            checked={form.followup_enabled}
            onChange={(event) =>
              update("followup_enabled", event.target.checked)
            }
            className="mt-1 h-5 w-5 shrink-0 accent-[#ff1744]"
          />
        </label>

        {form.followup_enabled && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-400">
                Send reminder after
              </label>
              <select
                value={String(form.followup_delay_minutes)}
                onChange={(event) =>
                  update(
                    "followup_delay_minutes",
                    Number(event.target.value),
                  )
                }
                className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-white outline-none focus:border-[#ff1744]/50"
              >
                <option value="60">1 hour</option>
                <option value="180">3 hours</option>
                <option value="360">6 hours</option>
                <option value="720">12 hours</option>
                <option value="1380">23 hours</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-gray-400">
                Follow-up message
              </label>
              <textarea
                rows={4}
                maxLength={2000}
                value={form.followup_message}
                onChange={(event) =>
                  update("followup_message", event.target.value)
                }
                placeholder="If you're still curious, don't forget to tap the link ⬆️"
                className="w-full resize-y rounded-xl border border-white/[0.08] bg-[#111111] p-3 text-sm leading-6 text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/50"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-400">
            Button Name
          </label>
          <input
            value={form.button_name}
            onChange={(event) => update("button_name", event.target.value)}
            placeholder="Get Course"
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/50"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-gray-400">
            Button URL
          </label>
          <input
            type="url"
            value={form.button_url}
            onChange={(event) => update("button_url", event.target.value)}
            placeholder="https://example.com"
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#111111] px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]/50"
          />
        </div>
      </div>

      <label className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div>
          <p className="text-sm font-medium text-gray-300">
            Active automation
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Enable this automation after publishing.
          </p>
        </div>
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(event) => update("is_active", event.target.checked)}
          className="h-5 w-5 accent-[#ff1744]"
        />
      </label>
    </div>
  );
}

/* ============================================================
   PREVIEW MODAL
============================================================ */

function AutomationPreviewModal({
  automation,
  onClose,
  onEdit,
}: {
  automation: Automation;
  onClose: () => void;
  onEdit: () => void;
}) {
  const keywords = Array.isArray(automation.trigger_keywords)
    ? automation.trigger_keywords.join(", ")
    : automation.trigger_keyword || "No keywords";

  const trigger =
    automation.trigger_type === "any_comment"
      ? "Any Comment"
      : automation.trigger_type === "keywords"
        ? "Specific Keywords"
        : automation.trigger_type || "Not configured";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-white/[0.08] bg-[#0c0c0c]">
        <div className="flex items-start justify-between border-b border-white/[0.06] px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-600">
              Automation Preview
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {getAutomationName(automation)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-gray-500 hover:bg-white/[0.05] hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-6">
          {automation.scheduled_media_url && (
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
              <div className="px-4 pt-4">
                <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">
                  Scheduled Post Media
                </p>
              </div>

              <div className="p-4">
                {automation.scheduled_media_type === "video" ? (
                  <video
                    src={automation.scheduled_media_url}
                    controls
                    playsInline
                    className="max-h-80 w-full rounded-lg object-contain"
                  />
                ) : (
                  <img
                    src={automation.scheduled_media_url}
                    alt="Scheduled post"
                    className="max-h-80 w-full rounded-lg object-contain"
                  />
                )}
              </div>
            </div>
          )}
          <PreviewRow
            label="Status"
            value={automation.is_active ? "Active" : "Inactive"}
          />
          <PreviewRow label="Trigger" value={trigger} />
          <PreviewRow label="Keywords" value={keywords} />

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">
              DM Message
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">
              {automation.dm_message || "No DM message configured."}
            </p>
          </div>

          {automation.reply_enabled && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">
                Public Reply Messages
              </p>
              <div className="mt-3 space-y-2">
                {(Array.isArray(automation.reply_texts) && automation.reply_texts.length > 0
                  ? automation.reply_texts
                  : automation.reply_text
                    ? [automation.reply_text]
                    : []
                ).map((reply, index) => (
                  <div key={`preview-reply-${index}`} className="rounded-lg bg-white/[0.025] px-3 py-2 text-sm text-gray-300">
                    <span className="mr-2 text-[10px] text-gray-600">Reply {index + 1}</span>
                    <span className="whitespace-pre-wrap">{reply}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {automation.followup_enabled && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">
                Link Follow-up
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Reminder after {automation.followup_delay_minutes ?? 360} minutes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">
                {automation.followup_message || "No follow-up message configured."}
              </p>
            </div>
          )}

          {automation.button_name && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">
                Button
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {automation.button_name}
              </p>
              {automation.button_url && (
                <p className="mt-1 truncate text-xs text-gray-600">
                  {automation.button_url}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-gray-500 hover:text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-xl bg-[#ff1744] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e9143e]"
          >
            Edit Automation
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">
        {label}
      </p>
      <p className="mt-2 text-sm text-gray-300">{value}</p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/10 bg-red-500/[0.04] p-3 text-xs leading-5 text-red-400">
      {message}
    </div>
  );
}

/* ============================================================
   DETERMINISTIC DISPLAY FORMATTING
============================================================ */

function formatScheduledDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatScheduledTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/* ============================================================
   DATE HELPERS
============================================================ */

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);

  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${(mb / 1024).toFixed(2)} GB`;
}

function createLocalDateTime(
  dateString: string,
  timeString: string,
): Date | null {
  if (!dateString || !timeString) return null;

  const [year, month, day] = dateString.split("-").map(Number);
  const [hours, minutes] = timeString.split(":").map(Number);

  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  // Interpret the selected date/time explicitly as IST (UTC+05:30),
  // regardless of the timezone configured on the user's computer.
  const date = new Date(
    `${dateString}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`,
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // Validate the resulting instant in the scheduler timezone.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const actualHour = values.hour === "24" ? "00" : values.hour;

  if (
    values.year !== String(year) ||
    values.month !== String(month).padStart(2, "0") ||
    values.day !== String(day).padStart(2, "0") ||
    actualHour !== String(hours).padStart(2, "0") ||
    values.minute !== String(minutes).padStart(2, "0")
  ) {
    return null;
  }

  return date;
}

function getTodayDateString(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDateInputValue(
  iso: string,
  timezone: string | null | undefined,
): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function getTimeInputValue(
  iso: string,
  timezone: string | null | undefined,
): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

  return `${hour === "24" ? "00" : hour}:${minute}`;
}
