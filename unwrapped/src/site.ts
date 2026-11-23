// Where share links point. The website uses its own address. The extension points at the hosted site,
// because extension pages cannot be opened by other people; VITE_SITE_URL overrides it for a fork.
const HOSTED = 'https://zaakirio.github.io/x-unwrapped/';
const inExtension = location.protocol === 'chrome-extension:';

export const SITE_URL: string =
  import.meta.env.VITE_SITE_URL || (inExtension ? HOSTED : `${location.origin}${location.pathname}`);

export const SITE_HOST = new URL(SITE_URL).host;
