import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Proposta de Patrocínio",
  description: "Proposta de patrocínio esportivo gerada por IA.",
};

export const dynamic = "force-dynamic";

/**
 * Public proposal share layout — no sidebar, no ContentWrapper, full-screen.
 * NOTE: In Next.js App Router, route group layouts cannot re-define <html>/<body>.
 * The root layout provides the HTML shell; this layout just removes the sidebar
 * by rendering children directly without the app shell.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
