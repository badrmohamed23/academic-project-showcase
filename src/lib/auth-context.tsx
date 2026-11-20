import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { JsonSession, JsonUser } from "@/lib/json-db";

export type AppRole = "student" | "instructor" | "employer" | "admin";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  is_active: boolean;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: JsonUser | null;
  session: JsonSession | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<JsonSession | null>(null);
  const [user, setUser] = useState<JsonUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadExtras = async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setRole(null);
      return;
    }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile((p as Profile | null) ?? null);
    setRole((r?.role as AppRole | undefined) ?? null);
  };

  useEffect(() => {
    // Only use onAuthStateChange — it fires INITIAL_SESSION on mount,
    // then SIGNED_IN/SIGNED_OUT on changes. No need for getSession separately.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt: string, s: any) => {
      const typedSession = s as JsonSession | null;
      setSession(typedSession);
      setUser(typedSession?.user ?? null);
      void loadExtras(typedSession?.user?.id).finally(() => {
        setLoading(false);
      });
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      role,
      loading,
      refresh: () => loadExtras(user?.id),
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setRole(null);
      },
    }),
    [user, session, profile, role, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}