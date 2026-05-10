-- Remove 'live' lesson type: recreate lessons table without it
-- SQLite does not support ALTER CHECK, so we must recreate

-- Update any existing 'live' lessons to 'video'
UPDATE lessons SET type = 'video' WHERE type = 'live';
