-- Fix Telegram/WhatsApp notification templates.
-- The seed in 0001_init.sql stored the two literal characters "\" + "n" instead
-- of real newlines (SQLite does NOT interpret backslash escapes inside string
-- literals). As a result messages were delivered with visible "\n" sequences,
-- e.g. "...жоспарланды!\n\nТақырып:...".
-- This replaces every literal "\n" with a real newline (char(10)) in all
-- templates, including the __default__ rows that are copied to new schools.
-- Running it again is a harmless no-op once the literals are gone.

UPDATE notification_templates
SET template_text = REPLACE(template_text, '\n', char(10))
WHERE template_text LIKE '%\n%';
