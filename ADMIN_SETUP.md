# UChat Admin Console Setup

The admin console no longer calls a Vercel API. It uses the signed-in Firebase Authentication session and reads or updates Realtime Database directly. The console includes total accounts, Pro and standard counts, accounts joined this month, searchable member cards, Pro filters, pagination, and a recent membership-change feed.

## Important: Firebase Auth plus Database Rules

Firebase Authentication identifies the signed-in user; it does not, on its own, authorize admin database access. Realtime Database Security Rules must enforce that only `hamishgordon051@gmail.com` can read the whole user directory, change another user's `isPro` flag, and read/write the admin activity log. The app checks the email to show the console, but the database rules are what protect the data and actions.

In Firebase Console, open **Realtime Database → Rules** and merge the following entries into the existing `rules` object. Do not replace the entire ruleset with this fragment: preserve the app's current chat, profile, group, and presence rules. If the existing rules already have a `users` or `adminAudit` entry, merge the indicated properties into that entry rather than creating duplicate keys.

```json
{
  "rules": {
    "users": {
      ".read": "auth != null && auth.token.email === 'hamishgordon051@gmail.com'",
      "$uid": {
        "isPro": {
          ".write": "auth != null && auth.token.email === 'hamishgordon051@gmail.com'",
          ".validate": "auth != null && (auth.token.email === 'hamishgordon051@gmail.com' || newData.val() === data.val())"
        }
      }
    },
    "adminAudit": {
      ".read": "auth != null && auth.token.email === 'hamishgordon051@gmail.com'",
      ".write": "auth != null && auth.token.email === 'hamishgordon051@gmail.com'"
    }
  }
}
```

The user-profile `.validate` check prevents ordinary users from granting themselves Pro through their own profile writes. A user may remove their own `isPro` flag (which only removes access); only the admin email can set it to `true`. Check for any existing broad parent `.write` rules: Realtime Database permissions are additive, so a permissive ancestor rule can override narrower intent. Keep access to the rest of the app consistent with your existing rules and publish after merging.

Then sign in to UChat with the Firebase account whose email is `hamishgordon051@gmail.com`. **Admin Console** appears in the sidebar and **Open Admin Panel** remains under Account in Settings. If reads or actions are denied, the console explains that the Firebase Rules need updating. No Vercel deployment, service-account key, or second admin password is used.

## Controls and privacy

The console offers account and membership metrics, substring search across username/email/user ID, All/Pro/Standard filters, progressive loading of member cards, individual Pro grant/removal, and a recent activity list. It does not expose password data or offer bulk account deletion. Admin activity records are stored under `adminAudit`.

In chat, a Pro member's bookmark action records **Saved in Chat** on that chat's shared message. Other participants in that chat see the saved label and darker message treatment. Each participant can toggle only their own saved state. Saves are kept only on the message in that chat and are not copied to Settings.
