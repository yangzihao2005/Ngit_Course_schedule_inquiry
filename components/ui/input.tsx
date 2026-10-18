import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[3px] border border-rule bg-sheet px-3 text-[13px] text-ink transition-colors",
        "placeholder:text-muted/70",
        "focus-visible:outline-none focus-visible:border-indigo focus-visible:ring-2 focus-visible:ring-indigo/25",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-[3px] border border-rule bg-sheet px-3 py-2 text-[13px] text-ink transition-colors",
        "placeholder:text-muted/70",
        "focus-visible:outline-none focus-visible:border-indigo focus-visible:ring-2 focus-visible:ring-indigo/25",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}
