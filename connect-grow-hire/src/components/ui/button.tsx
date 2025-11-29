import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: Purple gradient - INTENTIONAL USE
        default: "bg-gradient-to-br from-[hsl(var(--accent-from))] to-[hsl(var(--accent-to))] text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]",
        
        // Destructive: Keep for delete actions
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]",
        
        // Outline: Secondary style with border
        outline:
          "border border-[hsl(var(--border-medium))] bg-transparent hover:bg-[hsl(var(--bg-secondary))] hover:border-[hsl(var(--border-strong))]",
        
        // Secondary: Filled but not gradient
        secondary:
          "bg-[hsl(var(--bg-secondary))] text-[hsl(var(--text-primary))] border border-[hsl(var(--border-light))] hover:bg-[hsl(var(--bg-tertiary))] hover:border-[hsl(var(--border-medium))]",
        
        // Ghost: Minimal, no border
        ghost: "hover:bg-[hsl(var(--bg-secondary))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]",
        
        // Link: Text only
        link: "text-[hsl(var(--accent-solid))] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 rounded-[var(--radius-md)]",
        sm: "h-9 px-3 text-xs rounded-[var(--radius-md)]",
        lg: "h-11 px-8 text-base rounded-[var(--radius-md)]",
        icon: "h-10 w-10 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
