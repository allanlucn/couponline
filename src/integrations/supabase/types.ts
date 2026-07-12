export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      events: {
        Row: {
          created_at: string;
          id: number;
          payload: Json;
          room_id: string;
          seq: number;
          type: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          payload?: Json;
          room_id: string;
          seq: number;
          type: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          payload?: Json;
          room_id?: string;
          seq?: number;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      hands: {
        Row: {
          anon_user_id: string;
          cards: Json;
          pending_cards: Json;
          player_id: string;
        };
        Insert: {
          anon_user_id: string;
          cards?: Json;
          pending_cards?: Json;
          player_id: string;
        };
        Update: {
          anon_user_id?: string;
          cards?: Json;
          pending_cards?: Json;
          player_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hands_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: true;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      game_states: {
        Row: {
          room_id: string;
          state: Json;
          updated_at: string;
          version: number;
        };
        Insert: {
          room_id: string;
          state: Json;
          updated_at?: string;
          version?: number;
        };
        Update: {
          room_id?: string;
          state?: Json;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_states_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: true;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      players: {
        Row: {
          anon_user_id: string;
          coins: number;
          id: string;
          is_alive: boolean;
          joined_at: string;
          name: string;
          revealed: Json;
          room_id: string;
          seat: number;
        };
        Insert: {
          anon_user_id: string;
          coins?: number;
          id?: string;
          is_alive?: boolean;
          joined_at?: string;
          name: string;
          revealed?: Json;
          room_id: string;
          seat: number;
        };
        Update: {
          anon_user_id?: string;
          coins?: number;
          id?: string;
          is_alive?: boolean;
          joined_at?: string;
          name?: string;
          revealed?: Json;
          room_id?: string;
          seat?: number;
        };
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          code: string;
          created_at: string;
          current_player_id: string | null;
          host_id: string | null;
          id: string;
          state: Json;
          status: string;
          updated_at: string;
          winner_id: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          current_player_id?: string | null;
          host_id?: string | null;
          id?: string;
          state?: Json;
          status?: string;
          updated_at?: string;
          winner_id?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          current_player_id?: string | null;
          host_id?: string | null;
          id?: string;
          state?: Json;
          status?: string;
          updated_at?: string;
          winner_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      commit_game_state: {
        Args: {
          p_canonical_state: Json;
          p_current_player_id: string | null;
          p_events: Json;
          p_expected_version: number;
          p_hands: Json;
          p_players: Json;
          p_public_state: Json;
          p_room_id: string;
          p_status: string;
          p_winner_id: string | null;
        };
        Returns: Json;
      };
      join_room_atomic: {
        Args: { p_code: string; p_name: string; p_user_id: string };
        Returns: Database["public"]["Tables"]["players"]["Row"];
      };
      restart_game_state: {
        Args: {
          p_canonical_state: Json;
          p_current_player_id: string;
          p_event: Json;
          p_expected_version: number;
          p_hands: Json;
          p_host_user_id: string;
          p_players: Json;
          p_public_state: Json;
          p_room_id: string;
        };
        Returns: Json;
      };
      start_game_state: {
        Args: {
          p_canonical_state: Json;
          p_current_player_id: string | null;
          p_event: Json;
          p_hands: Json;
          p_host_user_id: string;
          p_players: Json;
          p_public_state: Json;
          p_room_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
