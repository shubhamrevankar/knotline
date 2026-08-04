\connect knotline
CREATE EXTENSION IF NOT EXISTS vector;
\getenv runtime_password KNOTLINE_RUNTIME_DB_PASSWORD
SELECT format(
  'CREATE ROLE knotline_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'knotline_runtime')
\gexec
