import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badges carry one of two jobs: a neutral fact, or a severity. Severity styling
 * lives in the .sev-chip component class, which derives its border, tint and
 * text from a single --sev value so every level passes contrast in both themes.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium leading-normal",
  {
    variants: {
      variant: {
        neutral: "border border-rule bg-transparent px-2 py-0.5 text-muted-foreground",
        solid: "bg-foreground px-2 py-0.5 text-background",
        contained: "sev sev-contained sev-chip",
        elevated: "sev sev-elevated sev-chip",
        breach: "sev sev-breach sev-chip",
        total: "sev sev-total sev-chip",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
