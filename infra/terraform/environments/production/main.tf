module "platform" { source="../../modules/platform" environment="production" active_region="us-east-1" standby_region="us-west-2" protection_region="eu-west-1" artifact_digest=var.artifact_digest }
variable "artifact_digest" { type=string validation { condition=can(regex("^sha256:[a-f0-9]{64}$",var.artifact_digest)) error_message="A signed image digest is required." } }
