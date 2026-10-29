"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "./saqta-shell";
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The landing page owns its full-width header, sections and footer.
  if (pathname === "/") return children;
  return <AppShell>{children}</AppShell>;
}
