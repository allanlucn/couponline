import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const publishableKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const enabled = Boolean(url && publishableKey);
const integration = enabled ? describe : describe.skip;

integration("Supabase multiplayer security smoke tests", () => {
  test("an anonymous authenticated client cannot read canonical game states", async () => {
    const client = createClient(url!, publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: authError } = await client.auth.signInAnonymously();
    expect(authError).toBeNull();

    const { data, error } = await client.from("game_states").select("room_id,state").limit(1);
    expect(data ?? []).toEqual([]);
    if (error) expect(error.message.length).toBeGreaterThan(0);
  });

  test("public room snapshots do not contain known secret keys", async () => {
    const client = createClient(url!, publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: authError } = await client.auth.signInAnonymously();
    expect(authError).toBeNull();

    const { data, error } = await client.from("rooms").select("state").limit(100);
    expect(error).toBeNull();
    const snapshots = JSON.stringify(data ?? []);
    for (const secret of ["deck", "rngSeed", "exchangeCards", "hand"]) {
      expect(snapshots).not.toContain(JSON.stringify(secret));
    }
  });
});
