# Mobile, email accounts and subjects

All authenticated installed phone PWAs receive the app workspace. Eligibility affects presentation only, not owner permissions. The phone browser provides library reading, folders, account and a persistent install invitation. Android installs the PWA through its browser; iPhone uses Add to Home Screen. No APK is distributed.

Registration requires email verification; display name is optional. Email binding requires the existing password and email code, preserving the account ID, username, library and recovery credentials. Legacy username login remains supported. Codes expire after 10 minutes, have five attempts and cannot be replayed or confirmed by another account. Email and IP sending limits are enforced.

Set Production SMTP_PASSWORD to the Yandex Mail app password. Defaults: smtp.yandex.ru, TLS 465, polka.sluzhbazaboty@yandex.ru. SMTP_HOST, SMTP_PORT and SMTP_USER can override defaults. Existing login stays available without mail setup; registration and binding explicitly report mail unavailable.

Subject folder names, colors and icons are private per library. Renames retain aliases, preserve originals and AI results, and appear in exported folder metadata. Uploaded materials have a shortcut to edit title and subject in the source editor.

Tests use synthetic accounts and mocked email delivery. Standalone mode, keyboard and safe areas are emulated; installation still needs a user action in the actual device browser.
