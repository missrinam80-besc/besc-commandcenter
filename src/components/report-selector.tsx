"use client";

import { useRouter } from "next/navigation";

type ReportOption = {
  id: string;
  label: string;
  meta?: string | null;
};

export function ReportSelector({
  label,
  placeholder,
  basePath,
  options,
}: {
  label: string;
  placeholder: string;
  basePath: string;
  options: ReportOption[];
}) {
  const router = useRouter();
  return (
    <label>
      {label}
      <select
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) router.push(`${basePath}/${event.target.value}`);
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option value={option.id} key={option.id}>
            {option.meta ? `${option.label} - ${option.meta}` : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
