/** UTM tagger: appends the tool's default utm_* parameters to outbound post links at publish
 *  time. Existing utm_* parameters on the URL always win — a deliberate per-post override in the
 *  composer must never be clobbered by the defaults. */

export interface UtmDefaults {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export function appendUtm(url: string, defaults: UtmDefaults): string {
  const source = defaults.utmSource?.trim();
  const medium = defaults.utmMedium?.trim();
  const campaign = defaults.utmCampaign?.trim();
  if (!source && !medium && !campaign) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url; // never break a publish over a malformed link
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;

  const set = (key: string, value: string | undefined) => {
    if (value && !parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
  };
  set('utm_source', source);
  set('utm_medium', medium);
  set('utm_campaign', campaign);
  return parsed.toString();
}
