<p align="center">
  <img src="https://cdn.responsivevoice.org/assets/logo-128.svg" width="128" height="128" alt="ResponsiveVoice logo">
</p>

<h1 align="center">@responsivevoice/core</h1>

<p align="center">
  <a href="https://github.com/responsivevoice/core/actions/workflows/ci.yml"><img src="https://github.com/responsivevoice/core/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  Modern, TypeScript-first text-to-speech for the browser.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@responsivevoice/core"><img src="https://img.shields.io/npm/v/@responsivevoice/core.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@responsivevoice/core"><img src="https://img.shields.io/npm/dm/@responsivevoice/core.svg" alt="npm downloads"></a>
  <a href="https://github.com/responsivevoice/core"><img src="https://img.shields.io/badge/GitHub-core-181717?logo=github&logoColor=white" alt="GitHub"></a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/Chrome-66+-4285F4?logo=googlechrome&logoColor=white" alt="Chrome 66+">
  <img src="https://img.shields.io/badge/Firefox-57+-FF7139?logo=firefox&logoColor=white" alt="Firefox 57+">
  <img src="https://img.shields.io/badge/Safari-14+-006CFF?logo=safari&logoColor=white" alt="Safari 14+">
  <img src="https://img.shields.io/badge/Edge-16+-0078D7?logo=microsoftedge&logoColor=white" alt="Edge 16+">
</p>

---

## Installation

```bash
# npm
npm install @responsivevoice/core

# yarn
yarn add @responsivevoice/core

# pnpm
pnpm add @responsivevoice/core
```

## Get your API credentials

Out of the box, core runs in **demo mode** — it speaks with the browser's default voice only. Registering and verifying your website unlocks the full server voice catalog:

1. [**Register for a free ResponsiveVoice account**](https://responsivevoice.org/register).
2. A default website is created for you automatically — its identifier is your **API key**. Copy it from the dashboard.
3. Initialize core with your API key.
4. **Verify your website's domain** in the dashboard so requests from your site are recognized — this unlocks the full set of voices.

## Quick Start

### ES Module

```typescript
import { getResponsiveVoice } from '@responsivevoice/core';

const rv = await getResponsiveVoice({ apiKey: 'YOUR_API_KEY' });

// Basic usage
rv.speak('Hello world', 'UK English Female');

// With options
rv.speak('Hello world', 'UK English Female', {
  pitch: 1.0,
  rate: 1.0,
  volume: 1.0,
  onstart: () => console.log('Started'),
  onend: () => console.log('Finished'),
});
```

### Browser bundle (CDN)

```html
<script src="https://cdn.responsivevoice.org/sdk/latest/responsivevoice.js"></script>
<script>
  responsiveVoice.init({ apiKey: 'YOUR_API_KEY' });
  responsiveVoice.speak('Hello world', 'UK English Female');
</script>
```

## API

### Initialization

```typescript
// Recommended: async factory (creates singleton, calls init internally)
const rv = await getResponsiveVoice({ apiKey: 'YOUR_KEY' });

// Alternative: manual construction + init
const rv = new ResponsiveVoice();
await rv.init({ apiKey: 'YOUR_KEY' });
```

| Option           | Type      | Default               | Description                               |
| ---------------- | --------- | --------------------- | ----------------------------------------- |
| `apiKey`         | `string`  | —                     | Your registered website/origin identifier |
| `defaultVoice`   | `string`  | `'UK English Female'` | Default voice name                        |
| `forceFallback`  | `boolean` | `false`               | Force HTTP audio (skip native TTS)        |
| `characterLimit` | `number`  | `100`                 | Text chunk character limit                |
| `transport`      | `string`  | `'chunks'`            | Audio transport: chunks/stream/websocket  |

### Methods

#### `speak(text, voice?, options?)`

Speaks the given text.

```typescript
rv.speak('Hello world');
rv.speak('Hello world', 'US English Male');
rv.speak('Hello world', 'UK English Female', {
  rate: 1.2,
  onend: () => console.log('Done'),
});
```

#### `cancel()`

Stops all speech.

```typescript
rv.cancel();
```

#### `pause()`

Pauses current speech.

```typescript
rv.pause();
```

#### `resume()`

Resumes paused speech.

```typescript
rv.resume();
```

#### `getVoices()`

Returns available voices.

```typescript
const voices = rv.getVoices();
// [{ name: 'UK English Female', lang: 'en-GB', gender: 'f' }, ...]
```

#### `isPlaying()`

Returns whether speech is currently playing.

```typescript
if (rv.isPlaying()) {
  rv.cancel();
}
```

### Events

```typescript
rv.speak('Hello', 'UK English Female', {
  onstart: () => console.log('Started'),
  onend: () => console.log('Finished'),
  onerror: (error) => console.error('Error:', error),
});
```

## Browser Support

For detailed compatibility information, see the [Browser Support documentation](https://docs.responsivevoice.org/guides/browser-support/).

**Minimum browser versions:**

| Browser        | Min Version | Native TTS | Fallback API |
| -------------- | ----------- | ---------- | ------------ |
| Chrome         | 66+         | Yes        | Yes          |
| Firefox        | 57+         | Limited    | Yes          |
| Safari         | 14+         | Yes        | Yes          |
| Edge           | 16+         | Yes        | Yes          |
| iOS Safari     | 14+         | Yes        | Yes          |
| Chrome Android | 66+         | Yes        | Yes          |

### Bundlers

Core targets the browser. Install it from npm and bundle it with Vite, webpack, or any modern bundler — it runs in the browser, not server-side. For server-side or headless TTS (HTTP synthesis without a browser), use [`@responsivevoice/api-client`](https://github.com/responsivevoice/api-client) directly.

## Migration from Legacy

### Script Tag (most legacy users)

```html
<!-- Before -->
<script src="https://code.responsivevoice.org/responsivevoice.js?key=YOUR_KEY"></script>
<script>
  responsiveVoice.speak('Hello');
</script>

<!-- After — only change: remove ?key from URL, add init() call -->
<script src="https://cdn.responsivevoice.org/sdk/latest/responsivevoice.js"></script>
<script>
  responsiveVoice.init({ apiKey: 'YOUR_KEY' });
  responsiveVoice.speak('Hello');
</script>
```

See the [Migration Guide](https://docs.responsivevoice.org/getting-started/migration/) for details.

## Documentation

Full documentation at [docs.responsivevoice.org](https://docs.responsivevoice.org).

## License

[MIT](LICENSE)

---

**Other language SDKs:** [Python](https://github.com/responsivevoice/sdk-python) · [Go](https://github.com/responsivevoice/sdk-go) · [PHP](https://github.com/responsivevoice/sdk-php) · [Java](https://github.com/responsivevoice/sdk-java)

**AI coding agents:** install the [ResponsiveVoice skill](https://github.com/responsivevoice/skills) — `npx skills add responsivevoice/skills`
