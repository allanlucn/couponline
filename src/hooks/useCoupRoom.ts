import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensureAnon } from "@/lib/anon-auth";
import type { Character } from "@/game/types";

export type RoomRow = {
  id: string;
  code: string;
  status: "lobby" | "playing" | "finished";
  host_id: string | null;
  current_player_id: string | null;
  state: {
    pending?: any;
    actionTimeoutSeconds?: number;
    deadlineAt?: string;
    version?: number;
  };
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

type PrivateHandRow = {
  cards: Character[];
  pending_cards: Character[];
};

export function useCoupRoom(code: string | undefined) {
  const [uid, setUid] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [myHand, setMyHand] = useState<Character[]>([]);
  const [myPendingCards, setMyPendingCards] = useState<Character[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [identityResolved, setIdentityResolved] = useState(false);

  useEffect(() => {
    ensureAnon().then(setUid);
  }, []);

  useEffect(() => {
    setRoom(null);
    setPlayers([]);
    setEvents([]);
    setMyHand([]);
    setMyPendingCards([]);
    setMyPlayerId(null);
    setIdentityResolved(false);

    if (!code || !uid) return;

    let roomChannel: RealtimeChannel | null = null;
    let handChannel: RealtimeChannel | null = null;
    let cancelled = false;

    const initialize = async () => {
      const { data: r } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (cancelled) return;
      if (!r) {
        setIdentityResolved(true);
        return;
      }
      setRoom(r as any);
      const storedPlayerId = sessionStorage.getItem(`coup:player:${code.toUpperCase()}`);
      const meQuery = storedPlayerId
        ? supabase
            .from("players")
            .select("*")
            .eq("room_id", r.id)
            .eq("id", storedPlayerId)
            .maybeSingle()
        : supabase
            .from("players")
            .select("*")
            .eq("room_id", r.id)
            .eq("anon_user_id", uid)
            .limit(1)
            .maybeSingle();
      const [{ data: ps }, { data: es }, { data: me }] = await Promise.all([
        supabase.from("players").select("*").eq("room_id", r.id).order("seat"),
        supabase.from("events").select("*").eq("room_id", r.id).order("seq"),
        meQuery,
      ]);
      if (cancelled) return;
      setPlayers((ps as any) ?? []);
      setEvents((es as any) ?? []);
      if (me) {
        setMyPlayerId(me.id);
        const { data: h } = await supabase
          .from("hands")
          .select("cards,pending_cards")
          .eq("player_id", me.id)
          .maybeSingle();
        if (cancelled) return;
        const hand = h as unknown as PrivateHandRow | null;
        setMyHand(hand?.cards ?? []);
        setMyPendingCards(hand?.pending_cards ?? []);
      }
      setIdentityResolved(true);

      const refetchHand = async (pid: string) => {
        const { data: h } = await supabase
          .from("hands")
          .select("cards,pending_cards")
          .eq("player_id", pid)
          .maybeSingle();
        if (cancelled) return;
        const hand = h as unknown as PrivateHandRow | null;
        setMyHand(hand?.cards ?? []);
        setMyPendingCards(hand?.pending_cards ?? []);
      };

      roomChannel = supabase
        .channel(`room:${r.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rooms", filter: `id=eq.${r.id}` },
          (payload) => {
            if (cancelled) return;
            if (payload.new) setRoom(payload.new as any);
            if (me) refetchHand(me.id);
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "players", filter: `room_id=eq.${r.id}` },
          async () => {
            const { data } = await supabase
              .from("players")
              .select("*")
              .eq("room_id", r.id)
              .order("seat");
            if (cancelled) return;
            setPlayers((data as any) ?? []);
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "events", filter: `room_id=eq.${r.id}` },
          (payload) => {
            if (cancelled) return;
            setEvents((prev) => [...prev, payload.new as any]);
          },
        )
        .subscribe();

      // subscribe to own hand changes
      handChannel = me
        ? supabase
            .channel(`hand:${me.id}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "hands", filter: `player_id=eq.${me.id}` },
              (payload: any) => {
                if (cancelled) return;
                setMyHand((payload.new?.cards as Character[]) ?? []);
                setMyPendingCards((payload.new?.pending_cards as Character[]) ?? []);
              },
            )
            .subscribe()
        : null;
    };

    void initialize();

    return () => {
      cancelled = true;
      if (roomChannel) void supabase.removeChannel(roomChannel);
      if (handChannel) void supabase.removeChannel(handChannel);
    };
  }, [code, uid]);

  return {
    uid,
    room,
    players,
    events,
    myHand,
    myPendingCards,
    myPlayerId,
    identityResolved,
  };
}
