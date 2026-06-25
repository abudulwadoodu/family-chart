data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2_app" {
  name               = "${var.project_name}-${var.environment}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Least-privilege: only allow reading the specific Cognito config parameters
# this app needs, nothing else.
data "aws_iam_policy_document" "ec2_ssm_read" {
  statement {
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]

    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}/cognito/*",
    ]
  }
}

resource "aws_iam_role_policy" "ec2_ssm_read" {
  name   = "${var.project_name}-${var.environment}-ssm-read"
  role   = aws_iam_role.ec2_app.id
  policy = data.aws_iam_policy_document.ec2_ssm_read.json
}

resource "aws_iam_instance_profile" "ec2_app" {
  name = "${var.project_name}-${var.environment}-ec2-profile"
  role = aws_iam_role.ec2_app.name
}
