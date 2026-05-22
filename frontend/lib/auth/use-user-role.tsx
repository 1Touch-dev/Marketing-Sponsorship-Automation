"use client";

import * as React from "react";
import type { UserRole, PlatformUser } from "@/lib/auth/roles";

interface UserRoleContext {
  user: PlatformUser | null;
  role: UserRole | null;
  loading: boolean;
  refetch: () => void;
}

const Ctx = React.createContext<UserRoleContext>({
  user: null,
  role: null,
  loading: true,
  refetch: () => {},
});

export function UserRoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<PlatformUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetch = React.useCallback(() => {
    setLoading(true);
    window
      .fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUser(data?.user ?? null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetch();
  }, [fetch]);

  return (
    <Ctx.Provider value={{ user, role: user?.role ?? null, loading, refetch: fetch }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUserRole() {
  return React.useContext(Ctx);
}
