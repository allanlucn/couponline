import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let signingIn: Promise<string> | null = null;

export function ensureAnon(): Promise<string> {
  if (signingIn) return signingIn;
  signingIn = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) return data.session.user.id;
    const { data: signed, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return signed.user!.id;
  })();
  return signingIn;
}

export function useAnonSession() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    ensureAnon().then(setUid).catch(() => setUid(null));
  }, []);
  return uid;
}
