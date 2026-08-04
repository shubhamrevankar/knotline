UPDATE provider_connector_certifications
SET engineering_status = 'LIVE',
    live_status = 'LIVE',
    external_gate = 'SELF_SERVICE_HTTPS',
    capabilities = jsonb_build_object(
      'transport', 'live_https',
      'endpointPolicy', 'public_https_only',
      'redirects', 'blocked',
      'receipts', true
    ),
    limitations = jsonb_build_array(
      'Public HTTPS endpoints only; private networks and redirects are blocked.'
    ),
    certified_at = clock_timestamp(),
    expires_at = NULL
WHERE connector_key IN ('generic-rest', 'signed-webhook');
