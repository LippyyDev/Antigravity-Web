-- ============================================================
-- MIGRATION SQL — Jalankan di Supabase SQL Editor
-- Data TIDAK akan hilang, ini hanya ALTER TABLE
-- ============================================================

-- ── 1. Tambah kolom deadline_date ke antigravity_accounts ────
ALTER TABLE public.antigravity_accounts
  ADD COLUMN IF NOT EXISTS deadline_date TIMESTAMP WITH TIME ZONE;

-- ── 2. Hapus kolom warmup dari user_settings ─────────────────
ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS warmup_enabled,
  DROP COLUMN IF EXISTS warmup_interval,
  DROP COLUMN IF EXISTS warmup_cooldown_hours;

-- ── 3. Buat tabel user_tags (tag library reusable per user) ──
CREATE TABLE IF NOT EXISTS public.user_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_uid   TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT user_tags_owner_name_unique UNIQUE (owner_uid, name)
);

-- RLS untuk user_tags
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

-- Drop dulu kalau sudah ada (aman)
DROP POLICY IF EXISTS "tags_select" ON public.user_tags;
DROP POLICY IF EXISTS "tags_insert" ON public.user_tags;
DROP POLICY IF EXISTS "tags_update" ON public.user_tags;
DROP POLICY IF EXISTS "tags_delete" ON public.user_tags;

CREATE POLICY "tags_select" ON public.user_tags FOR SELECT USING (true);
CREATE POLICY "tags_insert" ON public.user_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "tags_update" ON public.user_tags FOR UPDATE USING (true);
CREATE POLICY "tags_delete" ON public.user_tags FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_tags_owner ON public.user_tags(owner_uid);
