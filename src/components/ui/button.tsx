import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary via-primary to-[color-mix(in_oklab,var(--primary)_82%,black)] text-primary-foreground border border-primary/40 shadow-[0_10px_24px_-8px_var(--primary-glow),0_1.5px_0_0_rgba(255,255,255,0.25)_inset,0_-2px_4px_0_rgba(0,0,0,0.35)_inset] hover:shadow-[0_14px_28px_-6px_var(--primary-glow),0_1.5px_0_0_rgba(255,255,255,0.35)_inset] hover:-translate-y-0.5",
        destructive:
          "bg-gradient-to-br from-destructive to-[color-mix(in_oklab,var(--destructive)_80%,black)] text-destructive-foreground border border-destructive/40 shadow-[0_10px_24px_-8px_color-mix(in_oklab,var(--destructive)_60%,transparent),0_1.5px_0_0_rgba(255,255,255,0.2)_inset,0_-2px_4px_0_rgba(0,0,0,0.3)_inset] hover:-translate-y-0.5",
        outline:
          "clay text-foreground border border-border hover:border-border-strong hover:bg-elevated/70 hover:-translate-y-0.5 shadow-clay",
        secondary:
          "clay bg-secondary text-secondary-foreground border border-border hover:bg-secondary/90 hover:-translate-y-0.5 shadow-clay",
        ghost: "hover:bg-elevated/60 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9.5 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-7 text-base",
        icon: "h-9.5 w-9.5 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
