# @responsivevoice/core

## 2.0.0

First public release of the rebuilt ResponsiveVoice — a complete, TypeScript-first rewrite of the original library, now split into focused, independently-versioned packages.

`@responsivevoice/core` is the browser text-to-speech client and a drop-in replacement for the legacy `responsivevoice.js` script — the same `speak`/`cancel`/`pause`/`resume` API, now fully typed and tree-shakeable. Free and open source.

### Highlights

- Native browser voices (Web Speech API) with automatic fallback to ResponsiveVoice server voices when the browser lacks one
- Around 100 built-in voices across many languages and genders via a language-matching resolution chain — and thousands more through premium providers (Microsoft Azure, OpenAI, Google Cloud, and more) via Bring Your Own Key
- Per-utterance callbacks (`onstart`/`onend`/`onerror`/`onboundary`) and global events, reliable across interruptions
- Optional streaming playback — HTTP audio or WebSocket streaming — so speech starts before the full clip is ready
- Server voices come from the v2 REST API, documented by a published OpenAPI 3.1 specification
- Automatic iOS and Android audio unlocking via a built-in, customizable permission prompt
- Voice catalog fetched and cached at runtime — new voices and quality improvements arrive continuously, no package upgrade required
- Ships ESM, CJS, and a tree-shakeable browser bundle, also on the CDN at `https://cdn.responsivevoice.org/sdk/latest/responsivevoice.js`

Part of the ResponsiveVoice ecosystem: `@responsivevoice/api-client` (REST & WebSocket client), `@responsivevoice/features` (dashboard plugins), `@responsivevoice/text` (text processing), `@responsivevoice/types` (schemas & types).

Documentation: https://docs.responsivevoice.org
