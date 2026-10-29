"use client";
import type { ReactNode } from "react";
import { AppShell } from "./saqta-shell";
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
