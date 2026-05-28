-- Add 'pending_approval' to tarbie_sessions status CHECK constraint.
-- SQLite cannot ALTER CHECK constraints, so we recreate the table.

-- 1. Create new table with updated constraint
CREATE TABLE IF NOT EXISTS tarbie_sessions_new (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  planned_date TEXT NOT NULL,
  actual_date TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('pending_approval','planned','completed','cancelled','rescheduled')),
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  notes TEXT,
  attachment_url TEXT,
  room TEXT,
  time_slot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- 2. Copy data
INSERT INTO tarbie_sessions_new (id, class_id, teacher_id, topic, planned_date, actual_date, status, duration_minutes, notes, attachment_url, room, time_slot, created_at, updated_at)
  SELECT id, class_id, teacher_id, topic, planned_date, actual_date, status, duration_minutes, notes, attachment_url, room, time_slot, created_at, updated_at
  FROM tarbie_sessions;

-- 3. Drop old table
DROP TABLE tarbie_sessions;

-- 4. Rename new table
ALTER TABLE tarbie_sessions_new RENAME TO tarbie_sessions;

-- 5. Recreate indexes
CREATE INDEX idx_tarbie_sessions_class_id ON tarbie_sessions(class_id);
CREATE INDEX idx_tarbie_sessions_teacher_id ON tarbie_sessions(teacher_id);
CREATE INDEX idx_tarbie_sessions_planned_date ON tarbie_sessions(planned_date);
CREATE INDEX idx_tarbie_sessions_status ON tarbie_sessions(status);
CREATE INDEX idx_tarbie_sessions_class_date ON tarbie_sessions(class_id, planned_date);
CREATE INDEX idx_sessions_date_timeslot_room ON tarbie_sessions(planned_date, time_slot, room);
