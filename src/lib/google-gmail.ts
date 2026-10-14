import { googleAccessToken } from "@/lib/google-workspace";

const gmailScope = "https://www.googleapis.com/auth/gmail.compose";

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

async function delegatedGmailToken(signal?:AbortSignal) {
  const config = googleGmailConfiguration();
  if (!config.configured) throw new Error("GOOGLE_GMAIL_SENDER ontbreekt of is geen geldig e-mailadres.");
  return googleAccessToken({ scopes: [gmailScope],signal });
}

async function gmailJson<T>(path: string, init: RequestInit) {
  const token = await delegatedGmailToken(init.signal??undefined);
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
},signal?:AbortSignal) {
  const sender = googleGmailConfiguration().sender;
  const payload = { message: { raw: gmailRawMessage({ ...input, sender }) } };
  return gmailJson<{ id: string; message?: { id?: string; threadId?: string } }>(
    input.draftId ? `drafts/${encodeURIComponent(input.draftId)}` : "drafts",
    { method: input.draftId ? "PUT" : "POST", body: JSON.stringify(payload),signal },
  );
}

export async function sendGmailDraft(draftId: string,signal?:AbortSignal) {
  return gmailJson<{ id: string; threadId?: string }>("drafts/send", {
    method: "POST",
    body: JSON.stringify({ id: draftId }),
    signal,
  });
}
