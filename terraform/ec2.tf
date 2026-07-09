# Security group attached to the existing EC2 instance. It currently has
# zero ingress/egress rules (verified before this change); the rules below
# are net-new additions, not a recreation of existing rules.
resource "aws_security_group" "app" {
  name        = "launch-wizard-2"
  description = "launch-wizard-2 created 2026-04-21T13:28:13.221Z"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH (key-based auth is the access control; GitHub Actions runners use non-static IPs)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress is declared entirely as standalone aws_security_group_rule
  # resources below (none inlined here). egress on aws_security_group is
  # Optional+Computed: a single inline block makes Terraform authoritative
  # over the *whole* list, which would fight with (and revoke) the
  # Postgres egress rule in rds.tf that has to be a standalone resource
  # anyway (it references aws_security_group.postgres.id, and inlining it
  # here would create a dependency cycle between this SG and that one).

  tags = {
    Name    = "launch-wizard-2"
    Project = var.project_name
  }
}

resource "aws_security_group_rule" "app_egress_https" {
  type              = "egress"
  security_group_id = aws_security_group.app.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS out (Cognito JWKS, package mirrors, etc.)"
}

resource "aws_security_group_rule" "app_egress_http" {
  type              = "egress"
  security_group_id = aws_security_group.app.id
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTP out (Ubuntu apt mirrors, which are plain HTTP)"
}

# The existing family-tree EC2 instance, imported into Terraform state.
# Attributes below mirror its current live configuration so the import is a
# zero-diff baseline; the only behavioral change is attaching the new IAM
# instance profile.
resource "aws_instance" "app" {
  ami           = "ami-070e5bd3ff10324f8"
  instance_type = "t3.micro"
  key_name      = "familytree-kp-ec2"
  subnet_id     = "subnet-027bb43de329a07ef"

  vpc_security_group_ids = [aws_security_group.app.id]

  iam_instance_profile = aws_iam_instance_profile.ec2_app.name

  ebs_optimized = true
  monitoring    = false

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 15 # matches the live volume (resized outside Terraform at some point); was 8, would have shrunk it on apply
    iops                  = 3000
    throughput            = 125
    delete_on_termination = true
    encrypted             = false
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    instance_metadata_tags      = "disabled"
  }

  tags = {
    Name = "familytree-ec2-instance"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

# Stable public IP so DNS (circlebook.life) and the Cognito/Google OAuth
# callback URL don't break every time the instance stops/starts.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name    = "familytree-ec2-eip"
    Project = var.project_name
  }
}
