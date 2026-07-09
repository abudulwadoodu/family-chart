# RDS requires a DB subnet group spanning at least two Availability Zones,
# but this VPC only has one subnet today (the EC2 instance's, in
# ap-south-2a) - `terraform apply` failed on this exact constraint. Rather
# than hardcode a second pre-existing subnet id (none exists), carve out a
# second, minimal /28 subnet in ap-south-2b purely to satisfy the AZ-count
# requirement; it hosts no compute, only the RDS ENI.
data "aws_vpc" "main" {
  id = var.vpc_id
}

data "aws_subnet" "primary" {
  id = "subnet-027bb43de329a07ef"
}

# /28 (16 addresses) is the smallest subnet AWS allows and is more than
# enough for a single RDS ENI. The VPC is 172.31.0.0/16 and the only existing
# subnet is 172.31.0.0/20 (172.31.0.0-172.31.15.255); carving this /28 out of
# the *next* /20 block (172.31.16.0/20) keeps it clear of that range - this
# VPC has exactly one other subnet (confirmed via `aws_subnets` data source
# returning a single id), so nothing else is using 172.31.16.0/20 either.
resource "aws_subnet" "postgres_secondary" {
  vpc_id            = var.vpc_id
  cidr_block        = cidrsubnet(cidrsubnet(data.aws_vpc.main.cidr_block, 4, 1), 8, 0)
  availability_zone = "${var.aws_region}b"

  tags = {
    Name    = "${var.project_name}-${var.environment}-postgres-secondary"
    Project = var.project_name
  }
}

resource "aws_db_subnet_group" "postgres" {
  name       = "${var.project_name}-${var.environment}-postgres"
  subnet_ids = [data.aws_subnet.primary.id, aws_subnet.postgres_secondary.id]

  tags = {
    Name    = "${var.project_name}-${var.environment}-postgres-subnet-group"
    Project = var.project_name
  }
}

# Dedicated security group for the RDS instance: only allows Postgres (5432)
# ingress from the app EC2 instance's security group, nothing else.
#
# The ingress-from-app and the app's egress-to-postgres rules are declared as
# standalone aws_security_group_rule resources (not inline ingress/egress
# blocks on either aws_security_group) because each one's security_groups
# reference points at the *other* SG's id - inlining both would make
# aws_security_group.app and aws_security_group.postgres depend on each
# other's id, which Terraform can't resolve (a dependency cycle).
resource "aws_security_group" "postgres" {
  name        = "${var.project_name}-${var.environment}-postgres"
  description = "Allow Postgres access from the app EC2 instance only"
  vpc_id      = var.vpc_id

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-${var.environment}-postgres-sg"
    Project = var.project_name
  }
}

resource "aws_security_group_rule" "postgres_ingress_from_app" {
  type                     = "ingress"
  security_group_id        = aws_security_group.postgres.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
  description              = "Postgres from app EC2 instance"
}

resource "aws_security_group_rule" "app_egress_to_postgres" {
  type                     = "egress"
  security_group_id        = aws_security_group.app.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.postgres.id
  description              = "Postgres out to the RDS instance"
}

resource "random_password" "postgres_master" {
  length      = 32
  special     = false
  min_upper   = 1
  min_lower   = 1
  min_numeric = 1
}

# Single-AZ, small instance class: matches the app's current single-EC2-instance
# scale (see design.md, Non-Goals: no multi-region/read-replica setup in this
# change). Revisit instance class / Multi-AZ once real production load is known.
resource "aws_db_instance" "postgres" {
  identifier     = "${var.project_name}-${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "16"

  instance_class        = "db.t4g.micro"
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "familytree"
  username = "familytree_app"
  password = random_password.postgres_master.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  publicly_accessible    = false

  multi_az                = false
  backup_retention_period = 1             # AWS Free Tier accounts reject longer retention periods
  backup_window           = "17:00-17:30" # UTC; low-traffic window
  maintenance_window      = "sun:18:00-sun:18:30"

  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-${var.environment}-postgres-final"
  deletion_protection       = true

  auto_minor_version_upgrade = true
  apply_immediately          = false

  tags = {
    Name        = "${var.project_name}-${var.environment}-postgres"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Store connection details in SSM (same pattern as the existing Cognito
# parameters in ssm.tf) so the app server reads them at deploy time rather
# than the values living in a secrets file checked into the repo.
resource "aws_ssm_parameter" "postgres_host" {
  name  = "/${var.project_name}/${var.environment}/postgres/host"
  type  = "String"
  value = aws_db_instance.postgres.address
}

resource "aws_ssm_parameter" "postgres_port" {
  name  = "/${var.project_name}/${var.environment}/postgres/port"
  type  = "String"
  value = tostring(aws_db_instance.postgres.port)
}

resource "aws_ssm_parameter" "postgres_db_name" {
  name  = "/${var.project_name}/${var.environment}/postgres/db_name"
  type  = "String"
  value = aws_db_instance.postgres.db_name
}

resource "aws_ssm_parameter" "postgres_username" {
  name  = "/${var.project_name}/${var.environment}/postgres/username"
  type  = "String"
  value = aws_db_instance.postgres.username
}

resource "aws_ssm_parameter" "postgres_password" {
  name  = "/${var.project_name}/${var.environment}/postgres/password"
  type  = "SecureString"
  value = random_password.postgres_master.result
}

resource "aws_ssm_parameter" "postgres_database_url" {
  name  = "/${var.project_name}/${var.environment}/postgres/database_url"
  type  = "SecureString"
  value = "postgresql://${aws_db_instance.postgres.username}:${random_password.postgres_master.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${aws_db_instance.postgres.db_name}"
}
