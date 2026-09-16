import { AppShell } from "@/components/app-shell";
import ImportForm from "./import-form";

export default function Page() {
  return <AppShell active="CSV-import"><div className="module-body"><ImportForm /></div></AppShell>;
}
