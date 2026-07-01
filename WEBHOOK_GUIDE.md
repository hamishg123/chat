# 🚀 UChat Pro: Automated Webhook Setup Guide

This guide will help you set up a **completely free** automated system to grant "Pro" status to your users as soon as they pay via Stripe.

## 1. Prerequisites
- A **Vercel** account (Free tier is perfect).
- Your **Stripe** Secret Key and Webhook Secret.
- Your **Firebase** Service Account credentials.

---

## 2. Deployment Steps

### Step A: Push to GitHub
I have already added the webhook handler to your repository in `/api/stripe-webhook.js`. Simply push these changes to your GitHub repo.

### Step B: Connect to Vercel
1. Go to [Vercel.com](https://vercel.com) and click **"Add New" > "Project"**.
2. Select your `chat` repository.
3. In the **Environment Variables** section, add the following keys:

| Variable Name | Where to find it |
| :--- | :--- |
| `STRIPE_SECRET_KEY` | Stripe Dashboard > Developers > API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard > Developers > Webhooks (after creating endpoint) |
| `FIREBASE_PROJECT_ID` | Firebase Console > Project Settings |
| `FIREBASE_CLIENT_EMAIL` | Firebase Console > Project Settings > Service Accounts |
| `FIREBASE_PRIVATE_KEY` | Firebase Console > Project Settings > Service Accounts (Generate new key) |
| `FIREBASE_DATABASE_URL` | Firebase Console > Realtime Database URL |

4. Click **Deploy**. Vercel will give you a URL (e.g., `https://u-chat-webhook.vercel.app`).

---

## 3. Finalize Stripe Setup
1. Go to your [Stripe Webhooks Dashboard](https://dashboard.stripe.com/webhooks).
2. Click **"Add Endpoint"**.
3. **Endpoint URL:** `https://your-vercel-url.vercel.app/api/stripe-webhook`
4. **Select Events:** Choose `checkout.session.completed`.
5. Click **"Add endpoint"**.
6. Copy the **Signing Secret** and paste it into Vercel as `STRIPE_WEBHOOK_SECRET`.

---

## ✅ How it works
1. A user clicks **"Upgrade for £0.99/mo"** in UChat.
2. UChat sends their **Firebase UID** to Stripe.
3. Once the payment is successful, Stripe sends a signal to your **Vercel Webhook**.
4. The Webhook automatically updates that user's status to `isPro: true` in your **Firebase Database**.
5. The user's UChat app instantly reflects their new Pro status!
