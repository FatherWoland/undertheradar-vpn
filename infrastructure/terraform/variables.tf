variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "admin_cidr" {
  description = "CIDR block for admin access"
  type        = string
  default     = "0.0.0.0/0"  # Change this to your IP for security
}

variable "ssh_public_key" {
  description = "SSH public key for EC2 instances"
  type        = string
}

variable "vpn_server_count" {
  description = "Number of VPN servers"
  type        = number
  default     = 3
}

variable "vpn_server_ami" {
  description = "AMI ID for VPN servers (Ubuntu 22.04 LTS)"
  type        = string
  default     = "ami-0c7217cdde317cfec"  # Ubuntu 22.04 LTS in us-east-1
}

variable "vpn_server_instance_type" {
  description = "Instance type for VPN servers"
  type        = string
  default     = "t3.medium"
}

variable "app_server_count" {
  description = "Number of application servers"
  type        = number
  default     = 2
}

variable "app_server_ami" {
  description = "AMI ID for application servers"
  type        = string
  default     = "ami-0c7217cdde317cfec"  # Ubuntu 22.04 LTS in us-east-1
}

variable "app_server_instance_type" {
  description = "Instance type for application servers"
  type        = string
  default     = "t3.medium"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}