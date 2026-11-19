// Mounts the explorer, the page's one Preact island. Mounted from a bundled
// module rather than an Astro island directive, because Astro's island loader
// is an inline script and the CSP allows no inline script or style.
import { h, render } from 'preact';
import Explorer from '../components/Explorer';

const root = document.getElementById('explorer');
if (root) {
  root.textContent = '';
  render(h(Explorer, {}), root);
}
