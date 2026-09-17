import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "clay-pill bg-primary/20 text-primary border-primary/30 shadow-[0_4px_12px_-4px_var(--primary-glow)]",
        secondary:
          "clay-pill bg-elevated text-secondary-foreground border-border",
        destructive:
          "clay-pill bg-destructive/20 text-critical border-destructive/30 shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--destructive)_50%,transparent)]",
        outline: "clay-pill text-foreground border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
