// Helper utilities for messaging
import { supabase } from "@/integrations/supabase/client";

/**
 * Start (or fetch) a 1-on-1 conversation between two users.
 * Conversations enforce user_a < user_b for uniqueness.
 */
export async function startConversation(meId: string, otherId: string): Promise<string | null> {
  if (meId === otherId) return null;
  const [a, b] = meId < otherId ? [meId, otherId] : [otherId, meId];
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_a", a)
    .eq("user_b", b)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user_a: a, user_b: b })
    .select("id")
    .single();
  if (error) return null;
  return (created.id as string) ?? null;
}
