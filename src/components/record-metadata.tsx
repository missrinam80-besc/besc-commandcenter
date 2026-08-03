import type { ReactNode } from "react";

export type MetadataItem = {
  label: string;
  value: ReactNode;
  hint?: string;
};

export function RecordMetadata({ items }: { items: MetadataItem[] }) {
  return (
    <dl className="record-metadata">
      {items.map((item) => (
        <div key={item.label}>
          <dt title={item.hint}>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

