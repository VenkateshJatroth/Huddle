/**
 * Client-facing types for the proposed profile and follow-relationship tables.
 *
 * These types mirror the SQL drafts in docs/supabase. They describe the app
 * contract only; they do not verify that a migration has been applied to a
 * Supabase project. Relationship writes are exposed through RPCs only.
 */
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          bio: string;
          avatar_url: string | null;
          is_private: boolean;
          created_at: string;
          updated_at: string;
          // Gormati extended profile fields
          full_name: string | null;
          age: number | null;
          location: string | null;
          dating_intention: string | null;
          interests: string[] | null;
          prompts: { question: string; answer: string }[] | null;
          gallery_urls: string[] | null;
          is_verified: boolean;
          push_token: string | null;
        };
        // Client-writable insert columns
        Insert: {
          id: string;
          username: string;
          display_name?: string;
          bio?: string;
          avatar_url?: string | null;
          is_private?: boolean;
          full_name?: string | null;
          age?: number | null;
          location?: string | null;
          dating_intention?: string | null;
          interests?: string[] | null;
          prompts?: { question: string; answer: string }[] | null;
          gallery_urls?: string[] | null;
          is_verified?: boolean;
          push_token?: string | null;
        };
        // App updates intentionally exclude ownership, avatar and timestamps.
        Update: {
          username?: string;
          display_name?: string;
          bio?: string;
          is_private?: boolean;
          // Gormati extended profile fields
          full_name?: string | null;
          age?: number | null;
          location?: string | null;
          dating_intention?: string | null;
          interests?: string[] | null;
          prompts?: { question: string; answer: string }[] | null;
          avatar_url?: string | null;
          gallery_urls?: string[] | null;
          push_token?: string | null;
        };
        Relationships: [];
      };
      follow_relationships: {
        Row: {
          id?: string;
          follower_id?: string;
          following_id?: string;
          requester_id: string;
          target_id: string;
          status: "pending" | "accepted";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          follower_id?: string;
          following_id?: string;
          requester_id?: string;
          target_id?: string;
          status: "pending" | "accepted";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          following_id?: string;
          requester_id?: string;
          target_id?: string;
          status?: "pending" | "accepted";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          author_name: string;
          username: string;
          text: string;
          audience: string;
          image_url: string | null;
          likes_count: number;
          replies_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          author_name: string;
          username: string;
          text: string;
          audience?: string;
          image_url?: string | null;
          likes_count?: number;
          replies_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          author_name?: string;
          username?: string;
          text?: string;
          audience?: string;
          image_url?: string | null;
          likes_count?: number;
          replies_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      indiana_follow_profile: {
        Args: { p_target_id: string };
        Returns: "pending" | "accepted";
      };
      indiana_approve_follow_request: {
        Args: { p_requester_id: string };
        Returns: boolean;
      };
      indiana_reject_follow_request: {
        Args: { p_requester_id: string };
        Returns: boolean;
      };
      indiana_remove_follow_relationship: {
        Args: { p_target_id: string };
        Returns: boolean;
      };
      indiana_search_profiles: {
        Args: { p_query: string; p_limit?: number };
        Returns: {
          profile_id: string;
          profile_username: string;
          profile_display_name: string;
          profile_is_private: boolean;
          outgoing_status: "pending" | "accepted" | null;
          follows_you: boolean;
        }[];
      };
      indiana_relationship_profile_summaries: {
        Args: { p_profile_ids: string[] };
        Returns: {
          profile_id: string;
          profile_username: string;
          profile_display_name: string;
          profile_is_private: boolean;
          profile_bio: string | null;
          profile_avatar_url: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
