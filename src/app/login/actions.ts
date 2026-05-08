"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120).optional(),
});

export type LoginState =
  | { phase: "idle" }
  | { phase: "code_sent"; email: string; message: string }
  | { phase: "error"; message: string };

const initial: LoginState = { phase: "idle" };

export async function requestOtp(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = requestSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName") || undefined,
  });
  if (!parsed.success) {
    return { phase: "error", message: "Please enter a valid email and name." };
  }

  const supabase = await createSupabaseServerClient();
  const headerList = await headers();
  const origin =
    process.env.APP_URL ?? `https://${headerList.get("host") ?? "localhost"}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Magic link still works for inboxes that don't pre-fetch (e.g. Gmail).
      // The email template includes both a {{ .Token }} 6-digit code and the
      // {{ .ConfirmationURL }} link; users pick whichever method works.
      emailRedirectTo: `${origin}/auth/callback`,
      data: parsed.data.fullName ? { full_name: parsed.data.fullName } : undefined,
    },
  });

  if (error) {
    return { phase: "error", message: error.message };
  }

  return {
    phase: "code_sent",
    email: parsed.data.email,
    message: `Code sent to ${parsed.data.email}.`,
  };
}

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export async function verifyOtp(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    const email = (formData.get("email") as string) || "";
    return {
      phase: "code_sent",
      email,
      message: parsed.error.issues[0]?.message ?? "Invalid code.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "email",
  });

  if (error) {
    return {
      phase: "code_sent",
      email: parsed.data.email,
      message: error.message,
    };
  }

  redirect("/");
}
