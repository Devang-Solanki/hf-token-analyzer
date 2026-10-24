import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Tabs with the keyboard and screen-reader contract the pattern requires:
 * a tablist, roving tabindex, arrow/Home/End navigation, and panels wired
 * back to their trigger with aria-controls / aria-labelledby.
 */

interface TabsContextValue {
  baseId: string
  value: string
  onValueChange: (value: string) => void
  register: (value: string) => void
  order: string[]
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

function useTabs() {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error("useTabs must be used within a Tabs component")
  }
  return context
}

const triggerId = (baseId: string, value: string) => `${baseId}-trigger-${value}`
const panelId = (baseId: string, value: string) => `${baseId}-panel-${value}`

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, value, defaultValue, onValueChange, children, ...props }, ref) => {
    const baseId = React.useId()
    const [internalValue, setInternalValue] = React.useState(defaultValue || "")
    const orderRef = React.useRef<string[]>([])

    const currentValue = value !== undefined ? value : internalValue

    const handleValueChange = React.useCallback(
      (newValue: string) => {
        if (value === undefined) {
          setInternalValue(newValue)
        }
        onValueChange?.(newValue)
      },
      [value, onValueChange]
    )

    const register = React.useCallback((tabValue: string) => {
      if (!orderRef.current.includes(tabValue)) {
        orderRef.current.push(tabValue)
      }
    }, [])

    const context = React.useMemo(
      () => ({
        baseId,
        value: currentValue,
        onValueChange: handleValueChange,
        register,
        order: orderRef.current,
      }),
      [baseId, currentValue, handleValueChange, register]
    )

    return (
      <TabsContext.Provider value={context}>
        <div ref={ref} className={className} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { label: string }
>(({ className, label, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    aria-label={label}
    className={cn("flex flex-wrap items-stretch gap-1", className)}
    {...props}
  />
))
TabsList.displayName = "TabsList"

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, onKeyDown, ...props }, ref) => {
    const { baseId, value: selectedValue, onValueChange, register, order } = useTabs()
    const isSelected = selectedValue === value

    React.useEffect(() => {
      register(value)
    }, [register, value])

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented) return

      const index = order.indexOf(value)
      if (index === -1) return

      let next: string | undefined
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = order[(index + 1) % order.length]
          break
        case "ArrowLeft":
        case "ArrowUp":
          next = order[(index - 1 + order.length) % order.length]
          break
        case "Home":
          next = order[0]
          break
        case "End":
          next = order[order.length - 1]
          break
        default:
          return
      }

      if (!next) return
      event.preventDefault()
      onValueChange(next)
      const target = document.getElementById(triggerId(baseId, next))
      target?.focus()
    }

    return (
      <button
        ref={ref}
        id={triggerId(baseId, value)}
        type="button"
        role="tab"
        aria-selected={isSelected}
        aria-controls={panelId(baseId, value)}
        tabIndex={isSelected ? 0 : -1}
        onClick={() => onValueChange(value)}
        onKeyDown={handleKeyDown}
        className={cn(
          "px-3 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.1em] transition-colors",
          isSelected
            ? "accent-fill"
            : "text-muted-foreground hover:text-accent-text",
          className
        )}
        {...props}
      />
    )
  }
)
TabsTrigger.displayName = "TabsTrigger"

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const { baseId, value: selectedValue } = useTabs()

    if (selectedValue !== value) {
      return null
    }

    return (
      <div
        ref={ref}
        id={panelId(baseId, value)}
        role="tabpanel"
        aria-labelledby={triggerId(baseId, value)}
        tabIndex={0}
        className={className}
        {...props}
      />
    )
  }
)
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
