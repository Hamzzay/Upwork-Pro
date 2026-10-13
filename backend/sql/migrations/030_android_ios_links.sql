-- Projects get an Android link and an iOS link. The old "mobile link" is split into them by `npm run migrate` (a data step after
-- this file); anything that is neither store stays in mobile_link, shown as "Other mobile link".
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS android_link VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS ios_link VARCHAR(500) NULL;
