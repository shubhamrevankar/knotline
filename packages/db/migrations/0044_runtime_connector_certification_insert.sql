-- Workspace creation provisions the certified connector catalog in the same
-- tenant-scoped transaction. The runtime role already has SELECT access and
-- needs INSERT only for that provisioning path.
GRANT INSERT ON provider_connector_certifications TO knotline_runtime;
