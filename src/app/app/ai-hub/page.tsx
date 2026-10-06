import Link from "next/link";
import { Bot, Clock3, FileText, TriangleAlert } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { runGeneration, savePrompt } from "./actions";

type Query = Record<string, string | undefined>;
type Generation = {
  id: string;
  input_text: string;
  output_text: string | null;
  error_message: string | null;
  status: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  ai_prompt_templates: { name: string } | null;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const organizationId = membership.organization_id;
  const manager = ["admin", "board"].includes(membership.role);
  const [{ data: prompts }, { data: generationRows }] = await Promise.all([
    supabase
      .from("ai_prompt_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("ai_generations")
      .select(
        "id,input_text,output_text,error_message,status,model,input_tokens,output_tokens,created_at,ai_prompt_templates(name)",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const generations = (generationRows ?? []) as unknown as Generation[];
  const selected = generations.find((item) => item.id === query.resultaat);
  const gatewayConfigured = Boolean(
    process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY,
  );

  return (
    <AppShell active="AI Hub">
      <header className="topbar module-top">
        <div>
          <p>AI & CONTENTAUTOMATISERING</p>
          <h1>AI Hub</h1>
        </div>
        {manager && (
          <Link className="primary" href="?nieuw=prompt">
            Nieuwe prompt
          </Link>
        )}
      </header>
      <div className="module-body">
        {manager && <p><Link href="/app/ai-hub/agents">BESC-agentopdrachten en ontvangen resultaten</Link></p>}
        <p className="lead">
          Centraliseer herbruikbare prompts, modelkeuzes en generatiehistoriek
          voor BESC.
        </p>
        {query.fout && (
          <div className="error-note">
            De actie is mislukt ({query.fout}).
            {selected?.error_message && <span> {selected.error_message}</span>}
          </div>
        )}
        {query.succes === "prompt" && (
          <div className="success">Prompt opgeslagen.</div>
        )}
        {query.succes === "gegenereerd" && (
          <div className="success">
            De AI-uitvoer is gegenereerd en opgeslagen.
          </div>
        )}
        {!gatewayConfigured && (
          <div className="ai-setup-warning">
            <TriangleAlert />
            <div>
              <strong>AI Gateway nog niet geconfigureerd</strong>
              <span>
                Voeg een VERCEL_OIDC_TOKEN of AI_GATEWAY_API_KEY toe om
                generaties uit te voeren.
              </span>
            </div>
          </div>
        )}

        {query.nieuw === "prompt" && manager && (
          <section className="form-card">
            <div className="form-heading">
              <h2>Nieuwe prompttemplate</h2>
              <Link href="?">Sluiten</Link>
            </div>
            <form action={savePrompt}>
              <label>
                Naam
                <input name="name" required />
              </label>
              <div className="form-row">
                <label>
                  Categorie
                  <input name="category" defaultValue="content" />
                </label>
                <label>
                  Model
                  <select name="preferred_model">
                    <option value="openai/gpt-5.4">OpenAI GPT-5.4</option>
                    <option value="anthropic/claude-sonnet-4.6">
                      Claude Sonnet 4.6
                    </option>
                  </select>
                </label>
                <label>
                  Status
                  <select name="status">
                    <option value="draft">Concept</option>
                    <option value="active">Actief</option>
                    <option value="archived">Gearchiveerd</option>
                  </select>
                </label>
              </div>
              <label>
                Beschrijving
                <textarea name="description" rows={2} />
              </label>
              <label>
                Systeeminstructie
                <textarea name="system_prompt" rows={5} />
              </label>
              <label>
                Prompttemplate
                <textarea
                  name="prompt_template"
                  rows={10}
                  required
                  placeholder="Gebruik {{input}} waar de invoer moet komen."
                />
              </label>
              <div className="form-actions">
                <button className="primary">Opslaan</button>
              </div>
            </form>
          </section>
        )}

        <section className="ai-workspace">
          <div>
            <section className="form-card">
              <div className="form-heading">
                <h2>Nieuwe generatie</h2>
                <Bot size={18} />
              </div>
              <form action={runGeneration}>
                <label>
                  Prompttemplate
                  <select name="template_id">
                    <option value="">Vrije opdracht</option>
                    {(prompts ?? [])
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Model
                  <select name="model">
                    <option value="openai/gpt-5.4">OpenAI GPT-5.4</option>
                    <option value="anthropic/claude-sonnet-4.6">
                      Claude Sonnet 4.6
                    </option>
                  </select>
                </label>
                <label>
                  Invoer
                  <textarea
                    name="input_text"
                    rows={10}
                    required
                    placeholder="Beschrijf wat je wilt laten maken..."
                  />
                </label>
                <div className="form-actions">
                  <button className="primary" disabled={!gatewayConfigured}>
                    Genereren
                  </button>
                </div>
              </form>
            </section>
            <section className="form-card">
              <div className="form-heading">
                <h2>Promptbibliotheek</h2>
                <span>{prompts?.length ?? 0}</span>
              </div>
              <div className="ai-prompt-list">
                {(prompts ?? []).map((item) => (
                  <article key={item.id}>
                    <FileText />
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.category} · {item.preferred_model} · {item.status}
                      </span>
                    </div>
                  </article>
                ))}
                {!prompts?.length && (
                  <p className="empty-inline">Nog geen prompts.</p>
                )}
              </div>
            </section>
          </div>

          <div>
            {selected?.output_text && (
              <section className="form-card ai-result-card">
                <div className="form-heading">
                  <h2>Gegenereerd resultaat</h2>
                  <span>
                    {selected.input_tokens ?? 0} in ·{" "}
                    {selected.output_tokens ?? 0} uit
                  </span>
                </div>
                <Message from="assistant">
                  <MessageContent>
                    <MessageResponse>{selected.output_text}</MessageResponse>
                  </MessageContent>
                </Message>
              </section>
            )}
            <section className="form-card">
              <div className="form-heading">
                <h2>Generatiehistoriek</h2>
                <span>{generations.length}</span>
              </div>
              <div className="ai-generation-list">
                {generations.map((item) => (
                  <article
                    key={item.id}
                    className={query.resultaat === item.id ? "selected" : undefined}
                  >
                    <Clock3 />
                    <div>
                      <Link href={`?resultaat=${item.id}`}>
                        <strong>
                          {item.ai_prompt_templates?.name || "Vrije opdracht"}
                        </strong>
                      </Link>
                      <p>{item.input_text}</p>
                      <span>
                        {item.model} · {item.status} ·{" "}
                        {new Date(item.created_at).toLocaleString("nl-BE")}
                      </span>
                    </div>
                  </article>
                ))}
                {!generations.length && (
                  <p className="empty-inline">Nog geen generaties.</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
