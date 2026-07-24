"use server";

import { generateText } from "ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";

const generationSchema = z.object({
  template_id: z.string().uuid().optional().or(z.literal("")),
  model: z.enum(["openai/gpt-5.4", "anthropic/claude-sonnet-4.6"]),
  input_text: z.string().trim().min(5).max(30000),
});

export async function savePrompt(formData: FormData) {
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      category: z.string().trim().min(2).max(80),
      description: z.string().trim().max(500).optional(),
      system_prompt: z.string().trim().max(5000).optional(),
      prompt_template: z.string().trim().min(10).max(20000),
      preferred_model: z.string().trim().min(3).max(120),
      status: z.enum(["draft", "active", "archived"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/ai-hub?fout=velden");

  const { supabase, user, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    redirect("/app/ai-hub?fout=rechten");
  }

  const { error } = await supabase.from("ai_prompt_templates").insert({
    organization_id: membership.organization_id,
    ...parsed.data,
    description: parsed.data.description || null,
    system_prompt: parsed.data.system_prompt || null,
    created_by: user.id,
  });
  if (error) redirect("/app/ai-hub?fout=opslaan");

  revalidatePath("/app/ai-hub");
  redirect("/app/ai-hub?succes=prompt");
}

export async function runGeneration(formData: FormData) {
  const parsed = generationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/ai-hub?fout=generatie");
  if (!process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY) {
    redirect("/app/ai-hub?fout=gateway");
  }

  const { supabase, user, membership } = await requireActiveMembership();
  const { template_id: templateId, model, input_text: inputText } = parsed.data;
  const provider = model.split("/")[0];
  let template: {
    system_prompt: string | null;
    prompt_template: string;
  } | null = null;

  if (templateId) {
    const { data, error } = await supabase
      .from("ai_prompt_templates")
      .select("system_prompt,prompt_template")
      .eq("id", templateId)
      .eq("organization_id", membership.organization_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .single();
    if (error || !data) redirect("/app/ai-hub?fout=template");
    template = data;
  }

  const prompt = template
    ? template.prompt_template.includes("{{input}}")
      ? template.prompt_template.replaceAll("{{input}}", inputText)
      : `${template.prompt_template}\n\nInvoer van de gebruiker:\n${inputText}`
    : inputText;

  const { data: generation, error: insertError } = await supabase
    .from("ai_generations")
    .insert({
      organization_id: membership.organization_id,
      template_id: templateId || null,
      provider,
      model,
      input_text: inputText,
      status: "running",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError || !generation) redirect("/app/ai-hub?fout=opslaan");

  try {
    const result = await generateText({
      model,
      system:
        template?.system_prompt ||
        "Je bent de professionele AI-assistent van BESC vzw. Antwoord helder, concreet en standaard in het Nederlands.",
      prompt,
      providerOptions: {
        gateway: {
          user: user.id,
          tags: ["feature:besc-ai-hub"],
        },
      },
    });

    const { error: updateError } = await supabase
      .from("ai_generations")
      .update({
        output_text: result.text,
        status: "completed",
        input_tokens: result.usage.inputTokens ?? null,
        output_tokens: result.usage.outputTokens ?? null,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", generation.id)
      .eq("organization_id", membership.organization_id);
    if (updateError) redirect("/app/ai-hub?fout=resultaat");
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 1000) : "Onbekende AI-fout";
    await supabase
      .from("ai_generations")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generation.id)
      .eq("organization_id", membership.organization_id);
    redirect(`/app/ai-hub?fout=uitvoering&resultaat=${generation.id}`);
  }

  revalidatePath("/app/ai-hub");
  redirect(`/app/ai-hub?succes=gegenereerd&resultaat=${generation.id}`);
}
