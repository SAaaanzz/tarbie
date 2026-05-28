-- Remove parent role constraint and add signatures + lesson approval tables

-- Recreate users table without 'parent' in CHECK constraint
-- SQLite does not support ALTER TABLE to modify constraints,
-- so we handle this at application level (validation already excludes parent)

-- User signatures table
CREATE TABLE IF NOT EXISTS user_signatures (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  signature_data TEXT NOT NULL, -- base64 encoded signature image (PNG)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_signatures_user_id ON user_signatures(user_id);

-- Lesson approval workflow
CREATE TABLE IF NOT EXISTS lesson_approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  curator_id TEXT NOT NULL,
  school_id TEXT NOT NULL,
  word_file_url TEXT NOT NULL,
  word_file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  admin_comment TEXT,
  approved_by TEXT,
  approved_at TEXT,
  curator_signature_id TEXT,
  admin_signature_id TEXT,
  generated_pdf_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES tarbie_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (curator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_lesson_approvals_session_id ON lesson_approvals(session_id);
CREATE INDEX idx_lesson_approvals_curator_id ON lesson_approvals(curator_id);
CREATE INDEX idx_lesson_approvals_status ON lesson_approvals(status);
CREATE INDEX idx_lesson_approvals_school_id ON lesson_approvals(school_id);
