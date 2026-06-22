import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The user's lightweight profile, makes auto-population relevant to who they are. */
export type Profile = {
  headline?: string;
  age?: number;
  level?: string;
  lookingFor?: string;
};

export async function loadProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("headline, age, level, looking_for").maybeSingle();
  if (!data) return null;
  return {
    headline: data.headline ?? undefined,
    age: data.age ?? undefined,
    level: data.level ?? undefined,
    lookingFor: data.looking_for ?? undefined,
  };
}

/** A compact one-block description of the user for AI prompts (goals + this). Empty string if blank. */
export function profileDigest(p: Profile | null): string {
  if (!p) return "";
  const bits = [
    p.headline && p.headline,
    typeof p.age === "number" && `Age: ${p.age}`,
    p.level && `Level: ${p.level}`,
    p.lookingFor && `Looking for: ${p.lookingFor}`,
  ].filter(Boolean);
  return bits.length ? `About the user:\n${bits.join("\n")}` : "";
}
