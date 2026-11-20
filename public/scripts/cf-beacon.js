// Loads the Cloudflare Web Analytics beacon on the live site only, so test
// runs, local builds and pull request previews are never counted (D-wsjc7).
// The beacon itself strips the query string before it reports a page view.
(function () {
  var me = document.currentScript;
  var config = me && me.getAttribute('data-cf-beacon');
  if (!config || window.location.hostname !== 'tally.milux.co.uk') return;
  var beacon = document.createElement('script');
  beacon.defer = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', config);
  document.head.appendChild(beacon);
})();
