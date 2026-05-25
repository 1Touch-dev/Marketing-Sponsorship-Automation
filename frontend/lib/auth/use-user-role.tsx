"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import type { UserRole, PlatformUser } from "@/lib/auth/roles";

interface UserRoleContext {
  user: PlatformUser | null;
  role: UserRole | null;
  loading: boolean;
  refetch: () => void;
  logout: () => Promise<void>;
}

const Ctx = React.createContext<UserRoleContext>({
  user: null,
  role: null,
  loading: true,
  refetch: () => {},
  logout: async () => {},
});

// Paths that never need auth (provider won't redirect from these)
const PUBLIC_PREFIXES = ["/login", "/proposals/view/", "/"];

export function UserRoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<PlatformUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPath = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p)
  );

  const fetchUser = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.fetch("/api/users/me");
      if (r.status === 401 || r.status === 403) {
        setUser(null);
        if (!isPublicPath) {
          router.replace(`/login?from=${encodeURIComponent(pathname)}`);
        }
        return;
      }
      if (r.ok) {
        const data = await r.json();
        setUser(data?.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [isPublicPath, pathname, router]);

  React.useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = React.useCallback(async () => {
    try {
      await window.fetch("/api/auth/logout", { method: "POST" });
    } catch { /* no-op */ }
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <Ctx.Provider value={{ user, role: user?.role ?? null, loading, refetch: fetchUser, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUserRole() {
  return React.useContext(Ctx);
}
