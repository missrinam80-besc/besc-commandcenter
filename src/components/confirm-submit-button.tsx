"use client";

import type { ButtonHTMLAttributes } from "react";

export function ConfirmSubmitButton({
  message,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <button
      {...props}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    />
  );
}
