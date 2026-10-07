import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, key === "nieuw" && value === "1" ? "social" : value);
  }
  redirect(`/app/integraties${params.size ? `?${params}` : ""}`);
}
