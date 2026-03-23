# Security

This document describes the security properties of prompt-eval.

## API Key Storage

API keys are stored in the browser's `sessionStorage` only. They are:

- Cleared automatically when the tab or browser window closes
- Never sent to any server other than the selected AI provider's API (as an `Authorization` header)
- Never written to `localStorage`, cookies, or any persistent storage
- Never logged, collected, or transmitted to us

## Network Contacts

The app contacts exactly two external domains:

| Domain | Purpose |
|--------|---------|
| The selected AI provider's API (e.g., `api.openai.com`, `api.anthropic.com`) | Sending prompts and receiving completions |
| `brandon-fryslie.github.io/ai-providers-and-models/models.json` | Fetching the available model list |

No other network requests are made. The app is a static site hosted on GitHub Pages with no backend server.

## No Analytics or Tracking

This app includes:

- Zero analytics (no Google Analytics, Mixpanel, Segment, Plausible, etc.)
- Zero tracking pixels
- Zero telemetry
- Zero third-party scripts

### Automated Verification

This pledge is machine-verified. On every build, the CI pipeline (`"Verify no analytics domains in bundle"` step in `.github/workflows/deploy.yml`) scans the entire production bundle for known analytics domains (Google Analytics, Google Tag Manager, Mixpanel, Segment, Plausible, Amplitude, Hotjar, FullStory, Heap, Matomo, and Piwik). If any are found, the build fails and deployment is blocked.

## Subresource Integrity (SRI)

All JavaScript and CSS assets in the production build include [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) hashes. This means the browser verifies that every script and stylesheet loaded by the page matches the expected cryptographic hash — if a file is tampered with (e.g., via a compromised CDN or cache), the browser refuses to execute it.

SRI is enforced automatically by a custom Vite plugin during the build process. You can verify this by inspecting the `<script>` and `<link>` tags in the built `dist/index.html` — each will have an `integrity` attribute.

## How to Verify

You don't have to take our word for it. Here's how to confirm these claims yourself:

1. **Network tab**: Open your browser's DevTools (F12), go to the Network tab, and use the app normally. You'll see requests only to the two domains listed above.
2. **Source code**: This is an open-source project. Read `src/App.tsx` -- it's a single-file React app. Search for `fetch`, `XMLHttpRequest`, or any HTTP client usage to see every network call.
3. **Storage inspector**: In DevTools, go to Application > Session Storage to see exactly what's stored. Check Local Storage and Cookies to confirm they're empty.
4. **CSP**: Inspect the page's Content Security Policy headers or meta tags to see the restricted set of allowed domains.
5. **Build output**: Run `npm run build` and inspect the output in `dist/` -- there are no hidden scripts or third-party includes.
6. **SRI hashes**: After building, open `dist/index.html` and confirm that every `<script>` and `<link>` tag has an `integrity="sha384-..."` attribute. Your browser will refuse to load any asset whose content doesn't match its hash.
