# UnderTheRadar VPN Android App

**Professional Android VPN client for your $2/month VPN service!**

## 📱 **Features**

### **Core VPN Functionality:**
- ✅ **WireGuard Protocol** - Modern, fast, secure
- ✅ **One-tap Connect** - Simple user experience
- ✅ **Auto-reconnect** - Maintains connection stability
- ✅ **Kill Switch** - Protects if VPN drops
- ✅ **Real-time Status** - Shows connection state

### **User Management:**
- ✅ **Secure Login** - Encrypted credential storage
- ✅ **Subscription Check** - Enforces payment requirements
- ✅ **Device Management** - Add/remove VPN configs
- ✅ **QR Code Import** - Easy config sharing
- ✅ **Multi-device Support** - Up to 10 devices per account

### **Professional UI:**
- ✅ **Material Design 3** - Modern Android interface
- ✅ **Dark/Light Themes** - Automatic system matching
- ✅ **Subscription Status** - Clear payment reminders
- ✅ **Connection Analytics** - Usage statistics
- ✅ **Responsive Design** - Works on phones/tablets

---

## 🛠️ **Build Instructions**

### **Requirements:**
- Android Studio 2023.1+ (Hedgehog)
- Android SDK 34+
- Minimum Android 5.0 (API 21)
- Kotlin 1.9.10+

### **Setup:**
1. **Clone the repository:**
   ```bash
   git clone https://github.com/FatherWoland/undertheradar-vpn
   cd undertheradar-vpn/android-app
   ```

2. **Configure API endpoints:**
   ```kotlin
   // In app/build.gradle, update:
   buildConfigField "String", "API_BASE_URL", '"https://your-vpn-server.com/api"'
   ```

3. **Build and run:**
   ```bash
   ./gradlew assembleRelease
   # APK will be in app/build/outputs/apk/release/
   ```

---

## 📦 **App Architecture**

### **Modern Android Stack:**
- **Architecture**: MVVM with Repository pattern
- **UI**: Material Design 3 + View Binding
- **Networking**: Retrofit + OkHttp
- **Storage**: Encrypted SharedPreferences
- **VPN**: WireGuard Android library
- **Threading**: Kotlin Coroutines

### **Key Components:**
```
app/src/main/java/com/undertheradar/vpn/
├── data/
│   ├── model/          # User, VpnClient data classes
│   └── repository/     # AuthRepository, VpnRepository
├── network/            # API service, Retrofit client
├── service/            # VPN service (WireGuard)
├── ui/
│   ├── main/          # Main dashboard activity
│   ├── auth/          # Login/registration
│   └── scanner/       # QR code scanning
└── utils/             # Helper utilities
```

---

## 🔐 **Security Features**

### **Data Protection:**
- ✅ **Encrypted Storage** - All credentials encrypted
- ✅ **Certificate Pinning** - Prevents MITM attacks
- ✅ **Token Refresh** - Automatic session management
- ✅ **Secure Networking** - TLS 1.3 minimum

### **VPN Security:**
- ✅ **WireGuard Keys** - ChaCha20 encryption
- ✅ **Perfect Forward Secrecy** - Rotating keys
- ✅ **DNS Leak Protection** - Secure DNS routing
- ✅ **IPv6 Support** - Full protocol coverage

---

## 📱 **APK Distribution**

### **Google Play Store:**
```kotlin
// Release build configuration
android {
    signingConfigs {
        release {
            storeFile file('keystore.jks')
            storePassword 'your-keystore-password'
            keyAlias 'undertheradar-vpn'
            keyPassword 'your-key-password'
        }
    }
}
```

### **Direct APK Distribution:**
1. **Build release APK:**
   ```bash
   ./gradlew assembleRelease
   ```

2. **Upload to your server:**
   ```bash
   scp app/build/outputs/apk/release/app-release.apk user@yourserver.com:/var/www/html/
   ```

3. **Download link for customers:**
   ```
   https://your-vpn-server.com/undertheradar-vpn.apk
   ```

---

## 🚀 **Publishing Strategy**

### **Google Play Store:**
- **Estimated approval**: 2-7 days
- **Age rating**: Teen (13+)
- **Categories**: Tools, Communication
- **Required**: Privacy policy, data handling disclosure

### **Alternative Distribution:**
- **Direct APK download** from your website
- **Amazon AppStore** (less restrictions)
- **Samsung Galaxy Store**
- **F-Droid** (open source builds)

---

## 💰 **Monetization Integration**

### **Subscription Enforcement:**
- App checks subscription status on startup
- Blocks VPN connection if payment expired
- Redirects to upgrade page for payments
- Real-time subscription validation

### **In-App Upgrade Flow:**
```kotlin
// Redirect to web payment
val intent = Intent(Intent.ACTION_VIEW, 
    Uri.parse("https://your-vpn-server.com/#pricing"))
startActivity(intent)
```

---

## 🔧 **Customization**

### **Branding:**
- Replace `app/src/main/res/mipmap-*/` with your icons
- Update `app/src/main/res/values/colors.xml` for brand colors
- Modify `app/src/main/res/values/strings.xml` for app text

### **Server Configuration:**
- Update `API_BASE_URL` in `app/build.gradle`
- Configure Stripe payment URLs
- Set custom server endpoints

---

## 📊 **Analytics & Monitoring**

### **Built-in Tracking:**
- Connection success/failure rates
- User engagement metrics
- Subscription conversion tracking
- Crash reporting (via Firebase)

### **Revenue Analytics:**
- Monthly recurring revenue (MRR)
- Customer lifetime value (CLV)
- Churn rate monitoring
- Payment failure tracking

---

## 📞 **Support Integration**

### **Customer Support:**
- In-app support email links
- Automatic error reporting
- Connection diagnostics
- Server status checking

---

## 🎯 **Competitive Advantages**

### **Vs ExpressVPN/NordVPN Apps:**
- ✅ **84% cheaper pricing** ($2 vs $13/month)
- ✅ **Faster WireGuard** vs slower OpenVPN
- ✅ **Lighter app size** (~10MB vs 50MB+)
- ✅ **Better battery life** - WireGuard efficiency
- ✅ **Simpler interface** - No feature bloat

---

**🚀 Your customers now have a professional Android app that rivals the big VPN companies - at a fraction of the price!**

**Ready to dominate the mobile VPN market?** 📱