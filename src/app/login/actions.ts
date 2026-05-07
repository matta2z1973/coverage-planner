"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120).optional(),
});

export type LoginState = {
  ok: boolean;
  message: string;
};

export async function sendMagicLink(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: "Please enter a valid email and name." };
  }

  const supabase = await createSupabaseServerClient();
  const headerList = await headers();
  const origin =
    process.env.APP_URL ?? `https://${headerList.get("host") ?? "localhost"}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: parsed.data.fullName ? { full_name: parsed.data.fullName } : undefined,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: "Check your email for a sign-in link.",
  };
}
