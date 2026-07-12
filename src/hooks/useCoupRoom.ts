import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureAnon } from "@/lib/anon-auth";
import type { Character } from "@/game/types";

export type RoomRow = {
  id: string;
  code: string;
  status: "lobby" | "playing" | "finished";
  host_id: string | null;
  current_player_id: string | null;
  state: { deck?: Character[]; pending?: any; rngSeed?: number };
  winner_id: string | null;
};

export type PlayerRow = {
  id: string;
  room_id: string;
  anon_user_id: string;
  name: string;
  seat: number;
  coins: number;
  is_alive: boolean;
  revealed: Character[];
};

export type EventRow = {
  id: number;
  seq: number;
  type: string;
  payload: any;
  created_at: string;
};

export function useCoupRoom(code: string | undefined) {
  const [uid, setUid] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [myHand, setMyHand] = useState<Character[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  useEffect(() => {
    ensureAnon().then(setUid);
  }, []);

  useEffect(() => {
    if (!code || !uid) return;
    let mounted = true;
    (async () => {
      const { data: r } = await supabase.from("rooms").select("*").eq("code", code.toUpperCase()).maybeSingle();
      if (!mounted || !r) return;
      setRoom(r as any);
      const [{ data: ps }, { data: es }, { data: me }] = await Promise.all([
        supabase.from("players").select("*").eq("room_id", r.id).order("seat"),
        supabase.from("events").select("*").eq("room_id", r.id).order("seq"),
        supabase.from("players").select("*").eq("room_id", r.id).eq("anon_user_id", uid).maybeSingle(),
      ]);
      setPlayers((ps as any) ?? []);
      setEvents((es as any) ?? []);
      if (me) {
        setMyPlayerId(me.id);
        const { data: h } = await supabase.from("hands").select("cards").eq("player_id", me.id).maybeSingle();
        setMyHand(((h?.cards as Character[]) ?? []));
      }

      const ch = supabase
        .channel(`room:${r.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${r.id}` }, (payload) => {
          if (payload.new) setRoom(payload.new as any);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${r.id}` }, async () => {
          const { data } = await supabase.from("players").select("*").eq("room_id", r.id).order("seat");
          setPlayers((data as any) ?? []);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter: `room_id=eq.${r.id}` }, (payload) => {
          setEvents((prev) => [...prev, payload.new as any]);
        })
        .subscribe();

      // subscribe to own hand changes
      const hch = me
        ? supabase
            .channel(`hand:${me.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "hands", filter: `player_id=eq.${me.id}` }, (payload: any) => {
              if (payload.new?.cards) setMyHand(payload.new.cards);
            })
            .subscribe()
        : null;

      return () => {
        supabase.removeChannel(ch);
        if (hch) supabase.removeChannel(hch);
      };
    })();
    return () => {
      mounted = false;
    };
  }, [code, uid]);

  return { uid, room, players, events, myHand, myPlayerId };
}
