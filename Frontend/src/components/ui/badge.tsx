import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "secondary" | "destructive" | "outline";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
      {
        "border-transparent bg-primary text-primary-foreground": variant === "default",
        "border-transparent bg-secondary text-secondary-foreground": variant === "secondary",
        "border-transparent bg-destructive text-destructive-foreground": variant === "destructive",
        "text-foreground": variant === "outline",
      },
      className
    )}
    {...props}
  />
));
Badge.displayName = "Badge";

export { Badge };
