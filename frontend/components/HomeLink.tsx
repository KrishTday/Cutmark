"use client";

import Link from "next/link";
import type { PropsWithChildren } from "react";

export default function HomeLink({ children, className }: PropsWithChildren<{ className: string }>) {
  return <Link
    href="/"
    className={className}
    aria-label="Cutmark home"
    onClick={(event) => {
      event.preventDefault();
      window.location.reload();
    }}
  >
    {children}
  </Link>;
}
