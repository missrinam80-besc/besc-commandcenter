export type MetaTokenDiagnostics = { scopes: string[]; tokenType: string; missingScopes: string[] };

// Server callers supply the secret; only non-secret diagnostics leave this function.
export async function inspectMetaToken(
  accessToken: string,
  config: { appId: string; appSecret: string; apiVersion: string },
  requiredScopes: readonly string[],
  request: typeof fetch = fetch,
): Promise<MetaTokenDiagnostics> {
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  let body: { data?: { is_valid?: boolean; app_id?: string; type?: string; scopes?: string[] } };
  try {
    const response = await request(url.toString(), {
      headers: { Authorization: `Bearer ${config.appId}|${config.appSecret}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    body = await response.json();
  } catch {
    // Never propagate URLs, response bodies or network errors containing tokens.
    throw new Error("Meta-tokencontrole niet beschikbaar. De toegekende rechten konden niet worden geverifieerd.");
  }
  if (!body.data?.is_valid) throw new Error("Het Meta-toegangstoken is ongeldig of verlopen. Koppel opnieuw via Meta.");
  if (body.data.app_id !== config.appId) throw new Error("Het Meta-token hoort bij een andere app. Koppel opnieuw via Meta.");
  const scopes = [...new Set((body.data.scopes ?? []).filter((scope) => typeof scope === "string"))].sort();
  return {
    scopes,
    tokenType: body.data.type ?? "onbekend",
    missingScopes: requiredScopes.filter((scope) => !scopes.includes(scope)),
  };
}

export function metaPermissionSummary(diagnostics: MetaTokenDiagnostics) {
  return `Tokentype: ${diagnostics.tokenType}. ${diagnostics.missingScopes.length
    ? `Ontbrekende tokenrechten: ${diagnostics.missingScopes.join(", ")}. Koppel opnieuw via Meta.`
    : "De vereiste tokenrechten zijn aanwezig; dit bewijst nog geen toegang tot Insights voor dit account. Controleer de accounttoegang en het toegangsniveau van de app bij Meta."}`;
}
