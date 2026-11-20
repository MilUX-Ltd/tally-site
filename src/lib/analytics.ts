// Cloudflare Web Analytics (cookieless visitor counts, D-wsjc7).
// The site token is public: it appears in every page's HTML. Empty means no
// beacon is rendered. Set it from the snippet Cloudflare shows for
// tally.milux.co.uk (Analytics, Web Analytics).
export const CF_BEACON_TOKEN = '';

export function beaconConfig(token: string = CF_BEACON_TOKEN): string | null {
  return /^[a-f0-9]{32}$/.test(token) ? JSON.stringify({ token }) : null;
}
