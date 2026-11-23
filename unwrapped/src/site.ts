// Where share links point. The website uses its own address; the extension needs the hosted site
// (VITE_SITE_URL at build time) because extension pages cannot be opened by other people.
const inExtension = location.protocol === 'chrome-extension:';

export const SITE_URL: string | null =
  import.meta.env.VITE_SITE_URL || (inExtension ? null : `${location.origin}${location.pathname}`);

export const SITE_HOST = SITE_URL ? new URL(SITE_URL).host : null;
