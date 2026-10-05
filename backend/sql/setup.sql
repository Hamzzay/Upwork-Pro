-- Run once as the MySQL root user (XAMPP). Change the password first, then put the same one in backend/.env
CREATE DATABASE IF NOT EXISTS upwork_gate CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'upwork_gate'@'localhost' IDENTIFIED BY 'change-me';
CREATE USER IF NOT EXISTS 'upwork_gate'@'127.0.0.1' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON upwork_gate.* TO 'upwork_gate'@'localhost';
GRANT ALL PRIVILEGES ON upwork_gate.* TO 'upwork_gate'@'127.0.0.1';
FLUSH PRIVILEGES;
