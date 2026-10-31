/**
 * TypeScript interfaces supporting the full Gormati profile model and Supabase database types.
 */

import type { Database } from "../lib/database.types";

export type { Database } from "../lib/database.types";

export type ProfilePrompt = {
  question: string;
  answer: string;
};

export type GormatiProfile = {
  id: string;
  full_name: string | null;
  age: number | null;
  location: string | null;
  dating_intention: string | null;
  bio: string | null;
  interests: string[];
  prompts: ProfilePrompt[];
  avatar_url: string | null;
  gallery_urls: string[];
  is_verified: boolean;
  push_token?: string | null;
  username: string;
  display_name: string;
  is_private: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

