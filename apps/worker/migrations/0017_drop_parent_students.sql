-- Drop parent_students table (parent role removed)
DROP INDEX IF EXISTS idx_parent_students_parent;
DROP INDEX IF EXISTS idx_parent_students_student;
DROP TABLE IF EXISTS parent_students;
