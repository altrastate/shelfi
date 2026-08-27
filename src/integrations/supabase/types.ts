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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      authors: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authors_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          label: string | null
          note: string | null
          page: number | null
          resource_id: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          page?: number | null
          resource_id: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          page?: number | null
          resource_id?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "digital_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author_id: string | null
          category_id: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          edition: string | null
          id: string
          isbn: string | null
          language: string | null
          published_year: number | null
          publisher_id: string | null
          school_id: string
          shelf_location: string | null
          subject: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          edition?: string | null
          id?: string
          isbn?: string | null
          language?: string | null
          published_year?: number | null
          publisher_id?: string | null
          school_id: string
          shelf_location?: string | null
          subject?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          edition?: string | null
          id?: string
          isbn?: string | null
          language?: string | null
          published_year?: number | null
          publisher_id?: string | null
          school_id?: string
          shelf_location?: string | null
          subject?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      borrowings: {
        Row: {
          borrowed_at: string
          borrower_id: string
          copy_id: string
          created_at: string
          due_at: string
          id: string
          issued_by: string | null
          notes: string | null
          returned_at: string | null
          school_id: string
          status: Database["public"]["Enums"]["borrow_status"]
          updated_at: string
        }
        Insert: {
          borrowed_at?: string
          borrower_id: string
          copy_id: string
          created_at?: string
          due_at: string
          id?: string
          issued_by?: string | null
          notes?: string | null
          returned_at?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["borrow_status"]
          updated_at?: string
        }
        Update: {
          borrowed_at?: string
          borrower_id?: string
          copy_id?: string
          created_at?: string
          due_at?: string
          id?: string
          issued_by?: string | null
          notes?: string | null
          returned_at?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["borrow_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "borrowings_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "physical_copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrowings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_resources: {
        Row: {
          author_name: string | null
          category_id: string | null
          cover_path: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          file_size: number | null
          file_url: string | null
          format: string | null
          id: string
          is_active: boolean
          isbn: string | null
          language: string | null
          level: string | null
          page_count: number | null
          published_year: number | null
          publisher_id: string | null
          school_id: string | null
          source_type: Database["public"]["Enums"]["resource_source"]
          status: string
          storage_path: string | null
          subject: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          category_id?: string | null
          cover_path?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_url?: string | null
          format?: string | null
          id?: string
          is_active?: boolean
          isbn?: string | null
          language?: string | null
          level?: string | null
          page_count?: number | null
          published_year?: number | null
          publisher_id?: string | null
          school_id?: string | null
          source_type: Database["public"]["Enums"]["resource_source"]
          status?: string
          storage_path?: string | null
          subject?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          category_id?: string | null
          cover_path?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_url?: string | null
          format?: string | null
          id?: string
          is_active?: boolean
          isbn?: string | null
          language?: string | null
          level?: string | null
          page_count?: number | null
          published_year?: number | null
          publisher_id?: string | null
          school_id?: string | null
          source_type?: Database["public"]["Enums"]["resource_source"]
          status?: string
          storage_path?: string | null
          subject?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_resources_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_resources_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_resources_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_copies: {
        Row: {
          acquired_on: string | null
          barcode: string | null
          book_id: string
          condition: string
          created_at: string
          id: string
          notes: string | null
          school_id: string
          shelf_location: string | null
          status: Database["public"]["Enums"]["copy_status"]
          updated_at: string
        }
        Insert: {
          acquired_on?: string | null
          barcode?: string | null
          book_id: string
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          school_id: string
          shelf_location?: string | null
          status?: Database["public"]["Enums"]["copy_status"]
          updated_at?: string
        }
        Update: {
          acquired_on?: string | null
          barcode?: string | null
          book_id?: string
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          school_id?: string
          shelf_location?: string | null
          status?: Database["public"]["Enums"]["copy_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "physical_copies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_copies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          school_id: string | null
          status: Database["public"]["Enums"]["membership_status"]
          student_identifier: string | null
          updated_at: string
          year_group: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          school_id?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          student_identifier?: string | null
          updated_at?: string
          year_group?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          school_id?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          student_identifier?: string | null
          updated_at?: string
          year_group?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      publishers: {
        Row: {
          contact_email: string | null
          created_at: string
          id: string
          name: string
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          id?: string
          name: string
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          id?: string
          name?: string
          website?: string | null
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          current_page: number
          id: string
          last_read_at: string
          percent_complete: number
          resource_id: string
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_page?: number
          id?: string
          last_read_at?: string
          percent_complete?: number
          resource_id: string
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_page?: number
          id?: string
          last_read_at?: string
          percent_complete?: number
          resource_id?: string
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "digital_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_progress_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_licences: {
        Row: {
          created_at: string
          expires_on: string | null
          id: string
          is_active: boolean
          resource_id: string
          school_id: string
          seats: number | null
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_on?: string | null
          id?: string
          is_active?: boolean
          resource_id: string
          school_id: string
          seats?: number | null
          starts_on?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_on?: string | null
          id?: string
          is_active?: boolean
          resource_id?: string
          school_id?: string
          seats?: number | null
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_licences_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "digital_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_licences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_join_requests: {
        Row: {
          decision_note: string | null
          id: string
          requested_at: string
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Insert: {
          decision_note?: string | null
          id?: string
          requested_at?: string
          requested_role?: Database["public"]["Enums"]["app_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Update: {
          decision_note?: string | null
          id?: string
          requested_at?: string
          requested_role?: Database["public"]["Enums"]["app_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_join_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          city: string | null
          contact_email: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          join_code: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          join_code?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          join_code?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      shelf_items: {
        Row: {
          added_at: string
          book_id: string | null
          id: string
          resource_id: string | null
          school_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          book_id?: string | null
          id?: string
          resource_id?: string | null
          school_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          book_id?: string | null
          id?: string
          resource_id?: string | null
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shelf_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shelf_items_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "digital_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shelf_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_school_admin: {
        Args: { _school_id: string; _user_id: string }
        Returns: undefined
      }
      can_open_digital_resource: {
        Args: { _resource_id: string }
        Returns: boolean
      }
      current_school_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_member: { Args: { _school_id: string }; Returns: boolean }
      is_librarian: { Args: { _school_id: string }; Returns: boolean }
      is_school_admin: { Args: { _school_id: string }; Returns: boolean }
      is_school_staff: { Args: { _school_id: string }; Returns: boolean }
      is_system_admin: { Args: never; Returns: boolean }
      issue_copy: {
        Args: {
          _borrower_id: string
          _copy_id: string
          _due_at: string
          _notes?: string
        }
        Returns: string
      }
      request_school_join: {
        Args: {
          _full_name?: string
          _join_code: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          school_id: string
          school_name: string
        }[]
      }
      return_copy: {
        Args: { _copy_id: string; _note?: string; _outcome?: string }
        Returns: string
      }
      review_join_request: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: undefined
      }
      safe_uuid: { Args: { _value: string }; Returns: string }
      set_copy_status: {
        Args: {
          _copy_id: string
          _note?: string
          _status: Database["public"]["Enums"]["copy_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "system_admin" | "school_admin" | "student" | "librarian"
      borrow_status: "borrowed" | "returned" | "overdue" | "lost"
      copy_status:
        | "available"
        | "borrowed"
        | "reserved"
        | "damaged"
        | "lost"
        | "retired"
        | "archived"
      membership_status: "pending" | "active" | "suspended" | "rejected"
      resource_source: "school" | "shelfi_catalogue"
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
      app_role: ["system_admin", "school_admin", "student", "librarian"],
      borrow_status: ["borrowed", "returned", "overdue", "lost"],
      copy_status: [
        "available",
        "borrowed",
        "reserved",
        "damaged",
        "lost",
        "retired",
        "archived",
      ],
      membership_status: ["pending", "active", "suspended", "rejected"],
      resource_source: ["school", "shelfi_catalogue"],
    },
  },
} as const
