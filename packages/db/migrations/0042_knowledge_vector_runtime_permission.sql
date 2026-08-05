-- pgvector installs its typmod coercion function with owner-only execution in
-- this database. Runtime indexing casts deterministic embeddings with
-- $value::vector, which invokes this function.
GRANT EXECUTE ON FUNCTION public.vector(public.vector, integer, boolean) TO knotline_runtime;
