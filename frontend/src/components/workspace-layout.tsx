"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "./saqta-shell";

// The wrapper lives above page changes so the same sidebar remains mounted.
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const workspace = ["/forecast", "/save", "/about"].some(path => pathname === path || pathname.startsWith(path + "/"));
  return workspace ? <AppShell>{children}</AppShell> : children;
}
