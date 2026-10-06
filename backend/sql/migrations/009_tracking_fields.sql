ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS connects_spent INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS boost_connects INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS client_viewed ENUM('yes','no') NULL,
  ADD COLUMN IF NOT EXISTS client_replied ENUM('yes','no') NULL,
  ADD COLUMN IF NOT EXISTS interviewed ENUM('yes','no') NULL,
  ADD COLUMN IF NOT EXISTS tracking_updated_at DATETIME NULL
