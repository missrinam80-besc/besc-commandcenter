import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/dashboard-data";

export default async function AppHome() { const data = await getDashboardData(); return <AppShell name={data.name} role={data.role}><Dashboard data={data}/></AppShell>; }
