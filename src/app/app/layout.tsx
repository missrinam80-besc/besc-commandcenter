import type { ReactNode } from "react";
import { getAppShellContext } from "@/lib/app-shell-context";
import { PersistentAppShell } from "@/components/persistent-app-shell";

export const dynamic = "force-dynamic";

export default async function InternalAppLayout({ children }: { children: ReactNode }) {
  const initialData = await getAppShellContext();
  return <PersistentAppShell initialData={initialData}>{children}</PersistentAppShell>;
}
