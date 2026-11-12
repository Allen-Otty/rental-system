# Makao web app (installable PWA)

React + TypeScript + Vite. Talks to the Django API in `../backend`.

```
npm install
npm run dev          # http://localhost:3000, proxies /api to http://localhost:8000
npm run build        # production build (needs the real API)
npm run build:demo   # same app running on built-in sample data, no server needed
npm test             # accessibility, contrast and behaviour tests
```

Photos: drop real property photos into `public/photos/` (hero image is `public/photos/hero.jpg`).
Accessibility: WCAG 2.2 AA targets. Colours are semantic tokens in `src/styles/tokens.css`; `src/tokens.test.ts` fails the build if any pair drops below AA contrast.
Demo mode sign-ins: `tenant@demo`, `landlord@demo`, `provider@demo` with any password.
