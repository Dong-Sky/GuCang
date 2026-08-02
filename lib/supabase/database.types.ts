export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          action_type: string
          actor_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          household_id: string
          id: string
          metadata: Json
        }
        Insert: {
          action_type: string
          actor_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          household_id: string
          id?: string
          metadata?: Json
        }
        Update: {
          action_type?: string
          actor_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          household_id?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          household_id: string
          icon: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          household_id: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          household_id?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          aliases: string[]
          avatar_image_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          household_id: string
          id: string
          ip_id: string
          name: string
          name_original: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          avatar_image_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          household_id: string
          id?: string
          ip_id: string
          name: string
          name_original?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          avatar_image_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          ip_id?: string
          name?: string
          name_original?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_ip_id_fkey"
            columns: ["ip_id"]
            isOneToOne: false
            referencedRelation: "ips"
            referencedColumns: ["id"]
          },
        ]
      }
      export_events: {
        Row: {
          actor_id: string
          created_at: string
          file_size_bytes: number | null
          format: string
          household_id: string
          id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          file_size_bytes?: number | null
          format?: string
          household_id: string
          id?: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          file_size_bytes?: number | null
          format?: string
          household_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          household_id: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          household_id: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          household_id?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["member_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          storage_quota_bytes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id: string
          storage_quota_bytes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          storage_quota_bytes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ips: {
        Row: {
          aliases: string[]
          cover_image_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          household_id: string
          id: string
          name: string
          name_en: string | null
          name_ja: string | null
          name_zh: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          cover_image_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          household_id: string
          id?: string
          name: string
          name_en?: string | null
          name_ja?: string | null
          name_zh?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          cover_image_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          name?: string
          name_en?: string | null
          name_ja?: string | null
          name_zh?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ips_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      item_images: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          detail_path: string
          file_size_bytes: number
          height: number | null
          household_id: string
          id: string
          image_type: Database["public"]["Enums"]["image_type"]
          item_style_id: string
          sort_order: number
          thumbnail_path: string | null
          thumbnail_size_bytes: number
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          detail_path: string
          file_size_bytes?: number
          height?: number | null
          household_id: string
          id?: string
          image_type?: Database["public"]["Enums"]["image_type"]
          item_style_id: string
          sort_order?: number
          thumbnail_path?: string | null
          thumbnail_size_bytes?: number
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          detail_path?: string
          file_size_bytes?: number
          height?: number | null
          household_id?: string
          id?: string
          image_type?: Database["public"]["Enums"]["image_type"]
          item_style_id?: string
          sort_order?: number
          thumbnail_path?: string | null
          thumbnail_size_bytes?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_images_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_images_item_style_id_fkey"
            columns: ["item_style_id"]
            isOneToOne: false
            referencedRelation: "item_styles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_instances: {
        Row: {
          acquired_at: string | null
          acquisition_source: string | null
          condition_note: string | null
          created_at: string
          created_by: string
          current_location_id: string | null
          deleted_at: string | null
          home_location_id: string | null
          household_id: string
          id: string
          is_sealed: boolean
          item_style_id: string
          physical_status: Database["public"]["Enums"]["physical_status"]
          updated_at: string
          updated_by: string
        }
        Insert: {
          acquired_at?: string | null
          acquisition_source?: string | null
          condition_note?: string | null
          created_at?: string
          created_by: string
          current_location_id?: string | null
          deleted_at?: string | null
          home_location_id?: string | null
          household_id: string
          id?: string
          is_sealed?: boolean
          item_style_id: string
          physical_status?: Database["public"]["Enums"]["physical_status"]
          updated_at?: string
          updated_by: string
        }
        Update: {
          acquired_at?: string | null
          acquisition_source?: string | null
          condition_note?: string | null
          created_at?: string
          created_by?: string
          current_location_id?: string | null
          deleted_at?: string | null
          home_location_id?: string | null
          household_id?: string
          id?: string
          is_sealed?: boolean
          item_style_id?: string
          physical_status?: Database["public"]["Enums"]["physical_status"]
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_instances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_instances_current_location_id_fkey"
            columns: ["current_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_instances_home_location_id_fkey"
            columns: ["home_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_instances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_instances_item_style_id_fkey"
            columns: ["item_style_id"]
            isOneToOne: false
            referencedRelation: "item_styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_instances_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_style_characters: {
        Row: {
          character_id: string
          item_style_id: string
          sort_order: number
        }
        Insert: {
          character_id: string
          item_style_id: string
          sort_order?: number
        }
        Update: {
          character_id?: string
          item_style_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_style_characters_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_style_characters_item_style_id_fkey"
            columns: ["item_style_id"]
            isOneToOne: false
            referencedRelation: "item_styles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_styles: {
        Row: {
          category_id: string | null
          completion_status: Database["public"]["Enums"]["completion_status"]
          created_at: string
          created_by: string
          deleted_at: string | null
          household_id: string
          id: string
          ip_id: string | null
          name: string
          notes: string | null
          official_name: string | null
          search_text: string
          series_id: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          category_id?: string | null
          completion_status?: Database["public"]["Enums"]["completion_status"]
          created_at?: string
          created_by: string
          deleted_at?: string | null
          household_id: string
          id?: string
          ip_id?: string | null
          name?: string
          notes?: string | null
          official_name?: string | null
          search_text?: string
          series_id?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          category_id?: string | null
          completion_status?: Database["public"]["Enums"]["completion_status"]
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          ip_id?: string | null
          name?: string
          notes?: string | null
          official_name?: string | null
          search_text?: string
          series_id?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_styles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_styles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_styles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_styles_ip_id_fkey"
            columns: ["ip_id"]
            isOneToOne: false
            referencedRelation: "ips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_styles_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_styles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_images: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          detail_path: string
          file_size_bytes: number
          height: number | null
          household_id: string
          id: string
          image_type: Database["public"]["Enums"]["image_type"]
          location_id: string
          thumbnail_path: string | null
          thumbnail_size_bytes: number
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          detail_path: string
          file_size_bytes?: number
          height?: number | null
          household_id: string
          id?: string
          image_type?: Database["public"]["Enums"]["image_type"]
          location_id: string
          thumbnail_path?: string | null
          thumbnail_size_bytes?: number
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          detail_path?: string
          file_size_bytes?: number
          height?: number | null
          household_id?: string
          id?: string
          image_type?: Database["public"]["Enums"]["image_type"]
          location_id?: string
          thumbnail_path?: string | null
          thumbnail_size_bytes?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "location_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_images_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_images_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          household_id: string
          id: string
          location_type: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          household_id: string
          id?: string
          location_type?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          household_id?: string
          id?: string
          location_type?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_events: {
        Row: {
          action_type: Database["public"]["Enums"]["movement_action_type"]
          actor_id: string
          created_at: string
          from_location_id: string | null
          from_status: Database["public"]["Enums"]["physical_status"] | null
          household_id: string
          id: string
          item_instance_id: string
          note: string | null
          reverses_event_id: string | null
          to_location_id: string | null
          to_status: Database["public"]["Enums"]["physical_status"] | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["movement_action_type"]
          actor_id: string
          created_at?: string
          from_location_id?: string | null
          from_status?: Database["public"]["Enums"]["physical_status"] | null
          household_id: string
          id?: string
          item_instance_id: string
          note?: string | null
          reverses_event_id?: string | null
          to_location_id?: string | null
          to_status?: Database["public"]["Enums"]["physical_status"] | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["movement_action_type"]
          actor_id?: string
          created_at?: string
          from_location_id?: string | null
          from_status?: Database["public"]["Enums"]["physical_status"] | null
          household_id?: string
          id?: string
          item_instance_id?: string
          note?: string | null
          reverses_event_id?: string | null
          to_location_id?: string | null
          to_status?: Database["public"]["Enums"]["physical_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "movement_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_events_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_events_item_instance_id_fkey"
            columns: ["item_instance_id"]
            isOneToOne: false
            referencedRelation: "item_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_events_reverses_event_id_fkey"
            columns: ["reverses_event_id"]
            isOneToOne: false
            referencedRelation: "movement_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_events_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          aliases: string[]
          created_at: string
          deleted_at: string | null
          household_id: string
          id: string
          ip_id: string | null
          name: string
          notes: string | null
          year: number | null
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          deleted_at?: string | null
          household_id: string
          id?: string
          ip_id?: string | null
          name: string
          notes?: string | null
          year?: number | null
        }
        Update: {
          aliases?: string[]
          created_at?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          ip_id?: string | null
          name?: string
          notes?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "series_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_ip_id_fkey"
            columns: ["ip_id"]
            isOneToOne: false
            referencedRelation: "ips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_household_invite: {
        Args: { invite_token: string }
        Returns: string
      }
      move_item_instance: {
        Args: {
          target_instance: string
          target_location: string
          target_note?: string
          target_status: Database["public"]["Enums"]["physical_status"]
        }
        Returns: {
          acquired_at: string | null
          acquisition_source: string | null
          condition_note: string | null
          created_at: string
          created_by: string
          current_location_id: string | null
          deleted_at: string | null
          home_location_id: string | null
          household_id: string
          id: string
          is_sealed: boolean
          item_style_id: string
          physical_status: Database["public"]["Enums"]["physical_status"]
          updated_at: string
          updated_by: string
        }
        SetofOptions: {
          from: "*"
          to: "item_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      completion_status: "complete" | "draft" | "review"
      image_type: "main" | "attachment"
      member_role: "admin" | "member"
      movement_action_type: "move" | "take_out" | "return" | "display"
      physical_status: "stored" | "temporarily_out" | "displayed" | "unknown"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      completion_status: ["complete", "draft", "review"],
      image_type: ["main", "attachment"],
      member_role: ["admin", "member"],
      movement_action_type: ["move", "take_out", "return", "display"],
      physical_status: ["stored", "temporarily_out", "displayed", "unknown"],
    },
  },
} as const
