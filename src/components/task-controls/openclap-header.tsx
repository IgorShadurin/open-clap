"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { OpenClapLogo } from "./openclap-logo";

interface OpenClapHeaderProps {
  rightSlot?: ReactNode;
}

export function OpenClapHeader({ rightSlot }: OpenClapHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        className="inline-flex items-center gap-2 text-xl font-semibold transition-opacity hover:opacity-80"
        href="/"
      >
        <OpenClapLogo />
        OpenClap
      </Link>
      {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
    </div>
  );
}
