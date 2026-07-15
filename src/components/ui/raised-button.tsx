/**
 * Adapted from gaia-ui's raised-button (MIT, Copyright (c) 2026 The Experience Company).
 * See LICENSES/gaia-ui-MIT.txt and /NOTICE. Simplified to be self-contained (the original's
 * dynamic per-color contrast helper was dropped) and mapped onto Otto's shadcn tokens.
 *
 * Otto's hero surfaces stay deliberately flat for the Notion/Sheets aesthetic; this raised
 * treatment is kept available for CP2 surfaces that want a primary call-to-action with depth.
 */
"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const raisedButtonVariants = cva(
  "relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap border border-primary/50 bg-primary text-sm font-medium text-primary-foreground subpixel-antialiased shadow-md transition-transform duration-200 before:absolute before:inset-0 before:border-t before:border-white/40 before:bg-gradient-to-b before:from-white/20 before:to-transparent hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-10 rounded-xl px-4 py-2 before:rounded-xl",
        sm: "h-9 rounded-lg px-3 before:rounded-lg",
        lg: "h-11 rounded-lg px-8 before:rounded-lg",
        icon: "h-10 w-10 rounded-xl before:rounded-xl",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface RaisedButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof raisedButtonVariants> {}

const RaisedButton = React.forwardRef<HTMLButtonElement, RaisedButtonProps>(
  ({ className, size, ...props }, ref) => (
    <button ref={ref} className={cn(raisedButtonVariants({ size, className }))} {...props} />
  ),
);
RaisedButton.displayName = "RaisedButton";

export { RaisedButton, raisedButtonVariants };
