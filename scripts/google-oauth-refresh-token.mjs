import http from "node:http";
import crypto from "node:crypto";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
const port = 8787;
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
const scopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.compose",
];

if (!clientId || !clientSecret) {
  console.error("Zet GOOGLE_OAUTH_CLIENT_ID en GOOGLE_OAUTH_CLIENT_SECRET eerst in je tijdelijke shellomgeving.");
  process.exit(1);
}

const state = crypto.randomBytes(24).toString("hex");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  access_type: "offline",
  prompt: "consent",
  scope: scopes.join(" "),
  state,
}).toString();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", redirectUri);
  if (url.pathname !== "/oauth2callback") {
    response.writeHead(404).end();
    return;
  }
  if (url.searchParams.get("state") !== state) {
    response.writeHead(400).end("Ongeldige OAuth-state.");
    server.close();
    process.exit(1);
  }
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    response.writeHead(400).end(`Google OAuth is geannuleerd: ${error ?? "geen code"}.`);
    server.close();
    process.exit(1);
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const result = await tokenResponse.json();
  if (!tokenResponse.ok || !result.refresh_token) {
    response.writeHead(502).end("Tokenuitwisseling mislukt. Controleer de terminal.");
    console.error(JSON.stringify(result));
    server.close();
    process.exit(1);
  }
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Autorisatie gelukt. Je mag dit venster sluiten.");
  console.log("GOOGLE_OAUTH_REFRESH_TOKEN=" + result.refresh_token);
  server.close();
});

server.listen(port, "127.0.0.1", () => {
  console.log("Open deze URL in je browser en geef toestemming met het speciale Workspace-account:\n");
  console.log(authUrl.toString());
});
