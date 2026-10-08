-- Sign in to Upwork Pro from Claude (OAuth 2.1, as the MCP spec asks): add the connector's link in Claude, sign in with your own
-- Upwork Pro email and password, allow it, and everything Claude saves is recorded as you. No token to copy by hand.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id VARCHAR(64) PRIMARY KEY,
  client_name VARCHAR(200) NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL
) ENGINE=InnoDB;

-- an authorization waiting for the person to sign in and allow it (10 minutes)
CREATE TABLE IF NOT EXISTS oauth_requests (
  id CHAR(32) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  redirect_uri VARCHAR(1000) NOT NULL,
  state VARCHAR(500) NULL,
  code_challenge VARCHAR(128) NOT NULL,
  scope VARCHAR(200) NULL,
  resource VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  done_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash CHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  redirect_uri VARCHAR(1000) NOT NULL,
  code_challenge VARCHAR(128) NOT NULL,
  scope VARCHAR(200) NULL,
  resource VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- a refresh token is used once: each use gives a new one (and a new access token); a reused one cuts off the whole connection
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  grant_id CHAR(32) NOT NULL,
  client_id VARCHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  scope VARCHAR(200) NULL,
  resource VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY idx_refresh_grant (grant_id),
  KEY idx_refresh_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- an access token from a sign-in is an api_token like a personal one (same permissions), tied to its connection
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS oauth_grant_id CHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS oauth_client_id VARCHAR(64) NULL,
  ADD KEY IF NOT EXISTS idx_token_grant (oauth_grant_id);
