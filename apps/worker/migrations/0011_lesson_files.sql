-- Add file attachment columns to lessons table
ALTER TABLE lessons ADD COLUMN file_url TEXT;
ALTER TABLE lessons ADD COLUMN file_name TEXT;
