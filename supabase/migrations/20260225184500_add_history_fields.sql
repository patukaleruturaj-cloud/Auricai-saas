-- Migration: Add subject and follow_up to generations
ALTER TABLE public.generations 
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS follow_up TEXT;
