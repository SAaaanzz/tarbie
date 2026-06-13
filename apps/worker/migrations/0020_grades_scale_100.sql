-- Widen student grade scale from 0-10 to 0-100.
-- The old CHECK(grade BETWEEN 0 AND 10) rejected any grade > 10, which surfaced
-- in the app as an "internal error" when teachers tried to set 11-100.
-- SQLite cannot alter a CHECK constraint in place, so we recreate the table
-- and copy existing rows over.

ALTER TABLE grades RENAME TO grades_old;

CREATE TABLE grades (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'absent' CHECK(status IN ('present','absent','makeup')),
  grade INTEGER CHECK(grade IS NULL OR (grade BETWEEN 0 AND 100)),
  comment TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES tarbie_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE(session_id, student_id)
);

INSERT INTO grades (id, session_id, student_id, status, grade, comment, created_by, created_at, updated_at)
  SELECT id, session_id, student_id, status, grade, comment, created_by, created_at, updated_at
  FROM grades_old;

DROP TABLE grades_old;

CREATE INDEX idx_grades_session_id ON grades(session_id);
CREATE INDEX idx_grades_student_id ON grades(student_id);
CREATE INDEX idx_grades_status ON grades(status);
