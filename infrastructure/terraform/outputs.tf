output "vpc_id" {
  value = aws_vpc.vpn_vpc.id
}

output "public_subnet_ids" {
  value = aws_subnet.public_subnets[*].id
}

output "vpn_server_ips" {
  value = aws_instance.vpn_servers[*].public_ip
}

output "vpn_server_ids" {
  value = aws_instance.vpn_servers[*].id
}

output "app_server_ips" {
  value = aws_instance.app_servers[*].public_ip
}

output "app_server_ids" {
  value = aws_instance.app_servers[*].id
}

output "load_balancer_dns" {
  value = aws_lb.app_lb.dns_name
}

output "database_endpoint" {
  value = aws_db_instance.vpn_db.endpoint
}

output "database_port" {
  value = aws_db_instance.vpn_db.port
}