import { OperationalRecordDetail } from "@/components/operational-record-detail";
import { SponsorDocumentTools } from "@/components/sponsor-document-tools";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  return (
    <>
      <OperationalRecordDetail
        module="sponsors"
        params={Promise.resolve({ id })}
        searchParams={searchParams}
      />
      <SponsorDocumentTools partnerId={id} />
    </>
  );
}
