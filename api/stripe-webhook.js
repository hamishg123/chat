const admin = require("firebase-admin");
const Stripe = require("stripe");

// Initialize Firebase Admin SDK (ensure your Firebase project config is set up)
// You'll need to set FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and FIREBASE_PROJECT_ID
// as environment variables in Vercel.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

// Initialize Stripe with your secret key
// You'll need to set STRIPE_SECRET_KEY as an environment variable in Vercel.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// You'll need to set STRIPE_WEBHOOK_SECRET as an environment variable in Vercel.
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  let event;

  try {
    // Verify Stripe webhook signature
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Retrieve the Firebase UID from client_reference_id
    const firebaseUid = session.client_reference_id;

    if (firebaseUid) {
      try {
        // Update user's Pro status in Firebase
        await db.ref(`users/${firebaseUid}`).update({
          isPro: true,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
        });
        console.log(`User ${firebaseUid} upgraded to Pro.`);
        return res.status(200).json({ received: true });
      } catch (error) {
        console.error(`Error updating Firebase for user ${firebaseUid}: ${error.message}`);
        return res.status(500).json({ error: "Failed to update user in Firebase" });
      }
    } else {
      console.warn("checkout.session.completed event received without client_reference_id.");
      return res.status(400).json({ error: "Missing client_reference_id" });
    }
  }

  // Return a 200 response for other event types
  res.status(200).json({ received: true });
};
