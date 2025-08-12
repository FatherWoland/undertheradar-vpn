#!/bin/bash
# Simple Android APK builder - creates installable VPN app

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════╗"
    echo "║                                                  ║"
    echo "║    📱 UnderTheRadar VPN - Android Builder 📱    ║"
    echo "║                                                  ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
}

log() {
    echo -e "${GREEN}✅ $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Check requirements
check_requirements() {
    info "Checking build requirements..."
    
    # Check Java
    if ! command -v java &> /dev/null; then
        error "Java not found. Please install: sudo apt install openjdk-11-jdk"
    fi
    
    # Check if we're in the right directory
    if [[ ! -f "build.gradle" ]]; then
        error "Please run this script from the android-app directory"
    fi
    
    log "Requirements check passed"
}

# Configure server URL
configure_server() {
    info "Configuring VPN server URL..."
    
    if [[ -z "$VPN_SERVER_URL" ]]; then
        echo -n "Enter your VPN server URL (e.g., http://13.51.157.80): "
        read VPN_SERVER_URL
    fi
    
    if [[ -z "$VPN_SERVER_URL" ]]; then
        error "VPN server URL is required"
    fi
    
    # Update build.gradle with server URL
    sed -i "s|http://10.0.2.2:3001/api|${VPN_SERVER_URL}/api|g" app/build.gradle
    sed -i "s|https://your-vpn-server.com/api|${VPN_SERVER_URL}/api|g" app/build.gradle
    
    log "Server configured: ${VPN_SERVER_URL}"
}

# Create a simple debug APK
build_simple_apk() {
    info "Building Android APK (this may take a few minutes)..."
    
    # Make gradlew executable
    chmod +x gradlew
    
    # Clean and build
    info "Cleaning previous build..."
    ./gradlew clean || warn "Clean failed, continuing..."
    
    info "Building debug APK..."
    ./gradlew assembleDebug
    
    if [[ -f "app/build/outputs/apk/debug/app-debug.apk" ]]; then
        log "APK built successfully!"
        
        # Create distribution folder
        mkdir -p ../dist
        cp app/build/outputs/apk/debug/app-debug.apk ../dist/undertheradar-vpn.apk
        
        # Get APK info
        APK_SIZE=$(du -h ../dist/undertheradar-vpn.apk | cut -f1)
        
        echo
        log "APK created: ../dist/undertheradar-vpn.apk"
        log "APK size: ${APK_SIZE}"
        
        return 0
    else
        error "APK build failed"
    fi
}

# Show installation instructions
show_instructions() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════╗"
    echo "║                                                  ║"
    echo "║             🎉 BUILD COMPLETE! 🎉               ║"
    echo "║                                                  ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
    
    log "Your UnderTheRadar VPN Android app is ready!"
    echo
    echo -e "${BLUE}📱 Installation Steps:${NC}"
    echo "   1. Copy APK to your Android phone:"
    echo "      ${GREEN}../dist/undertheradar-vpn.apk${NC}"
    echo
    echo "   2. On Android phone:"
    echo "      • Settings → Security → Unknown Sources → Enable"
    echo "      • File Manager → Find APK → Tap to install"
    echo "      • Launch 'UnderTheRadar VPN' app"
    echo
    echo -e "${BLUE}🔐 Login Credentials:${NC}"
    echo "   • Use your VPN server admin account"
    echo "   • Server: ${VPN_SERVER_URL}"
    echo
    echo -e "${BLUE}🎯 Next Steps:${NC}"
    echo "   1. Install app on phone"
    echo "   2. Login with admin credentials"
    echo "   3. Subscribe to a plan (configure Stripe first)"
    echo "   4. Add device and connect to VPN"
    echo
    echo -e "${YELLOW}💰 Configure Payments:${NC}"
    echo "   Your VPN requires active subscription to work."
    echo "   Follow STRIPE_SETUP.md to enable payments."
    echo
    echo -e "${GREEN}🚀 Your VPN business is ready to launch!${NC}"
}

# Main function
main() {
    print_header
    check_requirements
    configure_server
    build_simple_apk
    show_instructions
}

# Run main function
main "$@"