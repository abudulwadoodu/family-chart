terraform {
  backend "s3" {
    bucket         = "familytree-terraform-state-141701955028"
    key            = "familytree/terraform.tfstate"
    region         = "ap-south-2"
    dynamodb_table = "familytree-terraform-locks"
    encrypt        = true
  }
}
