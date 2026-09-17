import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portal do Patrocinador",
  description: "Acompanhe suas propostas e contratos de patrocínio com o Coritiba FC.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
