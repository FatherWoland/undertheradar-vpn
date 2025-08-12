#!/bin/bash
# Build script for UnderTheRadar VPN Android app
# Creates production-ready APK for distribution

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                                                                  ║"
    echo "║        🤖 UnderTheRadar VPN - Android APK Builder 🤖           ║"
    echo "║                                                                  ║"
    echo "║                Building your $2/month VPN app                    ║"
    echo "║                                                                  ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
}

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ❌ $1${NC}"
    exit 1
}

# Check requirements
check_requirements() {
    log "Checking build requirements..."
    
    # Check if we're in the right directory
    if [[ ! -f "build.gradle" ]]; then
        error "Please run this script from the android-app directory"
    fi
    
    # Check for gradlew
    if [[ ! -f "gradlew" ]]; then
        error "Gradle wrapper not found. Please ensure this is a valid Android project."
    fi
    
    # Make gradlew executable
    chmod +x gradlew
    
    log "Requirements check passed"
}

# Configure API endpoint
configure_api() {
    log "Configuring API endpoint..."
    
    if [[ -z "$VPN_SERVER_URL" ]]; then
        echo -n "Enter your VPN server URL (e.g., https://vpn.yourdomain.com): "
        read VPN_SERVER_URL
    fi
    
    if [[ -z "$VPN_SERVER_URL" ]]; then
        error "VPN server URL is required"
    fi
    
    # Update build.gradle with server URL
    sed -i "s|https://your-vpn-server.com/api|${VPN_SERVER_URL}/api|g" app/build.gradle
    
    log "API endpoint configured: ${VPN_SERVER_URL}/api"
}

# Clean previous builds
clean_build() {
    log "Cleaning previous builds..."
    ./gradlew clean
    log "Clean completed"
}

# Build debug APK
build_debug() {
    log "Building debug APK..."
    ./gradlew assembleDebug
    
    if [[ -f "app/build/outputs/apk/debug/app-debug.apk" ]]; then
        log "Debug APK built successfully"
        ls -lh app/build/outputs/apk/debug/app-debug.apk
    else
        error "Debug APK build failed"
    fi
}

# Build release APK (unsigned)
build_release() {
    log "Building release APK..."
    ./gradlew assembleRelease
    
    if [[ -f "app/build/outputs/apk/release/app-release-unsigned.apk" ]]; then
        log "Release APK built successfully"
        ls -lh app/build/outputs/apk/release/app-release-unsigned.apk
    else
        error "Release APK build failed"
    fi
}

# Create signed APK (if keystore exists)
sign_apk() {
    if [[ -f "keystore.jks" ]]; then
        log "Signing APK with keystore..."
        
        echo -n "Enter keystore password: "
        read -s KEYSTORE_PASS
        echo
        
        echo -n "Enter key alias: "
        read KEY_ALIAS
        
        echo -n "Enter key password: "
        read -s KEY_PASS
        echo
        
        # Sign the APK
        jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
            -keystore keystore.jks \
            -storepass "$KEYSTORE_PASS" \
            -keypass "$KEY_PASS" \
            app/build/outputs/apk/release/app-release-unsigned.apk \
            "$KEY_ALIAS"
        
        # Align the APK
        if command -v zipalign &> /dev/null; then
            zipalign -v 4 \
                app/build/outputs/apk/release/app-release-unsigned.apk \
                app/build/outputs/apk/release/undertheradar-vpn-signed.apk
            
            log "Signed APK created: undertheradar-vpn-signed.apk"
        else
            warn "zipalign not found. APK signed but not aligned."
            mv app/build/outputs/apk/release/app-release-unsigned.apk \
               app/build/outputs/apk/release/undertheradar-vpn-signed.apk
        fi
    else
        warn "No keystore found. Creating unsigned APK for testing only."
        mv app/build/outputs/apk/release/app-release-unsigned.apk \
           app/build/outputs/apk/release/undertheradar-vpn-unsigned.apk
    fi
}

# Copy APK to distribution folder
package_for_distribution() {
    log "Packaging for distribution..."
    
    mkdir -p ../dist/
    
    # Copy the final APK
    if [[ -f "app/build/outputs/apk/release/undertheradar-vpn-signed.apk" ]]; then
        cp app/build/outputs/apk/release/undertheradar-vpn-signed.apk ../dist/
        FINAL_APK="undertheradar-vpn-signed.apk"
    elif [[ -f "app/build/outputs/apk/release/undertheradar-vpn-unsigned.apk" ]]; then
        cp app/build/outputs/apk/release/undertheradar-vpn-unsigned.apk ../dist/
        FINAL_APK="undertheradar-vpn-unsigned.apk"
    else
        error "No APK found to package"
    fi
    
    # Create version info
    cat > ../dist/version.txt << EOF
UnderTheRadar VPN Android App
Version: 1.0.0
Build Date: $(date)
Server URL: ${VPN_SERVER_URL}
APK Size: $(du -h ../dist/${FINAL_APK} | cut -f1)
EOF
    
    log "APK packaged in ../dist/${FINAL_APK}"
}

# Show installation instructions
show_instructions() {
    echo -e "${GREEN}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║                    🎉 BUILD SUCCESSFUL! 🎉                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"
    
    log "Your VPN Android app is ready!"
    echo
    echo -e "${BLUE}📱 Installation Instructions:${NC}"
    echo "   1. Transfer APK to your Android device"
    echo "   2. Enable 'Install from Unknown Sources' in Android Settings"
    echo "   3. Tap the APK file to install"
    echo "   4. Launch 'UnderTheRadar VPN' app"
    echo "   5. Login with your VPN account credentials"
    echo
    echo -e "${BLUE}🌐 Distribution Options:${NC}"
    echo "   • Upload to your website for customer downloads"
    echo "   • Submit to Google Play Store"
    echo "   • Distribute via Amazon AppStore"
    echo "   • Share directly with beta testers"
    echo
    echo -e "${BLUE}📊 APK Details:${NC}"
    ls -lh ../dist/${FINAL_APK}
    echo
    echo -e "${YELLOW}🔒 Security Note:${NC}"
    if [[ "$FINAL_APK" == *"unsigned"* ]]; then
        echo "   This APK is unsigned and only suitable for testing."
        echo "   For production, create a keystore and rebuild with signing."
    else
        echo "   APK is signed and ready for distribution."
    fi
    echo
    echo -e "${GREEN}🚀 Your customers can now download a professional VPN app!${NC}"
}

# Main build process
main() {
    print_header
    
    check_requirements
    configure_api
    clean_build
    build_release
    sign_apk
    package_for_distribution
    show_instructions
}

# Run main function
main "$@"