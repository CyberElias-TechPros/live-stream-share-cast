import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ease-out-expo disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  {
    variants: {
      variant: {
        default:
          "bg-text text-bg hover:bg-white shadow-[0_1px_0_0_hsl(0_0%_100%/0.15)_inset]",
        live: "live-gradient text-white font-semibold hover:brightness-110 hover:shadow-[0_0_24px_-4px_hsl(var(--live)/0.55)]",
        accent:
          "accent-gradient text-white font-semibold hover:brightness-110 hover:shadow-[0_0_24px_-4px_hsl(var(--accent)/0.55)]",
        outline:
          "border border-line-strong bg-transparent text-text hover:border-text-faint hover:bg-panel-2",
        ghost: "text-text-muted hover:bg-panel-2 hover:text-text",
        danger:
          "border border-live/30 bg-live/10 text-live hover:bg-live/20",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
