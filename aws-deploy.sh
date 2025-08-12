#!/bin/bash
# AWS EC2 deployment script for UnderTheRadar VPN

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅ $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')] ℹ️  $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}"
}

print_header() {
    echo -e "${BLUE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║        🚀 UnderTheRadar VPN - AWS Deployment 🚀                 ║
║                                                                  ║
║           Deploy your $2/month VPN on AWS EC2                   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"
}

# Get AWS configuration
get_aws_config() {
    info "Checking AWS configuration..."
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        warn "AWS CLI not found. Please install it first:"
        echo "curl 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o 'awscliv2.zip'"
        echo "unzip awscliv2.zip && sudo ./aws/install"
        exit 1
    fi
    
    # Get default region
    AWS_REGION=$(aws configure get region)
    if [[ -z "$AWS_REGION" ]]; then
        echo -n "Enter your AWS region (e.g., us-east-1): "
        read AWS_REGION
    fi
    
    info "Using AWS region: $AWS_REGION"
    
    # Get or create key pair
    echo -n "Enter your EC2 key pair name (or press Enter to create new): "
    read KEY_NAME
    
    if [[ -z "$KEY_NAME" ]]; then
        KEY_NAME="undertheradar-vpn-key"
        info "Creating new key pair: $KEY_NAME"
        aws ec2 create-key-pair --key-name $KEY_NAME --query 'KeyMaterial' --output text > ${KEY_NAME}.pem
        chmod 400 ${KEY_NAME}.pem
        log "Key pair created: ${KEY_NAME}.pem"
    fi
}

# Create security group
create_security_group() {
    info "Creating security group..."
    
    # Get default VPC
    VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text)
    
    if [[ "$VPC_ID" == "None" ]]; then
        warn "No default VPC found. Using first available VPC."
        VPC_ID=$(aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text)
    fi
    
    info "Using VPC: $VPC_ID"
    
    # Create security group
    SG_ID=$(aws ec2 create-security-group \
        --group-name undertheradar-vpn-sg \
        --description "UnderTheRadar VPN Security Group" \
        --vpc-id $VPC_ID \
        --query 'GroupId' --output text 2>/dev/null || \
        aws ec2 describe-security-groups \
        --group-names undertheradar-vpn-sg \
        --query 'SecurityGroups[0].GroupId' --output text)
    
    info "Security group: $SG_ID"
    
    # Get your public IP
    MY_IP=$(curl -s ifconfig.me)
    
    # Add security group rules
    info "Adding security group rules..."
    
    # SSH access from your IP only
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 22 \
        --cidr ${MY_IP}/32 2>/dev/null || true
    
    # HTTP access
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 2>/dev/null || true
    
    # HTTPS access
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 2>/dev/null || true
    
    # API server
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 3001 \
        --cidr 0.0.0.0/0 2>/dev/null || true
    
    # VPN traffic
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol udp \
        --port 51820 \
        --cidr 0.0.0.0/0 2>/dev/null || true
    
    log "Security group configured"
}

# Launch EC2 instance
launch_instance() {
    info "Launching EC2 instance..."
    
    # Get Ubuntu 22.04 LTS AMI ID for the region
    AMI_ID=$(aws ec2 describe-images \
        --owners 099720109477 \
        --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
        --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
        --output text)
    
    info "Using AMI: $AMI_ID"
    
    # Launch instance
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id $AMI_ID \
        --instance-type t3.small \
        --key-name $KEY_NAME \
        --security-group-ids $SG_ID \
        --associate-public-ip-address \
        --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=UnderTheRadar-VPN-Server}]' \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    log "Instance launched: $INSTANCE_ID"
    
    # Wait for instance to be running
    info "Waiting for instance to start..."
    aws ec2 wait instance-running --instance-ids $INSTANCE_ID
    
    # Get public IP
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids $INSTANCE_ID \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    
    log "Instance running at: $PUBLIC_IP"
    echo "INSTANCE_ID=$INSTANCE_ID" > aws-instance.txt
    echo "PUBLIC_IP=$PUBLIC_IP" >> aws-instance.txt
    echo "KEY_NAME=$KEY_NAME" >> aws-instance.txt
}

# Show connection instructions
show_connection_info() {
    echo -e "${GREEN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║                  🎉 EC2 INSTANCE READY! 🎉                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"
    
    log "Your AWS EC2 instance is ready!"
    echo
    echo -e "${BLUE}📋 Instance Details:${NC}"
    echo "   • Instance ID: $INSTANCE_ID"
    echo "   • Public IP: $PUBLIC_IP"
    echo "   • Key Pair: $KEY_NAME"
    echo "   • Region: $AWS_REGION"
    echo
    echo -e "${YELLOW}🔑 Next Steps:${NC}"
    echo "   1. Wait 30 seconds for instance to fully initialize"
    echo "   2. Run this command to deploy VPN:"
    echo
    echo -e "${GREEN}   ssh -i ${KEY_NAME}.pem ubuntu@${PUBLIC_IP} 'bash <(curl -s https://raw.githubusercontent.com/FatherWoland/undertheradar-vpn/master/deploy.sh)'${NC}"
    echo
    echo "   3. Or connect manually:"
    echo -e "${GREEN}   ssh -i ${KEY_NAME}.pem ubuntu@${PUBLIC_IP}${NC}"
    echo
    echo -e "${BLUE}💰 Estimated Cost:${NC}"
    echo "   • t3.small: ~$0.0208/hour (~$15/month)"
    echo "   • Data transfer: ~$0.09/GB"
    echo "   • Total: ~$20-30/month depending on usage"
    echo
    echo -e "${YELLOW}🎯 After deployment, your VPN will be available at:${NC}"
    echo "   • Web Interface: http://${PUBLIC_IP}"
    echo "   • API Endpoint: http://${PUBLIC_IP}:3001/api"
}

# Main function
main() {
    print_header
    get_aws_config
    create_security_group
    launch_instance
    show_connection_info
}

# Run main function
main "$@"