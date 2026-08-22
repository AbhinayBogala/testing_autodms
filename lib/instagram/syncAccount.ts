import { createAdminClient } from "@/lib/supabase/admin";

import {
  graphUrl,
  readJson,
  refreshAccountIfNeeded,
} from "@/lib/instagram";


export async function syncInstagramAccount(
  accountId: string
) {
  const supabase = createAdminClient();

  const { data: account, error } =
    await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("id", accountId)
      .single();

  if (error || !account) {
    throw new Error(
      "Instagram account not found"
    );
  }

  const token =
    await refreshAccountIfNeeded(account);


  const url =
    new URL(
      graphUrl("me")
    );


  url.searchParams.set(
    "fields",
    [
      "id",
      "username",
      "profile_picture_url",
      "followers_count",
      "follows_count",
      "media_count",
    ].join(",")
  );


  url.searchParams.set(
    "access_token",
    token.accessToken
  );


  const response =
    await fetch(
      url.toString(),
      {
        cache: "no-store",
      }
    );


  const profile =
    await readJson(response);


  console.log(
    "INSTAGRAM PROFILE RESPONSE:",
    JSON.stringify(profile, null, 2)
  );


  if (!response.ok) {
    throw new Error(
      JSON.stringify(profile)
    );
  }


  const { error: updateError } =
    await supabase
      .from("instagram_accounts")
      .update({
        username:
          profile.username,

        profile_picture_url:
          profile.profile_picture_url,

        followers_count:
          profile.followers_count ?? 0,

        following_count:
          profile.follows_count ?? 0,

        media_count:
          profile.media_count ?? 0,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        accountId
      );


  if (updateError) {
    throw new Error(
      `Failed updating Instagram account: ${updateError.message}`
    );
  }


  console.log(
    "INSTAGRAM ACCOUNT SYNC SUCCESS:",
    {
      accountId,
      username: profile.username,
      followers: profile.followers_count,
      following: profile.follows_count,
      media: profile.media_count,
    }
  );


  return profile;
}