import { OperationalModulePage } from "@/components/operational-module-page";
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <OperationalModulePage module="campagnes" searchParams={searchParams}/>;}
