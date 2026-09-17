"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthenticatedHome } from "@/lib/auth-destination";

async function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ||
    (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    redirect("/login?error=velden");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/login?error=inloggegevens");
  }

  redirect(await resolveAuthenticatedHome(supabase, data.user.id));
}

export async function registerWithPassword(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm_password") || "");
  if (!email || password.length < 8) redirect("/login?error=wachtwoord-eisen#registreren");
  if (password !== confirm) redirect("/login?error=wachtwoorden-verschillen#registreren");
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/app` } });
  if (error) redirect(`/login?error=${error.code === "user_already_exists" ? "account-bestaat" : "registratie"}#registreren`);
  if (data.user && data.user.identities?.length === 0) redirect("/login?error=account-bestaat#registreren");
  redirect("/login?registratie=1");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) redirect("/login?error=velden#wachtwoord-vergeten");
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/auth/callback?next=/wachtwoord-instellen` });
  if (error) redirect("/login?error=recovery#wachtwoord-vergeten");
  redirect("/login?recovery=1");
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) redirect("/login?error=velden");
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl}/auth/callback?next=/app` } });
  redirect(error ? "/login?error=magic-link" : "/login?sent=1");
}

export async function signInWithDiscord() {
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: `${siteUrl}/auth/callback?next=/app` } });
  if (error || !data.url) redirect("/login?error=discord");
  redirect(data.url);
}
