resource "aws_ssm_parameter" "cognito_user_pool_id" {
  name  = "/${var.project_name}/${var.environment}/cognito/user_pool_id"
  type  = "String"
  value = aws_cognito_user_pool.main.id
}

resource "aws_ssm_parameter" "cognito_client_id" {
  name  = "/${var.project_name}/${var.environment}/cognito/client_id"
  type  = "String"
  value = aws_cognito_user_pool_client.spa.id
}

resource "aws_ssm_parameter" "cognito_oauth_domain" {
  name  = "/${var.project_name}/${var.environment}/cognito/oauth_domain"
  type  = "String"
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}
