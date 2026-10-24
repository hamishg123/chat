# UChat Admin Panel Setup

The admin panel uses the normal Firebase email-and-password sign-in. It does not ask for, store, or embed a second password. Only the signed-in account whose email matches `ADMIN_EMAIL` can see the panel, and the server API verifies the Firebase ID token and checks the same configured email before every admin operation.

## Deploy the secure API

Deploy this repository to Vercel so `/api/admin-users` is available on the same origin as the app. The root `package.json` declares Node.js 22 or newer and the server-side Firebase Admin and Stripe dependencies.

In the Vercel project's environment variables, configure:

- `ADMIN_EMAIL` as `hamishgordon051@gmail.com`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_DATABASE_URL`

These Firebase service-account values are server secrets. Keep them in Vercel environment variables; never add them to `script.js`, commit them, or send them to users. For `FIREBASE_PRIVATE_KEY`, use the service-account private key with newline characters preserved or escaped as `\\n`.

Redeploy after setting the variables. Then sign in to UChat with the Firebase account registered to `hamishgordon051@gmail.com` and its existing password. The Account section in Settings will show **Open Admin Panel** for that signed-in email. If the secure API has not been deployed or configured, admin changes will fail closed rather than writing from the browser.

## Available controls

The panel shows account and Pro totals, supports exact lookup by username or email, and lets the admin grant or remove Pro for one account. Pro changes are recorded in a server-readable audit log. The API does not provide bulk changes, account deletion, or password access.

In chat, a Pro member's bookmark action records **Saved in Chat** on that chat's shared message. Other participants in that chat see the saved label and a grey saved-message treatment. Each participant can toggle only their own saved state. Saves are kept only on the message in that chat; they are not copied to or listed in Settings.
