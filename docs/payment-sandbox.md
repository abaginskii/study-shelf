# YooKassa pilot without money transfers

Production can run a test checkout using a separate test store. Test orders have `test: true`; a successful test payment grants the same time-limited access through the verified provider flow. It is not evidence of a real debit or receipt.

Server-only configuration:
- `YOOKASSA_TEST_MODE=true`
- `YOOKASSA_TEST_ENABLED=true`
- `YOOKASSA_TEST_SHOP_ID`: test shop ID
- `YOOKASSA_TEST_SECRET_KEY`: test store key starting with `test_`

Leave `YOOKASSA_ENABLED=false` and the existing real store credentials unchanged. Switching modes cannot enable real sales automatically. Missing or live keys fail closed before any request. Orders keep their mode; status/refund reads use the credentials for that order, even after switching modes. Stored subscription periods keep their test marker.

User flow: sign in → `/checkout` → clearly labelled test form → YooKassa test card → return to Polka → provider verification → marked test access in account/order history. Repeated notifications do not grant twice. Return without a successful provider status does not grant access.

Optional background notifications in the TEST store: `https://study-shelf-three.vercel.app/api/billing/webhook`, events `payment.succeeded`, `payment.canceled`, `refund.succeeded`. Returning to checkout and checking status also reconciles the order directly with YooKassa.

Use only official test cards. Documentation: https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing

Local verification: `node --import tsx --test tests/*.test.ts`; `pnpm build`; `POLKA_TEST_PRODUCTION=1 POLKA_TEST_BILLING_ONLY=1 pnpm test:design-browser`. Local payment responses and screenshots use explicit fixtures; no real money/provider requests.
