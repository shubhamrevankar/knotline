ALTER TABLE workspaces
  ADD COLUMN description text NOT NULL DEFAULT ''
  CHECK (length(description) <= 4000);
