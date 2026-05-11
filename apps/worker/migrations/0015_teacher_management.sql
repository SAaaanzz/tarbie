-- Allow teachers to create groups and users
-- Track who created each user and class

ALTER TABLE users ADD COLUMN created_by TEXT REFERENCES users(id);
ALTER TABLE classes ADD COLUMN created_by TEXT REFERENCES users(id);

CREATE INDEX idx_users_created_by ON users(created_by);
CREATE INDEX idx_classes_created_by ON classes(created_by);
