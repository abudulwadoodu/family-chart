variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-2"
}

variable "project_name" {
  description = "Short project name used as a resource name/tag prefix"
  type        = string
  default     = "familytree"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "prod"
}

variable "existing_instance_id" {
  description = "Instance ID of the existing family-tree EC2 instance to import and manage"
  type        = string
  default     = "i-05110a66209f176ee"
}

variable "existing_security_group_id" {
  description = "Security group ID currently attached to the existing EC2 instance"
  type        = string
  default     = "sg-0dfe3c93640c7a919"
}

variable "vpc_id" {
  description = "VPC ID the existing EC2 instance lives in"
  type        = string
  default     = "vpc-0023ad5cadf288fd2"
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to SSH into the EC2 instance (port 22). Update this if your IP changes."
  type        = string
  default     = "111.92.34.103/32"
}

variable "mfa_configuration" {
  description = "Cognito MFA enforcement level: OFF, OPTIONAL, or ON"
  type        = string
  default     = "OPTIONAL"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "mfa_configuration must be one of OFF, OPTIONAL, ON."
  }
}

variable "password_minimum_length" {
  description = "Minimum length for Cognito user passwords"
  type        = number
  default     = 8
}

variable "access_token_validity_hours" {
  description = "Validity period for Cognito access/ID tokens, in hours"
  type        = number
  default     = 1
}

variable "refresh_token_validity_days" {
  description = "Validity period for Cognito refresh tokens, in days"
  type        = number
  default     = 30
}

variable "google_client_id" {
  description = "Google OAuth 2.0 Web application Client ID, used to federate Google sign-in through Cognito"
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth 2.0 Web application Client Secret, used to federate Google sign-in through Cognito"
  type        = string
  sensitive   = true
}

variable "oauth_callback_urls" {
  description = "Allowed OAuth callback/logout URLs for the Cognito Hosted UI redirect flow. Cognito requires https:// except for http://localhost."
  type        = list(string)
  default     = ["http://localhost:8080/"]
}

variable "ses_sender_email" {
  description = "Verified SES identity the Contact Us feature is allowed to send email as"
  type        = string
}
