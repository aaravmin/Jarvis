"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthResult = { error?: string; notice?: string };

/** Where confirmation emails should send users back to. */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * One server action for both sign-in and sign-up; the clicked submit button supplies `intent`.
 * On success we redirect to /today (redirect() throws, so nothing after it runs). On failure we
 * return a message that the login form renders inline via useActionState.
 */
export async function authenticate(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const intent = String(formData.get("intent") ?? "signin");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are both required." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const supabase = await createClient();

  if (intent === "signup") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
    });
    if (error) return { error: error.message };

    // If the project has email confirmation disabled, sign-up returns a live session.
    if (data.session) {
      revalidatePath("/", "layout");
      redirect("/today");
    }
    return {
      notice: "Account created. Check your email to confirm, then sign in.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/today");
}
