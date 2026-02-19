import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        className={cn(
          "flex h-10 w-full rounded-md border border-black/20 bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
