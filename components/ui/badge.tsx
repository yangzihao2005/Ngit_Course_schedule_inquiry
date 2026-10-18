import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-px text-[11px] leading-[1.5] whitespace-nowrap",
  {
    variants: {
      variant: {
        /* 教务源 */
        indigo: "border-indigo/35 text-indigo",
        /* 截图解析 / 校对红 */
        vermilion: "border-vermilion/35 text-vermilion",
        ink: "border-ink/25 text-ink",
        quiet: "border-rule text-muted",
      },
    },
    defaultVariants: {
      variant: "quiet",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
