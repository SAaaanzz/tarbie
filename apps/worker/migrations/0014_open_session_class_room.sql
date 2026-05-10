-- Add class_id (group) and room to open_sessions
ALTER TABLE open_sessions ADD COLUMN class_id TEXT REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE open_sessions ADD COLUMN room TEXT;
