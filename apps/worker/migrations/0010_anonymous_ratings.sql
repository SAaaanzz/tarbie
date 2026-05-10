-- Add anonymous option for session ratings
ALTER TABLE session_ratings ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;
