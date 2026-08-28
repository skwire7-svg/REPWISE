import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * shadcn's button, with the variants repointed at Repwise's tokens.
 *
 * Upstream ships classes like `bg-primary` and `ring-offset-background`, none
 * of which exist here — this app defines its own palette in globals.css
 * (ink / surface / line / accent / content / muted). Mapping the variants once,
 * here, keeps every shadcn component that imports Button themed automatically
 * and follows the light/dark class on <html> without per-instance `dark:`.
 *
 * Focus styling is deliberately omitted: globals.css already applies a global
 * `:focus-visible` outline in the accent colour to every focusable element.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-[#0b0b0c] hover:bg-accent-soft",
        destructive: "bg-danger text-white hover:bg-danger/90",
        outline:
          "border border-line bg-surface/70 text-content hover:border-accent/50 hover:bg-surface-2",
        secondary: "bg-surface-2 text-content hover:bg-surface-2/70",
        ghost: "text-muted hover:bg-surface-2 hover:text-content",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
