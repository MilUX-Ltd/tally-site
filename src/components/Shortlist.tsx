// The shortlist panel: the companies picked, a link to share them, CSV
// download, and the way to get in touch. The shortlist lives only in the URL.
import { useState } from 'preact/hooks';
import { shortlistCsv, shortlistFilename } from '../lib/shortlist';
import type { Company, Taxonomy } from '../lib/types';

export const CONTACT_URL = 'https://milux.co.uk/contact/';
export const AI_LINE = 'This was built with AI. If you would like to know more, please get in touch.';

interface Props {
  companies: Company[];
  taxonomy: Taxonomy;
  shareUrl: string;
  /** Whether overlap mode is on; the download's file name says so. */
  overlap?: boolean;
  onRemove: (id: string) => void;
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

export default function Shortlist({ companies, taxonomy, shareUrl, onRemove, overlap = false }: Props) {
  const [status, setStatus] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus('Link copied.');
    } catch {
      (document.getElementById('shortlist-link') as HTMLInputElement | null)?.select();
      setStatus('Select the link and copy it.');
    }
  };
  return (
    <section class="shortlist" aria-label="Shortlist">
      <h2>{companies.length ? `Shortlist (${companies.length})` : 'Shortlist'}</h2>
      {companies.length === 0 ? (
        <p>Add companies from the list or a map area to build a shortlist you can share or download.</p>
      ) : (
        <>
          <ul class="shortlist-items">
            {companies.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                <button type="button" class="secondary small" onClick={() => onRemove(c.id)}>
                  Remove<span class="vh"> {c.name}</span> from shortlist
                </button>
              </li>
            ))}
          </ul>
          <p class="shortlist-share">
            <label for="shortlist-link">Link to this shortlist</label>
            <input id="shortlist-link" type="text" readOnly value={shareUrl} onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
          </p>
          <p class="shortlist-actions">
            <button type="button" onClick={copy}>
              Copy link
            </button>
            <button type="button" class="secondary" onClick={() => download(shortlistCsv(companies, taxonomy), shortlistFilename(overlap))}>
              Download CSV
            </button>
            <span role="status">{status}</span>
          </p>
        </>
      )}
      <p class="shortlist-contact">
        <a class="button-link" href={CONTACT_URL}>
          Book a call
        </a>
      </p>
      <p>{AI_LINE}</p>
    </section>
  );
}
