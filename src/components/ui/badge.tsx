import * as React from "react";

import { cn } from "@/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-black/20 px-2.5 py-1 text-sm font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
