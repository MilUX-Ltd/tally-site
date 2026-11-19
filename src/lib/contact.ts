// Mail links for corrections and new listings. Plain mailto links built at
// build time: no form, nothing stored, no third party. The visitor's own mail
// client sends the message.

export const CONTACT_EMAIL = 'contact@milux.co.uk';

/** Percent-encodes every reserved character, line breaks as CRLF (RFC 6068). */
const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));

function mailto(subject: string, body: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${enc(subject)}&body=${enc(body)}`;
}

/** "Correct this listing" on a company page. */
export function correctionMailto(name: string, pageUrl: string): string {
  return mailto(
    `Tally correction: ${name}`,
    [
      'Please tell us what needs correcting on this Tally listing, and give a public web page that shows the right details. We list public information only.',
      '',
      `Listing: ${pageUrl}`,
      '',
      'What needs correcting:',
      '',
      'Public page that shows it:',
      '',
    ].join('\n'),
  );
}

/** "Get listed", site-wide. */
export function getListedMailto(): string {
  return mailto(
    'Tally: please list my company',
    [
      'Tally lists UK defence companies from public sources. Please tell us:',
      '',
      'Company name:',
      'Website:',
      'What you do for defence:',
      'Where you are based (town or postcode):',
      'A public page that shows this:',
      '',
    ].join('\n'),
  );
}
