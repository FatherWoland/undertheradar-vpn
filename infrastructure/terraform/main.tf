terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region
}

# VPC Configuration
resource "aws_vpc" "vpn_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "undertheradar-vpn-vpc"
  }
}

resource "aws_internet_gateway" "vpn_igw" {
  vpc_id = aws_vpc.vpn_vpc.id

  tags = {
    Name = "undertheradar-vpn-igw"
  }
}

resource "aws_subnet" "public_subnets" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.vpn_vpc.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = var.availability_zones[count.index]
  
  map_public_ip_on_launch = true

  tags = {
    Name = "undertheradar-vpn-public-${count.index + 1}"
  }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.vpn_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.vpn_igw.id
  }

  tags = {
    Name = "undertheradar-vpn-public-rt"
  }
}

resource "aws_route_table_association" "public_rta" {
  count          = length(aws_subnet.public_subnets)
  subnet_id      = aws_subnet.public_subnets[count.index].id
  route_table_id = aws_route_table.public_rt.id
}

# Security Groups
resource "aws_security_group" "vpn_server_sg" {
  name_prefix = "undertheradar-vpn-server"
  vpc_id      = aws_vpc.vpn_vpc.id

  # WireGuard
  ingress {
    from_port   = 51820
    to_port     = 51820
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  # HTTP/HTTPS for management
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "undertheradar-vpn-server-sg"
  }
}

resource "aws_security_group" "app_server_sg" {
  name_prefix = "undertheradar-app-server"
  vpc_id      = aws_vpc.vpn_vpc.id

  # HTTP/HTTPS
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # API
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "undertheradar-app-server-sg"
  }
}

# Key Pair
resource "aws_key_pair" "vpn_key" {
  key_name   = "undertheradar-vpn-key"
  public_key = var.ssh_public_key
}

# Application Load Balancer
resource "aws_lb" "app_lb" {
  name               = "undertheradar-app-lb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.app_server_sg.id]
  subnets            = aws_subnet.public_subnets[*].id

  tags = {
    Name = "undertheradar-app-lb"
  }
}

# VPN Servers
resource "aws_instance" "vpn_servers" {
  count           = var.vpn_server_count
  ami             = var.vpn_server_ami
  instance_type   = var.vpn_server_instance_type
  key_name        = aws_key_pair.vpn_key.key_name
  security_groups = [aws_security_group.vpn_server_sg.id]
  subnet_id       = aws_subnet.public_subnets[count.index % length(aws_subnet.public_subnets)].id

  user_data = base64encode(templatefile("${path.module}/user_data_vpn.sh", {
    server_index = count.index
  }))

  tags = {
    Name = "undertheradar-vpn-server-${count.index + 1}"
    Type = "vpn-server"
  }
}

# Application Servers
resource "aws_instance" "app_servers" {
  count           = var.app_server_count
  ami             = var.app_server_ami
  instance_type   = var.app_server_instance_type
  key_name        = aws_key_pair.vpn_key.key_name
  security_groups = [aws_security_group.app_server_sg.id]
  subnet_id       = aws_subnet.public_subnets[count.index % length(aws_subnet.public_subnets)].id

  user_data = base64encode(templatefile("${path.module}/user_data_app.sh", {
    server_index = count.index
  }))

  tags = {
    Name = "undertheradar-app-server-${count.index + 1}"
    Type = "app-server"
  }
}

# RDS Database
resource "aws_db_subnet_group" "vpn_db_subnet_group" {
  name       = "undertheradar-vpn-db-subnet-group"
  subnet_ids = aws_subnet.public_subnets[*].id

  tags = {
    Name = "undertheradar-vpn-db-subnet-group"
  }
}

resource "aws_security_group" "rds_sg" {
  name_prefix = "undertheradar-rds"
  vpc_id      = aws_vpc.vpn_vpc.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_server_sg.id]
  }

  tags = {
    Name = "undertheradar-rds-sg"
  }
}

resource "aws_db_instance" "vpn_db" {
  identifier = "undertheradar-vpn-db"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.db_instance_class
  
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_encrypted     = true
  
  db_name  = "undertheradar_vpn"
  username = var.db_username
  password = var.db_password
  
  db_subnet_group_name   = aws_db_subnet_group.vpn_db_subnet_group.name
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = true
  deletion_protection = false

  tags = {
    Name = "undertheradar-vpn-db"
  }
}