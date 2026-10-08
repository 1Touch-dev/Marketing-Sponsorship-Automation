import { getCurrentPlatformUser } from "@/lib/auth/server-permission";
import { externalActor, userActor, type Actor } from "./actor";

/**
 * The actor behind the current request's session, for routes that do not gate on a permission. A request
 * with no recognisable session is recorded as an external party, never as a person.
 */
export async function currentActor(fallbackLabel = "unauthenticated request"): Promise<Actor> {
  const user = await getCurrentPlatformUser();
  return user ? userActor(user) : externalActor(fallbackLabel);
}
