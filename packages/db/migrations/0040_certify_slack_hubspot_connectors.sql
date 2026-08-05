UPDATE connector_manifest_versions
SET manifest = jsonb_set(
  jsonb_set(manifest, '{requiredScopes}',
    CASE connector_key
      WHEN 'slack-collaboration' THEN '["team:read","channels:read","chat:write"]'::jsonb
      ELSE '["crm.objects.contacts.read","crm.objects.contacts.write"]'::jsonb
    END),
  '{optionalScopes}',
    CASE connector_key
      WHEN 'slack-collaboration' THEN '["users:read","channels:history","groups:history","search:read","files:read"]'::jsonb
      ELSE '["crm.schemas.contacts.read"]'::jsonb
    END)
WHERE connector_key IN ('slack-collaboration', 'hubspot-crm');

UPDATE provider_connector_certifications
SET engineering_status = 'LIVE',
    live_status = 'LIVE',
    external_gate = 'CUSTOMER_OAUTH_APPLICATION',
    capabilities = CASE connector_key
      WHEN 'slack-collaboration' THEN jsonb_build_object(
        'authorization', 'oauth_v2',
        'test', 'auth.test',
        'actions', jsonb_build_array('message.post','message.update','message.delete'),
        'tokenRefresh', true,
        'receipts', true
      )
      ELSE jsonb_build_object(
        'authorization', 'oauth_v3',
        'test', 'contacts.read',
        'actions', jsonb_build_array('object.create','object.update'),
        'tokenRefresh', true,
        'receipts', true
      )
    END,
    limitations = jsonb_build_array(
      'A customer-owned provider application and its OAuth credentials are required.'
    ),
    certified_at = clock_timestamp(),
    expires_at = NULL
WHERE connector_key IN ('slack-collaboration', 'hubspot-crm');
