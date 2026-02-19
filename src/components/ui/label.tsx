import * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-base font-medium leading-none text-zinc-800", className)}
      {...props}
    />
  );
}

export { Label };
