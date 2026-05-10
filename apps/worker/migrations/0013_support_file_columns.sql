-- Add file attachment columns to support_messages
ALTER TABLE support_messages ADD COLUMN file_url TEXT;
ALTER TABLE support_messages ADD COLUMN file_name TEXT;
