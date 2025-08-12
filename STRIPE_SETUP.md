# 💳 Stripe Payment Setup Guide

**Make your VPN service a paid subscription business in 10 minutes!**

---

## 🔧 **Quick Setup Steps**

### **1. Create Stripe Account**
1. Go to [stripe.com](https://stripe.com) and create an account
2. Complete business verification
3. Navigate to **Developers** → **API keys**

### **2. Configure API Keys**
Copy these keys from your Stripe dashboard:

```bash
# Edit your .env file
sudo nano /opt/undertheradar-vpn/.env

# Replace these lines:
STRIPE_SECRET_KEY=sk_test_your_actual_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret

# For production:
STRIPE_SECRET_KEY=sk_live_your_actual_stripe_live_key
```

### **3. Create Products & Prices**
In Stripe Dashboard → **Products**:

**Basic Plan:**
- Product Name: "Basic VPN"
- Price: $5/month
- Copy the Price ID: `price_xxxxxxxxx`

**Premium Plan:**
- Product Name: "Premium VPN" 
- Price: $10/month
- Copy the Price ID: `price_xxxxxxxxx`

### **4. Update Web Portal**
Edit `/var/www/undertheradar-vpn/index.html`:

```javascript
// Replace these price IDs with your actual Stripe price IDs
const planPriceMap = {
    'basic': 'price_1234567890abcdef',    // Your Basic plan price ID
    'premium': 'price_0987654321fedcba'   // Your Premium plan price ID
};

// Replace with your Stripe publishable key
const stripe = Stripe('pk_test_your_actual_stripe_publishable_key');
```

### **5. Setup Webhook**
1. In Stripe Dashboard → **Webhooks** → **Add endpoint**
2. URL: `https://yourdomain.com/api/webhook`
3. Listen to events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Copy the webhook secret to your `.env` file

### **6. Restart Server**
```bash
sudo systemctl restart undertheradar-vpn
```

---

## 🚀 **Pricing Strategy**

### **Recommended Pricing:**
- **Basic Plan**: $5-8/month (3 devices)
- **Premium Plan**: $10-15/month (10 devices)
- **Annual Discount**: 20% off (implement later)

### **Competitor Analysis:**
- ExpressVPN: $12.95/month
- NordVPN: $11.95/month  
- Surfshark: $12.95/month
- **Your Advantage**: Better prices + faster WireGuard protocol

---

## 💰 **Revenue Projections**

### **Conservative Estimates:**
- **100 customers**: $500-1,000/month
- **500 customers**: $2,500-5,000/month  
- **1,000 customers**: $5,000-10,000/month

### **Growth Strategy:**
1. **Month 1-3**: Focus on reliability & support
2. **Month 4-6**: Add more server locations
3. **Month 7-12**: Marketing & feature expansion

---

## 🛡️ **Security & Compliance**

### **Required for Legal Operation:**
- [ ] Privacy Policy
- [ ] Terms of Service  
- [ ] GDPR compliance (EU customers)
- [ ] Payment processing compliance (PCI DSS)
- [ ] Business registration
- [ ] Tax registration

### **Stripe Features You Get:**
- ✅ PCI DSS Level 1 compliance
- ✅ 3D Secure authentication
- ✅ Fraud prevention
- ✅ International payments
- ✅ Subscription management
- ✅ Automated invoicing

---

## 📊 **Dashboard Features**

### **For Customers:**
- ✅ Subscription status
- ✅ Payment history  
- ✅ Device management
- ✅ Usage statistics
- ✅ Cancel anytime

### **For You (Admin):**
- ✅ Revenue tracking
- ✅ Customer analytics
- ✅ Subscription management
- ✅ Payment disputes
- ✅ Growth metrics

---

## 🚨 **Testing Checklist**

Before going live, test:

- [ ] User registration
- [ ] Stripe checkout flow
- [ ] Successful payment processing
- [ ] Subscription activation
- [ ] VPN access granted
- [ ] Failed payment handling
- [ ] Subscription cancellation
- [ ] Webhook processing
- [ ] Device limits enforced

### **Test Cards:**
```
4242 4242 4242 4242 - Visa (Success)
4000 0000 0000 0002 - Visa (Declined)
4000 0000 0000 9995 - Visa (Insufficient funds)
```

---

## 🔄 **Going Live**

### **Switch to Production:**
1. Replace all `sk_test_` keys with `sk_live_` keys
2. Replace `pk_test_` with `pk_live_` keys
3. Update webhook URL to production domain
4. Test with real payment methods
5. Set up monitoring & alerts

### **Launch Checklist:**
- [ ] SSL certificate active
- [ ] Domain properly configured
- [ ] All Stripe keys updated
- [ ] Legal documents published
- [ ] Support email configured
- [ ] Monitoring in place

---

## 💡 **Pro Tips**

### **Increase Conversions:**
- Offer 30-day money-back guarantee
- Show customer testimonials
- Add live chat support
- Highlight security benefits
- Compare with competitors

### **Reduce Churn:**
- Send payment failure emails
- Offer pause subscriptions
- Provide excellent support
- Regular service updates
- Customer feedback surveys

### **Scale Revenue:**
- Add annual plans (discount)
- Family plans (5+ devices)
- Business plans (team features)
- Add-ons (dedicated IP)
- Referral program

---

## 📞 **Support**

### **Customer Questions:**
- "How do I cancel?" → Stripe customer portal
- "Payment failed?" → Retry payment link
- "Refund request?" → Stripe dashboard
- "Technical issues?" → Your support system

### **Common Issues:**
- Webhook not working → Check URL & secrets
- Payments failing → Check Stripe logs
- Users can't access → Check subscription status
- Double charges → Stripe handles duplicates

---

**🎯 Ready to make money? Configure those Stripe keys and start charging!**

**Your VPN business is now a subscription service that can scale to millions.** 💰