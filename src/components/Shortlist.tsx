// What the shortlist offers once it holds companies: a link to share them, a
// spreadsheet download, and the way to talk to MilUX about them. The
// companies themselves are listed by the results panel. The shortlist lives
// only in the URL.
import { useState } from 'preact/hooks';
import { shortlistCsv, shortlistFilename } from '../lib/shortlist';
import type { Company, Taxonomy } from '../lib/types';

export const CONTACT_URL = 'https://milux.co.uk/contact/';

interface Props {
  companies: Company[];
  taxonomy: Taxonomy;
  shareUrl: string;
  /** Whether overlap mode is on; the download's file name says so. */
  overlap?: boolean;
  /** Says what happened in the page's status line. */
  onSay: (message: string) => void;
}

function download(text: string, filename: string) {
  // A byte order mark so spreadsheet software reads the file as UTF-8.
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function Shortlist({ companies, taxonomy, shareUrl, overlap = false, onSay }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
      onSay('Link copied.');
    } catch {
      (document.getElementById('shortlist-link') as HTMLInputElement | null)?.select();
      onSay('Select the link and copy it.');
    }
  };
  if (companies.length === 0) return null;
  return (
    <div class="shortlist-tools">
      <p class="shortlist-share">
        <label for="shortlist-link" class="mono">
          Link to this shortlist
        </label>
        <input id="shortlist-link" type="text" readOnly value={shareUrl} onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
      </p>
      <p class="shortlist-actions">
        <button type="button" class="btn btn-sm" onClick={copy}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button type="button" class="btn btn-sm" onClick={() => download(shortlistCsv(companies, taxonomy), shortlistFilename(overlap))}>
          Download as a spreadsheet (CSV)
        </button>
      </p>
      <p class="shortlist-contact">
        <a href={CONTACT_URL}>Talk to MilUX about this shortlist</a>
      </p>
    </div>
  );
}
