/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";

export const INSTAGRAM_API_VERSION =
  process.env.INSTAGRAM_API_VERSION || "v26.0";

export const INSTAGRAM_GRAPH_BASE =
  "https://graph.instagram.com";

export type InstagramToken = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

export function graphUrl(path: string) {
  const clean = path.replace(/^\/+/, "");
  return `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/${clean}`;
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<InstagramToken> {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appSecret) {
    throw new Error("INSTAGRAM_APP_SECRET is missing");
  }

  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE}/access_token`
  );

  url.searchParams.set(
    "grant_type",
    "ig_exchange_token"
  );
  url.searchParams.set(
    "client_secret",
    appSecret
  );
  url.searchParams.set(
    "access_token",
    shortLivedToken
  );

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const data = await readJson(response);

  if (
    !response.ok ||
    typeof data?.access_token !== "string"
  ) {
    throw new Error(
      getInstagramError(data) ||
        "Could not exchange Instagram token"
    );
  }

  return data as InstagramToken;
}

export async function refreshLongLivedToken(
  accessToken: string
): Promise<InstagramToken> {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE}/refresh_access_token`
  );

  url.searchParams.set(
    "grant_type",
    "ig_refresh_token"
  );
  url.searchParams.set(
    "access_token",
    accessToken
  );

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const data = await readJson(response);

  if (
    !response.ok ||
    typeof data?.access_token !== "string"
  ) {
    throw new Error(
      getInstagramError(data) ||
        "Could not refresh Instagram token"
    );
  }

  return data as InstagramToken;
}

export async function markInstagramDisconnected(
  accountId: string
) {
  const supabase = createAdminClient();

  await supabase
    .from("instagram_accounts")
    .update({
      is_connected: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
}

export function isInstagramTokenError(
  value: unknown
) {
  const message = getInstagramError(value).toLowerCase();

  return (
    message.includes("access token") ||
    message.includes("session has expired") ||
    message.includes("oauth") ||
    message.includes("token") &&
      message.includes("invalid")
  );
}

export function getInstagramError(
  value: unknown
): string {
  if (typeof value === "string") return value;

  if (!value || typeof value !== "object") {
    return "";
  }

  const data = value as Record<string, unknown>;

  if (typeof data.message === "string") {
    return data.message;
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  if (
    data.error &&
    typeof data.error === "object"
  ) {
    return getInstagramError(data.error);
  }

  if (data.details) {
    return getInstagramError(data.details);
  }

  if (
    typeof data.error_message === "string"
  ) {
    return data.error_message;
  }

  return "";
}

export async function readJson(
  response: Response
): Promise<any> {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text.slice(0, 1000),
    };
  }
}

export async function refreshAccountIfNeeded(
  account: {
    id: string;
    access_token: string | null;
    token_expires_at?: string | null;
    token_issued_at?: string | null;
  },
  options?: { force?: boolean }
) {
  if (!account.access_token) {
    throw new Error(
      "Instagram access token is missing"
    );
  }

  const expiresAt = account.token_expires_at
    ? new Date(account.token_expires_at).getTime()
    : 0;

  const issuedAt = account.token_issued_at
    ? new Date(account.token_issued_at).getTime()
    : 0;

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;

  const shouldRefresh =
    options?.force === true ||
    !expiresAt ||
    expiresAt - now <= sevenDays;

  const oldEnough =
    !issuedAt || now - issuedAt >= oneDay;

  if (!shouldRefresh || !oldEnough) {
    return {
      accessToken: account.access_token,
      refreshed: false,
      expiresAt: account.token_expires_at ?? null,
    };
  }

  const refreshed =
    await refreshLongLivedToken(
      account.access_token
    );

  const newIssuedAt = new Date();
  const newExpiresAt =
    typeof refreshed.expires_in === "number"
      ? new Date(
          newIssuedAt.getTime() +
            refreshed.expires_in * 1000
        )
      : null;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("instagram_accounts")
    .update({
      access_token:
        refreshed.access_token,
      token_issued_at:
        newIssuedAt.toISOString(),
      token_expires_at:
        newExpiresAt?.toISOString() ?? null,
      last_token_refresh_at:
        newIssuedAt.toISOString(),
      is_connected: true,
      updated_at:
        newIssuedAt.toISOString(),
    })
    .eq("id", account.id);

  if (error) {
    throw new Error(
      `Failed to save refreshed Instagram token: ${error.message}`
    );
  }

  return {
    accessToken: refreshed.access_token,
    refreshed: true,
    expiresAt:
      newExpiresAt?.toISOString() ?? null,
  };
}
