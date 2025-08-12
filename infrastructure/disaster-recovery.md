# Disaster Recovery & Business Continuity Plan

## Overview
This document outlines the comprehensive disaster recovery (DR) and business continuity plan for the UnderTheRadar VPN service, designed to ensure 99.99% uptime and rapid recovery from any catastrophic events.

## Recovery Time Objectives (RTO) & Recovery Point Objectives (RPO)

| Service Component | RTO | RPO | Priority |
|-------------------|-----|-----|----------|
| VPN Service | 15 minutes | 5 minutes | P0 |
| Admin Dashboard | 30 minutes | 15 minutes | P1 |
| Customer Portal | 30 minutes | 15 minutes | P1 |
| Billing System | 1 hour | 30 minutes | P2 |
| Analytics | 4 hours | 1 hour | P3 |

## Multi-Region Architecture

### Primary Region: us-east-1
- Production workloads
- Primary database
- Redis cluster
- VPN servers (50% capacity)

### Secondary Region: us-west-2
- Standby infrastructure
- Read replicas
- VPN servers (30% capacity)
- Backup storage

### Tertiary Region: eu-west-1
- European VPN servers (20% capacity)
- Data compliance
- Emergency failover

## Database Disaster Recovery

### PostgreSQL RDS Configuration
```hcl
# Multi-AZ deployment with automated failover
resource "aws_db_instance" "primary" {
  identifier = "undertheradar-vpn-primary"
  
  # Multi-AZ for high availability
  multi_az = true
  
  # Backup configuration
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  # Point-in-time recovery
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  # Encryption at rest
  storage_encrypted = true
  kms_key_id       = aws_kms_key.database.arn
}

# Cross-region read replica
resource "aws_db_instance" "replica_west" {
  identifier = "undertheradar-vpn-replica-west"
  
  # Source database
  replicate_source_db = aws_db_instance.primary.id
  
  # Different region
  provider = aws.west
}
```

### Automated Backup Strategy
- **Continuous backups**: Point-in-time recovery up to 35 days
- **Cross-region snapshots**: Daily snapshots replicated to secondary region
- **Logical backups**: Weekly pg_dump to S3 with 1-year retention
- **Testing**: Monthly backup restoration tests

### Database Failover Procedures
1. **Automatic Failover** (RDS Multi-AZ): 60-120 seconds
2. **Manual Failover to Read Replica**: 5-10 minutes
3. **Cross-region Failover**: 15-30 minutes

## Application Infrastructure DR

### Auto Scaling Groups with Cross-AZ Deployment
```hcl
resource "aws_autoscaling_group" "vpn_servers" {
  name = "undertheradar-vpn-servers"
  
  vpc_zone_identifier = [
    aws_subnet.public_1a.id,
    aws_subnet.public_1b.id,
    aws_subnet.public_1c.id
  ]
  
  min_size         = 3
  max_size         = 20
  desired_capacity = 6
  
  # Health checks
  health_check_type         = "ELB"
  health_check_grace_period = 300
  
  # Instance refresh for zero-downtime deployments
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }
}
```

### Container Orchestration (ECS Fargate)
```yaml
# ECS Service with multiple AZ deployment
version: '3'
services:
  backend:
    image: undertheradar/vpn-backend:latest
    deploy:
      replicas: 6
      placement:
        constraints:
          - node.role == worker
        preferences:
          - spread: node.labels.zone
    networks:
      - undertheradar-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Load Balancer Configuration

### Application Load Balancer with Health Checks
```hcl
resource "aws_lb" "main" {
  name               = "undertheradar-main-lb"
  internal           = false
  load_balancer_type = "application"
  
  # Multi-AZ deployment
  subnets = [
    aws_subnet.public_1a.id,
    aws_subnet.public_1b.id,
    aws_subnet.public_1c.id
  ]
  
  # Cross-zone load balancing
  enable_cross_zone_load_balancing = true
}

resource "aws_lb_target_group" "backend" {
  name     = "backend-targets"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id
  
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 10
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }
}
```

## VPN Server High Availability

### WireGuard Server Clustering
```bash
#!/bin/bash
# VPN server health check and automatic failover script

check_server_health() {
    local server_ip=$1
    local timeout=5
    
    # Check WireGuard interface
    if ! wg show wg0 &>/dev/null; then
        return 1
    fi
    
    # Check connectivity
    if ! ping -c 1 -W $timeout 8.8.8.8 &>/dev/null; then
        return 1
    fi
    
    # Check load
    local load=$(uptime | awk '{print $10}' | sed 's/,//')
    if (( $(echo "$load > 2.0" | bc -l) )); then
        return 1
    fi
    
    return 0
}

failover_traffic() {
    local failed_server=$1
    local backup_servers=("${@:2}")
    
    # Update Route 53 health checks
    aws route53 change-resource-record-sets \
        --hosted-zone-id $HOSTED_ZONE_ID \
        --change-batch file://failover-changeset.json
    
    # Notify monitoring system
    curl -X POST "$SLACK_WEBHOOK" \
        -d "{\"text\":\"VPN server $failed_server failed, traffic redirected\"}"
}
```

## Data Protection & Backup Strategy

### S3 Cross-Region Replication
```hcl
resource "aws_s3_bucket_replication_configuration" "backups" {
  role   = aws_iam_role.replication.arn
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "cross-region-replication"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.backup_replica.arn
      storage_class = "STANDARD_IA"
      
      # Encryption in destination
      encryption_configuration {
        replica_kms_key_id = aws_kms_key.replica.arn
      }
    }
  }
}
```

### Configuration Management
- **Infrastructure as Code**: All infrastructure in Terraform
- **Application Configuration**: Stored in AWS Systems Manager Parameter Store
- **Secrets Management**: AWS Secrets Manager with automatic rotation
- **Version Control**: All configurations in Git with automated backups

## Monitoring & Alerting

### CloudWatch Alarms
```hcl
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "This metric monitors 5xx error rate"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }
}

