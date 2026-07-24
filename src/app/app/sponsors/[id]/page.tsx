import { OperationalRecordDetail } from "@/components/operational-record-detail";
export default function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){return <OperationalRecordDetail module="sponsors" params={params} searchParams={searchParams}/>;}
