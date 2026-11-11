-- R153 (Hamza): when a chat's call is (Pakistan time, like every stored time) and how it went: set, held or missed. After the time
-- passes the chat asks whether the call happened; a call held asks for the next step, a call missed for a follow up.
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS chat_call_at DATETIME NULL;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS chat_call_status VARCHAR(10) NULL;
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS what VARCHAR(20) NULL;
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS call_at DATETIME NULL;
