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

output "ec2_instance_id" {
  value = aws_instance.app.id
}

output "ec2_public_ip" {
  value = aws_instance.app.public_ip
}

output "ec2_iam_role_arn" {
  value = aws_iam_role.ec2_app.arn
}