# Database connection monitoring
resource "aws_cloudwatch_metric_alarm" "db_connections" {
  alarm_name          = "high-db-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.id
  }
}
```

### External Monitoring
- **Pingdom**: Global uptime monitoring from multiple locations
- **StatusCake**: API endpoint monitoring with SSL certificate checks
- **New Relic**: Application performance monitoring
- **DataDog**: Infrastructure and log monitoring

## Incident Response Procedures

### Escalation Matrix
| Severity | Description | Response Time | Escalation |
|----------|-------------|---------------|------------|
| P0 | Service completely down | 5 minutes | On-call engineer + CTO |
| P1 | Major feature impaired | 15 minutes | On-call engineer |
| P2 | Minor feature impaired | 1 hour | Assigned engineer |
| P3 | Cosmetic issues | Next business day | Product team |

### Automated Incident Response
```python
# Lambda function for automated incident response
import boto3
import json
import requests

def lambda_handler(event, context):
    # Parse CloudWatch alarm
    alarm = json.loads(event['Records'][0]['Sns']['Message'])
    
    if alarm['NewStateValue'] == 'ALARM':
        # Scale up instances
        autoscaling = boto3.client('autoscaling')
        autoscaling.set_desired_capacity(
            AutoScalingGroupName='undertheradar-vpn-servers',
            DesiredCapacity=10,  # Emergency scaling
            HonorCooldown=False
        )
        
        # Notify on-call engineer
        requests.post(PAGERDUTY_WEBHOOK, json={
            'routing_key': PAGERDUTY_KEY,
            'event_action': 'trigger',
            'payload': {
                'summary': f"ALERT: {alarm['AlarmName']}",
                'severity': 'critical',
                'source': 'aws-cloudwatch'
            }
        })
    
    return {'statusCode': 200}
```

## Communication Plan

### Status Page (status.undertheradar.work)
- **Real-time status**: Automated updates from monitoring systems
- **Incident history**: Public incident reports and post-mortems
- **Maintenance windows**: Scheduled maintenance notifications
- **Subscribe to updates**: Email and SMS notifications

### Internal Communication
- **Slack Integration**: Automated alerts to #incidents channel
- **PagerDuty**: On-call rotation and escalation
- **Email Lists**: Stakeholder notifications for P0/P1 incidents

## Testing & Validation

### Disaster Recovery Drills
- **Monthly**: Database failover testing
- **Quarterly**: Full region failover simulation
- **Annually**: Complete disaster recovery exercise

### Chaos Engineering
```python
# Chaos engineering script to test resilience
import random
import boto3
import time

class ChaosMonkey:
    def __init__(self):
        self.ec2 = boto3.client('ec2')
        self.asg = boto3.client('autoscaling')
    
    def terminate_random_instance(self, asg_name):
        """Randomly terminate an instance to test auto-healing"""
        instances = self.get_asg_instances(asg_name)
        if len(instances) > 1:  # Never terminate last instance
            victim = random.choice(instances)
            self.ec2.terminate_instances(InstanceIds=[victim])
            print(f"Terminated instance: {victim}")
    
    def simulate_az_failure(self, az_name):
        """Simulate availability zone failure"""
        # This would be implemented with network ACLs
        pass
```

## Recovery Procedures

### Database Recovery
1. **Point-in-time Recovery**:
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier undertheradar-vpn-primary \
     --target-db-instance-identifier undertheradar-vpn-recovery \
     --restore-time 2024-01-15T10:30:00Z
   ```

2. **Cross-region Recovery**:
   ```bash
   # Promote read replica to master
   aws rds promote-read-replica \
     --db-instance-identifier undertheradar-vpn-replica-west
   
   # Update application configuration
   aws ssm put-parameter \
     --name "/undertheradar/database/endpoint" \
     --value "new-master-endpoint" \
     --overwrite
   ```

### Application Recovery
1. **Auto Scaling Recovery**: Automatic instance replacement
2. **Blue-Green Deployment**: Zero-downtime recovery
3. **Container Orchestration**: Self-healing containers

## Post-Incident Procedures

### Blameless Post-Mortems
1. **Timeline reconstruction**: Detailed incident timeline
2. **Root cause analysis**: Technical and process failures
3. **Action items**: Specific improvements with owners and dates
4. **Follow-up**: Quarterly review of action item completion

### Continuous Improvement
- **Monthly DR metrics review**: RTO/RPO compliance
- **Quarterly architecture review**: Scalability and resilience
- **Annual DR plan update**: Technology and process evolution

## Cost Optimization

### Reserved Capacity
- **RDS Reserved Instances**: 1-year terms for predictable workloads
- **EC2 Reserved Instances**: Mixed on-demand and reserved capacity
- **S3 Intelligent Tiering**: Automatic cost optimization

### Disaster Recovery Cost Management
- **Cold Standby**: Minimal resources, 30-minute RTO
- **Warm Standby**: Partial resources, 15-minute RTO  
- **Hot Standby**: Full resources, 5-minute RTO (for critical components only)

## Compliance & Governance

### Data Residency
- **European customers**: Data stored in eu-west-1
- **US customers**: Data stored in us-east-1
- **Cross-border**: Encrypted replication only

### Audit Trail
- **CloudTrail**: All API calls logged and monitored
- **Config**: Configuration compliance tracking
- **Security Hub**: Centralized security findings

This disaster recovery plan ensures business continuity with industry-leading recovery objectives while maintaining cost efficiency and regulatory compliance.