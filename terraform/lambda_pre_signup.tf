data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "pre_signup_lambda" {
  name               = "${var.project_name}-${var.environment}-pre-signup-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "pre_signup_lambda_logs" {
  role       = aws_iam_role.pre_signup_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "pre_signup_lambda_cognito" {
  statement {
    actions = [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminLinkProviderForUser",
    ]

    resources = [aws_cognito_user_pool.main.arn]
  }
}

resource "aws_iam_role_policy" "pre_signup_lambda_cognito" {
  name   = "${var.project_name}-${var.environment}-pre-signup-cognito"
  role   = aws_iam_role.pre_signup_lambda.id
  policy = data.aws_iam_policy_document.pre_signup_lambda_cognito.json
}

# Vendors the Lambda's runtime dependency into the zip - the managed Node.js
# runtime doesn't guarantee this specific AWS SDK v3 client is preinstalled.
resource "null_resource" "pre_signup_lambda_deps" {
  triggers = {
    package_json_hash = filesha256("${path.module}/lambda/pre-signup/package.json")
  }

  provisioner "local-exec" {
    command     = "npm install --omit=dev --prefix lambda/pre-signup"
    working_dir = path.module
  }
}

data "archive_file" "pre_signup_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/pre-signup"
  output_path = "${path.module}/lambda/pre-signup.zip"
  excludes    = ["package-lock.json"]

  depends_on = [null_resource.pre_signup_lambda_deps]
}

resource "aws_lambda_function" "pre_signup" {
  function_name    = "${var.project_name}-${var.environment}-pre-signup"
  role             = aws_iam_role.pre_signup_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 10
  filename         = data.archive_file.pre_signup_lambda.output_path
  source_code_hash = data.archive_file.pre_signup_lambda.output_base64sha256

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_lambda_permission" "cognito_invoke_pre_signup" {
  statement_id  = "AllowCognitoInvokePreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
