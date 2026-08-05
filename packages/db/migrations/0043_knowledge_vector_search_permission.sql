-- Hybrid and semantic retrieval use pgvector's cosine-distance operator.
GRANT EXECUTE ON FUNCTION public.cosine_distance(public.vector, public.vector) TO knotline_runtime;
