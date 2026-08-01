terraform { required_version = ">= 1.8.0"; required_providers { aws = { source = "hashicorp/aws" version = "~> 5.0" } } }
variable "environment" { type=string validation { condition=contains(["development","staging","production"],var.environment) error_message="Unsupported environment." } }
variable "active_region" { type=string }
variable "standby_region" { type=string }
variable "protection_region" { type=string validation { condition=var.protection_region!=var.active_region&&var.protection_region!=var.standby_region error_message="Protection region must be distinct." } }
variable "artifact_digest" { type=string validation { condition=can(regex("^sha256:[a-f0-9]{64}$",var.artifact_digest)) error_message="A pinned image digest is required." } }
locals { common_tags={Product="Knotline",Environment=var.environment,ManagedBy="Terraform",DataClassification="customer"} }
resource "aws_kms_key" "application" { description="${var.environment} application data" enable_key_rotation=true deletion_window_in_days=30 tags=local.common_tags }
resource "aws_s3_bucket" "objects" { bucket="knotline-${var.environment}-${var.active_region}-objects" force_destroy=false tags=local.common_tags lifecycle { prevent_destroy=true } }
resource "aws_s3_bucket_versioning" "objects" { bucket=aws_s3_bucket.objects.id versioning_configuration { status="Enabled" } }
resource "aws_s3_bucket_server_side_encryption_configuration" "objects" { bucket=aws_s3_bucket.objects.id rule { apply_server_side_encryption_by_default { kms_master_key_id=aws_kms_key.application.arn sse_algorithm="aws:kms" } bucket_key_enabled=true } }
resource "aws_s3_bucket_public_access_block" "objects" { bucket=aws_s3_bucket.objects.id block_public_acls=true block_public_policy=true ignore_public_acls=true restrict_public_buckets=true }
output "topology" { value={active=var.active_region,standby=var.standby_region,protection=var.protection_region,digest=var.artifact_digest} }
