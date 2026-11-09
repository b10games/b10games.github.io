/*
 * B10GAMES stats: "played in total" and "online now" counters.
 *
 * Uses Abacus (https://abacus.jasoncameron.dev), a free counting API.
 *  - plays-<game>          +1 each time a game is opened (once per browser tab).
 *  - on-<scope>-<minute>   every open page adds 1 once per minute, so a minute's
 *                          counter = how many people were online in that minute.
 *                          <scope> is "site" (whole website) or a game id.
 *
 * On a game page include:  <script src="/stats.js" data-game="snake" defer></script>
 * On the front page call:  B10Stats.startPresence(['site']) and B10Stats.plays/online(...)
 */
(function () {
  var API = 'https://abacus.jasoncameron.dev';
  // Local testing must not change the real numbers.
  var NS = location.hostname === 'b10games.github.io' ? 'b10games.github.io' : 'b10games-dev';
  var MINUTE = 60000;

  // Abacus allows 30 requests per 10 s per visitor, so send them one at a time.
  var queue = [], busy = false;
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    var job = queue.shift();
    fetch(API + job.path, { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404) return { value: 0 };   // nobody has counted yet
        return r.ok ? r.json() : null;
      })
      .then(function (d) { job.done(d && typeof d.value === 'number' ? d.value : null); })
      .catch(function () { job.done(null); })
      .then(function () { setTimeout(function () { busy = false; pump(); }, 350); });
  }
  function call(path) {
    return new Promise(function (done) { queue.push({ path: path, done: done }); pump(); });
  }
  function hit(key) { return call('/hit/' + NS + '/' + key); }
  function get(key) { return call('/get/' + NS + '/' + key); }
  function minute() { return Math.floor(Date.now() / MINUTE); }

  function startPresence(scopes) {
    function beat() {
      var m = minute();
      scopes.forEach(function (s) {
        // One browser counts once per minute, even with several tabs or reloads.
        var k = 'b10-beat-' + s;
        try {
          if (localStorage.getItem(k) === String(m)) return;
          localStorage.setItem(k, String(m));
        } catch (e) { /* storage blocked: count anyway */ }
        hit('on-' + s + '-' + m);
      });
    }
    function next() {
      // Beat early in every minute, spread out so visitors do not all hit at once.
      var wait = (minute() + 1) * MINUTE - Date.now() + 1000 + Math.random() * 8000;
      setTimeout(function () { beat(); next(); }, wait);
    }
    beat();
    next();
  }

  // Everyone online has counted in this minute after ~10 s; before that, use last minute.
  function online(scope) {
    var into = Date.now() % MINUTE;
    var m = into > 12000 ? minute() : minute() - 1;
    return get('on-' + scope + '-' + m);
  }

  function plays(game) { return get('plays-' + game); }

  window.B10Stats = { startPresence: startPresence, online: online, plays: plays };

  // On a game page: count this play once per tab, and report that someone is playing.
  var me = document.currentScript && document.currentScript.getAttribute('data-game');
  if (me) {
    var counted = false;
    try {
      counted = sessionStorage.getItem('b10-played-' + me) === '1';
      sessionStorage.setItem('b10-played-' + me, '1');
    } catch (e) { /* private mode: count every load */ }
    if (!counted) hit('plays-' + me);
    startPresence(['site', me]);
  }
})();
