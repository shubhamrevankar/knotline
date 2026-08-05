UPDATE connector_manifest_versions
SET manifest = jsonb_set(
  manifest,
  '{requiredScopes}',
  '["crm.objects.contacts.read","crm.objects.contacts.write","crm.objects.companies.read","crm.objects.companies.write"]'::jsonb
)
WHERE connector_key = 'hubspot-crm';

UPDATE provider_connector_certifications
SET capabilities = jsonb_build_object(
      'authorization', 'oauth_v3',
      'test', 'contacts.read',
      'actions', jsonb_build_array('object.create','object.update','association.create'),
      'authorizedObjectTypes', jsonb_build_array('contacts','companies'),
      'tokenRefresh', true,
      'receipts', true
    ),
    certified_at = clock_timestamp()
WHERE connector_key = 'hubspot-crm';
