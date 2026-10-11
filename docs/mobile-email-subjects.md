## Current pilot authentication
Login/password registration and sign-in only. Account contact email saves without verification; it is not an authentication identity or a password reset channel. No mail service/key is required. Old email challenge API actions are disabled; existing canonical usernames, sessions, account IDs and libraries remain. Account shows the canonical login explicitly.

# Mobile, email accounts and subjects

All authenticated installed phone PWAs receive the app workspace. Eligibility affects presentation only, not owner permissions. The phone browser provides library reading, folders, account and a persistent install invitation. Android installs the PWA through its browser; iPhone uses Add to Home Screen. No APK is distributed.

Registration requires email verification; display name is optional. Email binding requires the existing password and email code, preserving the account ID, username, library and recovery credentials. Legacy username login remains supported. Codes expire after 10 minutes, have five attempts and cannot be replayed or confirmed by another account. Email and IP sending limits are enforced.

Set Production MAIL_PROVIDER=brevo and BREVO_API_KEY privately in Vercel. Confirm polka.sluzhbazaboty@yandex.ru under Brevo Settings > Senders, Domains, IPs > Senders using the code from its email. MAIL_FROM overrides the sender. Delivery uses HTTPS with a 12-second timeout and no automatic resend or SMTP fallback. API acceptance is not proof of inbox delivery. Owner health checks API access and active sender without sending email; delivery needs a real signup/linking check. Free plan: 300 emails/day; exhausted quota can queue transactional messages, so codes may expire before delivery. Brevo temporarily rewrites unauthenticated/free-domain From addresses to its compliant transactional domain; replyTo stays the verified Yandex address. Its free branding remains. No paid upgrade is required for the pilot, but account activation and actual delivery must be checked.

SMTP2GO was rejected because signup requires a business/owned-domain email, even though single senders are supported after signup. Do not ask the user to register there again.

Legacy SMTP remains available with MAIL_PROVIDER=smtp and SMTP_PASSWORD (Yandex app password). Defaults: smtp.yandex.ru, TLS 465, polka.sluzhbazaboty@yandex.ru. Existing login stays available without mail setup; registration and binding explicitly report mail unavailable. Never log keys, provider responses, recipients, or confirmation codes.

Subject folder names, colors and icons are private per library. Renames retain aliases, preserve originals and AI results, and appear in exported folder metadata. Uploaded materials have a shortcut to edit title and subject in the source editor.

Tests use synthetic accounts and mocked email delivery. Standalone mode, keyboard and safe areas are emulated; installation still needs a user action in the actual device browser.
