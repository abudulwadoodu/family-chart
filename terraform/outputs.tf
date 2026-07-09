output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.spa.id
}

output "cognito_issuer_url" {
  value = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "cognito_jwks_url" {
  value = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
}

output "cognito_oauth_domain" {
  description = "Cognito Hosted UI domain - set VITE_COGNITO_OAUTH_DOMAIN to this value"
  value       = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "ec2_instance_id" {
  value = aws_instance.app.id
}

output "ec2_public_ip" {
  value = aws_eip.app.public_ip
}

output "ec2_iam_role_arn" {
  value = aws_iam_role.ec2_app.arn
}

output "postgres_endpoint" {
  description = "RDS Postgres endpoint (host:port), for reference only - the app reads DATABASE_URL from SSM at deploy time, not this output directly"
  value       = aws_db_instance.postgres.endpoint
}

output "postgres_ssm_database_url_param" {
  description = "SSM parameter name holding the full DATABASE_URL connection string (SecureString)"
  value       = aws_ssm_parameter.postgres_database_url.name
}
