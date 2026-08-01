terraform { backend "s3" {} required_version=">= 1.8.0" }
variable "state_bucket" { type=string }
variable "lock_table" { type=string }
variable "state_kms_key_arn" { type=string }
output "backend_contract" { value={bucket=var.state_bucket,lock_table=var.lock_table,kms_key=var.state_kms_key_arn,encrypted=true,versioned=true} sensitive=true }
