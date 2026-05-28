-- Migration 0016: link parents to their children.
-- Without this table the `parent` role was effectively unusable: there was no
-- way to know whose grades / attendance / sessions a given parent could see.
-- A many-to-many join lets one parent supervise multiple children and one
-- child have multiple guardians.

CREATE TABLE IF NOT EXISTS parent_students (
  parent_id  TEXT NOT NULL,
  student_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  PRIMARY KEY (parent_id, student_id),
  FOREIGN KEY (parent_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Lookups go both directions:
--   "show me my children"      → WHERE parent_id  = ?
--   "who are this kid's parents" → WHERE student_id = ?
CREATE INDEX IF NOT EXISTS idx_parent_students_parent  ON parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student ON parent_students(student_id);
