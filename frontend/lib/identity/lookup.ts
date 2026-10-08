type Sb = any;

/** The email behind a Supabase auth user id (agent runs store the auth id, not the platform user id). */
export async function emailForAuthUser(sb: Sb, authId: string | null | undefined): Promise<string | null> {
  if (!authId) return null;
  try {
    const { data } = await sb.auth.admin.getUserById(authId);
    return data?.user?.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
