import { pathToFileURL } from 'node:url';

// Local desktop can use its bundled runtime; CI uses a pinned installed package.
export const { chromium } = await import(process.env.GUCANG_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.GUCANG_PLAYWRIGHT_PATH).href
  : 'playwright');
