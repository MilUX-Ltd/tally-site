// Company pages: when the visitor came from the explorer, "Add to shortlist"
// and "Back to search" return to the view they left, shortlist kept.
// Without this script (or a referrer) the links still work: the explorer with
// this company alone, and the plain explorer. Only link addresses are written.
import { shortlistHref } from '../lib/company-page';

const add = document.querySelector<HTMLAnchorElement>('a[data-shortlist]');
const id = add?.dataset.shortlist;
if (add && id) add.href = shortlistHref(id, document.referrer, window.location.origin);

const back = document.querySelector<HTMLAnchorElement>('a[data-explorer-link]');
try {
  const from = new URL(document.referrer);
  if (back && from.origin === window.location.origin && from.pathname === '/') back.href = `/${from.search}`;
} catch {
  // No referrer: keep the plain link.
}
