import type { ReactNode } from "react";
import { getAppShellContext } from "@/lib/app-shell-context";
import { AppShellPageContext } from "@/components/persistent-app-shell";

// Page metadata updates the persistent layout without remounting its navigation.
export async function AppShell({ children, active = "Home", name, role }: {
  children: ReactNode; active?: string; name?: string; role?: string;
}) {
  const context = await getAppShellContext();
  const data = { ...context, name: name || context.name, role: role || context.role };
  return <><AppShellPageContext data={data} active={active}/>{children}</>;
}
