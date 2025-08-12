const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Subscription, User } = require('../models');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

router.get('/plans', async (req, res) => {
  const plans = {
    basic: {
      id: 'basic',
      name: 'Basic',
      price: 4.99,
      features: Subscription.getPlanFeatures('basic')
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      price: 9.99,
      features: Subscription.getPlanFeatures('pro')
    },
    business: {
      id: 'business',
      name: 'Business',
      price: 29.99,
      features: Subscription.getPlanFeatures('business')
    }
  };
  
  res.json({ plans });
});

router.get('/current', async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      where: { userId: req.user.id }
    });
    
    res.json({ subscription });
  } catch (error) {
    next(error);
  }
});

router.post('/create', async (req, res, next) => {
  try {
    const { plan, paymentMethodId } = req.body;
    
    if (!req.user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        payment_method: paymentMethodId,
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
      
      req.user.stripeCustomerId = customer.id;
      await req.user.save();
    }
    
    const stripeSubscription = await stripe.subscriptions.create({
      customer: req.user.stripeCustomerId,
      items: [{
        price: process.env[`STRIPE_PRICE_${plan.toUpperCase()}`]
      }],
      expand: ['latest_invoice.payment_intent']
    });
    
    const subscription = await Subscription.create({
      userId: req.user.id,
      plan,
      status: 'active',
      stripeSubscriptionId: stripeSubscription.id,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      features: Subscription.getPlanFeatures(plan)
    });
    
    logger.info(`New subscription created: ${req.user.email} - ${plan}`);
    
    res.json({
      subscription,
      clientSecret: stripeSubscription.latest_invoice.payment_intent.client_secret
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upgrade', async (req, res, next) => {
  try {
    const { newPlan } = req.body;
    const subscription = await Subscription.findOne({
      where: { userId: req.user.id }
    });
    
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }
    
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );
    
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{
        id: stripeSubscription.items.data[0].id,
        price: process.env[`STRIPE_PRICE_${newPlan.toUpperCase()}`]
      }],
      proration_behavior: 'create_prorations'
    });
    
    subscription.plan = newPlan;
    subscription.features = Subscription.getPlanFeatures(newPlan);
    await subscription.save();
    
    logger.info(`Subscription upgraded: ${req.user.email} - ${newPlan}`);
    
    res.json({ subscription });
  } catch (error) {
    next(error);
  }
});

router.post('/cancel', async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      where: { userId: req.user.id }
    });
    
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }
    
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });
    
    subscription.cancelAtPeriodEnd = true;
    await subscription.save();
    
    logger.info(`Subscription cancelled: ${req.user.email}`);
    
    res.json({ 
      message: 'Subscription will be cancelled at the end of the billing period',
      subscription 
    });
  } catch (error) {
    next(error);
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const stripeSubscription = event.data.object;
        const subscription = await Subscription.findOne({
          where: { stripeSubscriptionId: stripeSubscription.id }
        });
        
        if (subscription) {
          subscription.status = stripeSubscription.status === 'active' ? 'active' : 'cancelled';
          subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
          await subscription.save();
        }
        break;
    }
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

module.exports = router;