import { Suspense, type ReactNode } from "react";
import { ShellTopBar } from "@/components/shell/ShellTopBar";
import { Sidebar } from "@/components/shell/Sidebar";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-shell">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-shell">
        <Suspense fallback={<div className="h-14 shrink-0 border-b border-transparent bg-transparent md:h-12" />}>
          <ShellTopBar />
        </Suspense>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-shell">{children}</main>
      </div>
    </div>
  );
}
