"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      closeButton
      expand
      position="top-right"
      richColors
      visibleToasts={4}
      {...props}
    />
  );
}

export { Toaster };
