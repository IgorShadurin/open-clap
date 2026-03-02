"use client";

import Link from "next/link";
import { BookText, List, Settings } from "lucide-react";

import { Button } from "../ui/button";

interface HeaderNavLinksProps {
  className?: string;
}

export function HeaderNavLinks({ className }: HeaderNavLinksProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`.trim()}>
      <Button asChild type="button" variant="outline">
        <Link href="/skills">
          <BookText className="h-4 w-4" />
          <span className="sr-only">Skills</span>
        </Link>
      </Button>
      <Button asChild type="button" variant="outline">
        <Link href="/lists">
          <List className="h-4 w-4" />
          <span className="sr-only">Lists</span>
        </Link>
      </Button>
      <Button asChild type="button" variant="outline">
        <Link href="/settings">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Link>
      </Button>
    </div>
  );
}
