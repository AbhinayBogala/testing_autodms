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

/* =========================================================
   ERROR HELPERS
========================================================= */

export function getInstagramError(
  value: unknown
): string {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const data =
    value as Record<string, unknown>;

  if (
    typeof data.message ===
    "string"
  ) {
    return data.message;
  }

  if (
    typeof data.error_message ===
    "string"
  ) {
    return data.error_message;
  }

  if (
    typeof data.error ===
    "string"
  ) {
    return data.error;
  }

  if (
    data.error &&
    typeof data.error ===
      "object"
  ) {
    return getInstagramError(
      data.error
    );
  }

  if (data.details) {
    return getInstagramError(
      data.details
    );
  }

  return "";
}

export function isInstagramTokenError(
  value: unknown
) {
  const message =
    getInstagramError(value)
      .toLowerCase();

  return (
    message.includes(
      "access token"
    ) ||
    message.includes(
      "session has expired"
    ) ||
    message.includes(
      "oauth"
    ) ||
    (
      message.includes("token") &&
      message.includes("invalid")
    )
  );
}

export async function readJson(
  response: Response
): Promise<any> {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message:
        text.slice(0, 1000),
    };
  }
}

/* =========================================================
   EXCHANGE SHORT-LIVED TOKEN
========================================================= */

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<InstagramToken> {
  const appSecret =
    process.env.INSTAGRAM_APP_SECRET;

  if (!appSecret) {
    throw new Error(
      "INSTAGRAM_APP_SECRET is missing"
    );
  }

  if (!shortLivedToken) {
    throw new Error(
      "Instagram short-lived access token is missing"
    );
  }

  /*
   * Instagram's long-lived token exchange
   * endpoint expects the parameters as
   * query parameters and the request is GET.
   */

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

  console.log(
    "INSTAGRAM LONG-LIVED TOKEN REQUEST",
    {
      endpoint:
        url.origin +
        url.pathname,
      method: "GET",
    }
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "GET",
        cache: "no-store",
      }
    );

  const data =
    await readJson(response);

  if (
    !response.ok ||
    typeof data?.access_token !==
      "string"
  ) {
    console.error(
      "INSTAGRAM LONG-LIVED TOKEN EXCHANGE FAILED:",
      {
        status:
          response.status,
        statusText:
          response.statusText,
        data,
      }
    );

    throw new Error(
      getInstagramError(data) ||
        "Could not exchange Instagram token"
    );
  }

  console.log(
    "INSTAGRAM LONG-LIVED TOKEN EXCHANGE SUCCESS"
  );

  return data as InstagramToken;
}

/* =========================================================
   REFRESH LONG-LIVED TOKEN
========================================================= */

export async function refreshLongLivedToken(
  accessToken: string
): Promise<InstagramToken> {
  if (!accessToken) {
    throw new Error(
      "Instagram access token is missing"
    );
  }

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

  console.log(
    "INSTAGRAM TOKEN REFRESH REQUEST",
    {
      endpoint:
        url.origin +
        url.pathname,
      method: "GET",
    }
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "GET",
        cache: "no-store",
      }
    );

  const data =
    await readJson(response);

  if (
    !response.ok ||
    typeof data?.access_token !==
      "string"
  ) {
    console.error(
      "INSTAGRAM TOKEN REFRESH API ERROR:",
      {
        status:
          response.status,
        statusText:
          response.statusText,
        data,
      }
    );

    throw new Error(
      getInstagramError(data) ||
        `Instagram token refresh failed with HTTP ${response.status}`
    );
  }

  return data as InstagramToken;
}

/* =========================================================
   DISCONNECT ACCOUNT
========================================================= */

