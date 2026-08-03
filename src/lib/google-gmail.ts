import { googleAccessToken, googleWorkspaceConfiguration } from "@/lib/google-workspace";

const gmailScope = "https://www.googleapis.com/auth/gmail.compose";
let delegatedTokenCache: { sender: string; token: string; expiresAt: number } | null = null;

function gmailSender() {
  return (process.env.GOOGLE_GMAIL_SENDER ?? "").trim().replace(/^["']|["']$/g, "");
}

export function googleGmailConfiguration() {
  const sender = gmailSender();
  return {
    configured: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender),
    sender,
    missing: sender ? [] : ["GOOGLE_GMAIL_SENDER"],
  };
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function gmailRawMessage(input: {
  sender: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
}) {
  const headers = [
    `From: ${cleanHeader(input.sender)}`,
    `To: ${input.to.map(cleanHeader).join(", ")}`,
    input.cc?.length ? `Cc: ${input.cc.map(cleanHeader).join(", ")}` : null,
    input.bcc?.length ? `Bcc: ${input.bcc.map(cleanHeader).join(", ")}` : null,
    `Subject: ${cleanHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ].filter(Boolean);
  const plainBody = input.body.replace(/\r?\n/g, "\r\n");
  let message: string;
  if (input.html) {
    const boundary = `besc-${Buffer.from(input.subject).toString("base64url").slice(0, 24)}`;
    message = `${headers.join("\r\n")}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`
      + `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${plainBody}\r\n`
      + `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${input.html.replace(/\r?\n/g, "\r\n")}\r\n`
      + `--${boundary}--`;
  } else {
    message = `${headers.join("\r\n")}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${plainBody}`;
  }
  return Buffer.from(message, "utf8")
    .toString("base64url");
}

async function delegatedGmailToken() {
  const config = googleGmailConfiguration();
  if (!config.configured) throw new Error("GOOGLE_GMAIL_SENDER ontbreekt of is geen geldig e-mailadres.");
  if (delegatedTokenCache?.sender === config.sender && delegatedTokenCache.expiresAt > Date.now() + 60_000) {
    return delegatedTokenCache.token;
  }
  const workspace = googleWorkspaceConfiguration();
  const cloudToken = await googleAccessToken();
  const now = Math.floor(Date.now() / 1000);
  const signResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(workspace.email)}:signJwt`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${cloudToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: JSON.stringify({
          iss: workspace.email,
          sub: config.sender,
          scope: gmailScope,
          aud: "https://oauth2.googleapis.com/token",
          iat: now,
          exp: now + 3_600,
        }),
      }),
      cache: "no-store",
    },
  );
  const signed = await signResponse.json() as { signedJwt?: string; error?: { message?: string } };
  if (!signResponse.ok || !signed.signedJwt) {
    throw new Error(signed.error?.message || "Google kon het gedelegeerde Gmail-token niet ondertekenen.");
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signed.signedJwt,
    }),
    cache: "no-store",
  });
  const result = await tokenResponse.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || "Gmail-domeindelegatie is niet geautoriseerd.");
  }
  delegatedTokenCache = {
    sender: config.sender,
    token: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3_600) * 1_000,
  };
  return result.access_token;
}

async function gmailJson<T>(path: string, init: RequestInit) {
  const token = await delegatedGmailToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Gmail API-fout (${response.status}).`);
  return result;
}

export async function saveGmailDraft(input: {
  draftId?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
}) {
  const sender = googleGmailConfiguration().sender;
  const payload = { message: { raw: gmailRawMessage({ ...input, sender }) } };
  return gmailJson<{ id: string; message?: { id?: string; threadId?: string } }>(
    input.draftId ? `drafts/${encodeURIComponent(input.draftId)}` : "drafts",
    { method: input.draftId ? "PUT" : "POST", body: JSON.stringify(payload) },
  );
}

export async function sendGmailDraft(draftId: string) {
  return gmailJson<{ id: string; threadId?: string }>("drafts/send", {
    method: "POST",
    body: JSON.stringify({ id: draftId }),
  });
}
