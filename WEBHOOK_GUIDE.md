# 🚀 UChat Pro: Automated Webhook Setup Guide

This guide describes an optional Stripe webhook for deployments that choose to accept Stripe payments. The current UChat upgrade button instead offers a one-time £1 in-person payment; the administrator must activate Pro after receiving payment.

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

## ✅ Optional Stripe webhook flow
If you separately configure a Stripe checkout flow, the webhook can update a user's `isPro` status after a successful `checkout.session.completed` event. The current in-person payment flow does not open Stripe or activate Pro automatically; an administrator must update the user's `isPro` status in Firebase after payment.