export async function markInstagramDisconnected(
  accountId: string
) {
  const supabase =
    createAdminClient();

  await supabase
    .from(
      "instagram_accounts"
    )
    .update({
      is_connected: false,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      accountId
    );
}

/* =========================================================
   TOKEN ERROR DETECTION
========================================================= */

export function shouldDisconnectForTokenError(
  value: unknown
) {
  const message =
    getInstagramError(value)
      .toLowerCase();

  return (
    message.includes(
      "session has expired"
    ) ||
    message.includes(
      "invalid oauth"
    ) ||
    message.includes(
      "invalid access token"
    ) ||
    message.includes(
      "token is invalid"
    )
  );
}

/* =========================================================
   REFRESH ACCOUNT IF NEEDED
========================================================= */

export async function refreshAccountIfNeeded(
  account: {
    id: string;
    access_token: string | null;
    token_expires_at?:
      | string
      | null;
    token_issued_at?:
      | string
      | null;
  },
  options?: {
    force?: boolean;
  }
) {
  if (!account.access_token) {
    throw new Error(
      "Instagram access token is missing"
    );
  }

  const now =
    Date.now();

  const expiresAt =
    account.token_expires_at
      ? new Date(
          account.token_expires_at
        ).getTime()
      : null;

  const issuedAt =
    account.token_issued_at
      ? new Date(
          account.token_issued_at
        ).getTime()
      : null;

  const sevenDays =
    7 *
    24 *
    60 *
    60 *
    1000;

  const oneDay =
    24 *
    60 *
    60 *
    1000;

  /*
   * IMPORTANT:
   *
   * If expiry is unknown, DO NOT automatically
   * call refresh_access_token.
   *
   * The existing token may still be valid.
   */

  if (!expiresAt) {
    console.warn(
      "INSTAGRAM TOKEN EXPIRY UNKNOWN - USING EXISTING TOKEN",
      {
        accountId:
          account.id,
        issuedAt:
          account.token_issued_at,
      }
    );

    return {
      accessToken:
        account.access_token,

      refreshed: false,

      expiresAt: null,

      expiryKnown: false,
    };
  }

  /*
   * Already expired.
   *
   * Try refresh only if we actually know
   * the token's expiry.
   */

  const expired =
    expiresAt <= now;

  /*
   * Refresh within seven days of expiry.
   */

  const expiringSoon =
    expiresAt - now <=
    sevenDays;

  /*
   * Prevent repeated refresh attempts.
   *
   * Instagram should not be hammered with
   * refresh requests.
   */

  const oldEnough =
    !issuedAt ||
    now - issuedAt >=
      oneDay;

  const shouldRefresh =
    options?.force === true ||
    (
      expiringSoon &&
      oldEnough
    );

  if (!shouldRefresh) {
    return {
      accessToken:
        account.access_token,

      refreshed: false,

      expiresAt:
        new Date(
          expiresAt
        ).toISOString(),

      expiryKnown: true,
    };
  }

  console.log(
    "INSTAGRAM TOKEN NEEDS REFRESH",
    {
      accountId:
        account.id,

      expired,

      expiresAt:
        new Date(
          expiresAt
        ).toISOString(),

      daysRemaining:
        Math.max(
          0,
          Math.round(
            (
              expiresAt -
              now
            ) /
            (
              24 *
              60 *
              60 *
              1000
            )
          )
        ),
    }
  );

  try {
    const refreshed =
      await refreshLongLivedToken(
        account.access_token
      );

    const newIssuedAt =
      new Date();

    const newExpiresAt =
      typeof refreshed.expires_in ===
      "number"
        ? new Date(
            newIssuedAt.getTime() +
              refreshed.expires_in *
                1000
          )
        : null;

    const supabase =
      createAdminClient();

    const {
      error,
    } = await supabase
      .from(
        "instagram_accounts"
      )
      .update({
        access_token:
          refreshed.access_token,

        token_issued_at:
          newIssuedAt.toISOString(),

        token_expires_at:
          newExpiresAt
            ?.toISOString() ??
          null,

        last_token_refresh_at:
          newIssuedAt.toISOString(),

        is_connected:
          true,

        updated_at:
          newIssuedAt.toISOString(),
      })
      .eq(
        "id",
        account.id
      );

    if (error) {
      throw new Error(
        `Failed to save refreshed Instagram token: ${error.message}`
      );
    }

    console.log(
      "INSTAGRAM TOKEN REFRESH SUCCESS",
      {
        accountId:
          account.id,

        expiresAt:
          newExpiresAt
            ?.toISOString() ??
          null,
      }
    );

    return {
      accessToken:
        refreshed.access_token,

      refreshed: true,

      expiresAt:
        newExpiresAt
          ?.toISOString() ??
        null,

      expiryKnown:
        Boolean(
          newExpiresAt
        ),
    };
  } catch (error) {
    console.error(
      "INSTAGRAM TOKEN REFRESH FAILED:",
      {
        accountId:
          account.id,

        error:
          error instanceof
          Error
            ? error.message
            : error,
      }
    );

    /*
     * Do NOT immediately disconnect the account.
     *
     * The existing token might still work.
     */

    return {
      accessToken:
        account.access_token,

      refreshed: false,

      expiresAt:
        account.token_expires_at ??
        null,

      expiryKnown: true,

      refreshFailed: true,
    };
  }
}