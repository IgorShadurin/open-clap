import * as React from "react";

import { cn } from "@/lib/utils";

function Select({
  children,
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-md border border-black/20 bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
