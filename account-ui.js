/*
 * B10GAMES account button and menu (front page only; needs account.js first).
 *
 * Top right: your name next to your bean in a circle (big). Without an account
 * it is even bigger and asks "Do you want to make an account?". Clicking it opens
 * a small menu: make an account with a name and a password, pick a bean skin as
 * profile picture, and add and join friends.
 *
 * Without an account, a box also asks right away when the page opens: make an
 * account, log in, or play as a guest (once per visit).
 */
(function () {
  var A = window.B10Account;
  if (!A) return;

  // ---------- the bean ----------
  var BEAN = 'M6 54C5 41 15 34 29 33C43 32 51 27 59 18C67 9 82 4 92 12C100 19 100 38 96 53C91 73 75 90 52 92C31 94 13 89 8 75C6 68 6 61 6 54Z';
  var SKINS = [
    { name: 'Klassisk', fill: 'currentColor', plain: 1 },
    { name: 'Sort', fill: '#151515', stroke: '#ffffff' },
    { name: 'Rød', fill: '#e5383b' },
    { name: 'Blå', fill: '#2563eb' },
    { name: 'Grøn', fill: '#16a34a' },
    { name: 'Gul', fill: '#facc15' },
    { name: 'Lilla', fill: '#7c3aed' },
    { name: 'Pink', fill: '#f472b6' },
    { name: 'Orange', fill: '#f97316' },
    { name: 'Stribet', fill: '#ffffff', pat: 'stripes' },
    { name: 'Prikket', fill: '#e5383b', pat: 'dots' },
    { name: 'Skak', fill: '#ffffff', pat: 'checker' },
    { name: 'Regnbue', grad: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6'] },
    { name: 'Guld', grad: ['#fff3b0', '#f5c542', '#a16207'] },
    { name: 'Galakse', grad: ['#4338ca', '#1e1b4b', '#020617'], pat: 'stars' },
    { name: 'Lava', grad: ['#fde047', '#f97316', '#991b1b'], pat: 'lava' },
    { name: 'Is', grad: ['#f0fdff', '#a5f3fc', '#0ea5e9'], pat: 'ice' },
    { name: 'Glad', fill: '#facc15', face: 'happy' },
    { name: 'Ninja', fill: '#18181b', face: 'ninja' },
    { name: 'Konge', fill: '#7c3aed', face: 'crown' },
    { name: 'Cool', fill: '#2563eb', face: 'shades' },
    { name: 'Robot', grad: ['#e5e7eb', '#9ca3af', '#4b5563'], face: 'robot' },
    { name: 'Mint', fill: '#34d399', pat: 'dots2' },
    { name: 'Neon', fill: '#0a0a0a', neon: '#39ff14' }
  ];
  var uid = 0;
  function bean(n) {
    var s = SKINS[n] || SKINS[0], id = 'b10b' + (++uid), defs = '', inside = '', top = '', fill = s.fill;
    if (s.grad) {
      defs += '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1">' + s.grad.map(function (c, i) {
        return '<stop offset="' + (i / (s.grad.length - 1)) + '" stop-color="' + c + '"/>';
      }).join('') + '</linearGradient>';
      fill = 'url(#' + id + 'g)';
    }
    var i, j;
    if (s.pat === 'stripes') for (i = -100; i < 200; i += 18) inside += '<path d="M' + i + ' 0l60 100h9l-60-100z" fill="#000"/>';
    if (s.pat === 'dots') for (i = 0; i < 6; i++) for (j = 0; j < 6; j++) inside += '<circle cx="' + (i * 18 + (j % 2) * 9 + 4) + '" cy="' + (j * 17 + 6) + '" r="4.2" fill="#fff"/>';
    if (s.pat === 'dots2') [[30, 60, 5], [52, 76, 3.5], [70, 44, 4], [84, 24, 3], [22, 78, 3], [60, 58, 2.5]].forEach(function (p) { inside += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '" fill="#065f46" opacity=".55"/>'; });
    if (s.neon) top += '<path d="' + BEAN + '" fill="none" stroke="' + s.neon + '" stroke-width="7" opacity=".35"/><path d="' + BEAN + '" fill="none" stroke="' + s.neon + '" stroke-width="3"/><path d="M30 62q8-6 16 0M54 56q8-6 16 0" fill="none" stroke="' + s.neon + '" stroke-width="3" stroke-linecap="round"/>';
    if (s.pat === 'checker') for (i = 0; i < 7; i++) for (j = 0; j < 7; j++) if ((i + j) % 2) inside += '<rect x="' + i * 15 + '" y="' + j * 15 + '" width="15" height="15" fill="#000"/>';
    if (s.pat === 'stars') [[30, 55, 2.4], [52, 70, 1.6], [70, 40, 2], [84, 22, 1.4], [20, 74, 1.4], [62, 82, 2.2], [44, 46, 1.2], [80, 62, 1.5]].forEach(function (p) {
      inside += '<path d="M' + p[0] + ' ' + (p[1] - p[2] * 2) + 'L' + (p[0] + p[2] * .6) + ' ' + (p[1] - p[2] * .6) + 'L' + (p[0] + p[2] * 2) + ' ' + p[1] + 'L' + (p[0] + p[2] * .6) + ' ' + (p[1] + p[2] * .6) + 'L' + p[0] + ' ' + (p[1] + p[2] * 2) + 'L' + (p[0] - p[2] * .6) + ' ' + (p[1] + p[2] * .6) + 'L' + (p[0] - p[2] * 2) + ' ' + p[1] + 'L' + (p[0] - p[2] * .6) + ' ' + (p[1] - p[2] * .6) + 'Z" fill="#fff"/>';
    });
    if (s.pat === 'lava') inside += '<path d="M10 70l14-8 10 6 14-12 12 4 16-14M30 88l10-10 12 2 10-12M60 30l8 10 14-4" fill="none" stroke="#450a0a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    if (s.pat === 'ice') inside += '<path d="M20 60l12-10M64 70l14-14M40 80l8-6" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/>';
    if (s.face === 'happy') top += '<ellipse cx="38" cy="58" rx="4.5" ry="6.5" fill="#000"/><ellipse cx="58" cy="54" rx="4.5" ry="6.5" fill="#000"/><path d="M36 72q12 10 26-6" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>';
    if (s.face === 'ninja') top += '<path d="M2 58Q48 34 100 36l1 13Q50 46 4 70z" fill="#dc2626"/><path d="M8 66l-6 14 12-8z" fill="#dc2626"/><ellipse cx="40" cy="55" rx="7" ry="4" fill="#fff"/><ellipse cx="62" cy="49" rx="7" ry="4" fill="#fff"/><circle cx="41" cy="55" r="2.4" fill="#000"/><circle cx="63" cy="49" r="2.4" fill="#000"/>';
    if (s.face === 'crown') top += '<path d="M56 24l2-26 12 13 10-16 8 14 9-10-2 25q-20-6-39 0z" fill="#facc15" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/><circle cx="72" cy="16" r="2.6" fill="#ef4444"/><circle cx="86" cy="15" r="2.2" fill="#3b82f6"/><ellipse cx="40" cy="60" rx="4" ry="5.5" fill="#fff"/><ellipse cx="57" cy="56" rx="4" ry="5.5" fill="#fff"/>';
    if (s.face === 'shades') top += '<path d="M24 52l52-10" stroke="#000" stroke-width="4"/><path d="M26 52q0 12 12 11 9-1 9-14z" fill="#000"/><path d="M52 47q1 12 12 10 9-2 8-15z" fill="#000"/><path d="M48 70q8 5 16-2" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>';
    if (s.face === 'robot') top += '<rect x="30" y="50" width="12" height="10" rx="2" fill="#22d3ee" stroke="#000" stroke-width="2.5"/><rect x="52" y="46" width="12" height="10" rx="2" fill="#22d3ee" stroke="#000" stroke-width="2.5"/><path d="M38 72h22M42 68v8M50 68v8M56 68v8" stroke="#000" stroke-width="2.5"/><path d="M84 10l4-8" stroke="#000" stroke-width="3"/><circle cx="89" cy="2.5" r="3" fill="#ef4444"/>';
    var shine = s.plain ? '' : '<ellipse cx="80" cy="20" rx="6" ry="3.4" transform="rotate(-40 80 20)" fill="#fff" opacity=".55"/>';
    return '<svg viewBox="-4 -4 108 108" aria-hidden="true"><defs><clipPath id="' + id + 'c"><path d="' + BEAN + '"/></clipPath>' + defs + '</defs>' +
      '<path d="' + BEAN + '" fill="' + fill + '"/>' +
      (inside ? '<g clip-path="url(#' + id + 'c)">' + inside + '</g>' : '') + shine +
      '<path d="' + BEAN + '" fill="none" stroke="' + (s.stroke || '#000') + '" stroke-width="' + (s.plain ? 0 : 3) + '"/>' + top + '</svg>';
  }

  // ---------- icons (no emoji) ----------
  var ICON = {
    x: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.6 4.2 4.2 0 0 0 7 18z" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="3"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>'
  };

  // ---------- styles ----------
  var css = [
    /* the profile button: big, a glass tile with your bean (in the page's own slot, or top right) */
    '.acct-btn{position:absolute;top:18px;right:20px;z-index:20;display:flex;flex-direction:row-reverse;align-items:center;justify-content:flex-end;gap:20px;background:rgba(20,17,40,.6);border:1px solid rgba(255,255,255,.12);border-radius:26px;padding:18px 22px;cursor:pointer;color:#f6f4ff;font:800 clamp(22px,2.4vw,32px)/1.08 "Unbounded",system-ui,sans-serif;letter-spacing:-.02em;text-align:left;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}',
    '.acct-btn.in-slot{position:relative;top:auto;right:auto;width:100%;min-height:100%}',
    '.acct-btn:hover{border-color:rgba(255,79,216,.55);box-shadow:0 24px 60px -24px rgba(255,79,216,.6);transform:translateY(-2px)}',
    '.acct-btn:focus-visible{outline:3px solid #ff4fd8;outline-offset:3px}',
    '.acct-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.acct-name::before{content:"Din profil";display:block;margin-bottom:8px;font:800 11.5px "Manrope",system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#ff4fd8}',
    '.acct-ring{position:relative;flex:none;width:clamp(92px,9vw,124px);height:clamp(92px,9vw,124px);border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#2a2350,#0d0b1c 70%);color:#fff;box-shadow:0 0 0 3px #0d0b1c,0 0 0 6px transparent;transition:transform .2s ease}',
    '.acct-ring::before{content:"";position:absolute;inset:-5px;border-radius:50%;padding:3px;background:linear-gradient(120deg,#8b5cf6,#ff4fd8 55%,#ffc53d);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}',
    '.acct-ring svg{width:66%;height:66%;display:block;filter:drop-shadow(0 6px 12px rgba(0,0,0,.45))}',
    '.acct-btn:hover .acct-ring{transform:rotate(-6deg) scale(1.04)}',
    '.acct-badge{position:absolute;top:-6px;right:-6px;min-width:34px;height:34px;padding:0 8px;border-radius:17px;background:#ff3d6e;color:#fff;font:800 16px/30px "Unbounded",sans-serif;font-style:normal;text-align:center;border:2px solid #0d0b1c;box-shadow:0 6px 16px rgba(255,61,110,.5)}',
    /* no account: it asks a question instead of a name */
    '.acct-btn.guest .acct-name{white-space:normal;overflow:visible;text-wrap:balance;font-size:.9em}',
    '.acct-btn.guest .acct-name::before{content:"Ny her?";color:#b6ff3b}',
    /* the question when the page opens */
    '.acct-ask{position:fixed;inset:0;z-index:120;background:rgba(5,4,12,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:grid;place-items:center;padding:16px}',
    '.acct-ask[hidden]{display:none}',
    '.acct-ask-box{position:relative;width:min(540px,100%);background:linear-gradient(180deg,#171332,#0d0b1c);color:#f6f4ff;border:1px solid rgba(255,255,255,.14);border-radius:30px;box-shadow:0 40px 100px -20px rgba(139,92,246,.55);padding:56px 30px 30px;font-family:"Manrope",system-ui,sans-serif;text-align:center;animation:acctIn .22s cubic-bezier(.2,.9,.3,1.2)}',
    '.acct-ask-x{position:absolute;top:14px;left:14px;width:42px;height:42px;border:1px solid rgba(255,255,255,.16);border-radius:50%;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;display:grid;place-items:center}',
    '.acct-ask-x:hover{background:rgba(255,255,255,.16)}',
    '.acct-ask-bean{position:relative;width:116px;height:116px;margin:0 auto 20px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#2a2350,#0d0b1c 70%)}',
    '.acct-ask-bean::before{content:"";position:absolute;inset:-5px;border-radius:50%;padding:3px;background:linear-gradient(120deg,#8b5cf6,#ff4fd8 55%,#ffc53d);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}',
    '.acct-ask-bean svg{width:74px;height:74px}',
    '.acct-ask h2{font:800 clamp(24px,5.4vw,34px)/1.08 "Unbounded",sans-serif;letter-spacing:-.02em;margin:0 0 26px;text-wrap:balance}',
    '.acct-ask-row{display:grid;gap:10px}',
    '.acct-ask-row button{height:56px;border-radius:999px;border:1px solid rgba(255,255,255,.16);font:800 15px "Unbounded",sans-serif;letter-spacing:.01em;cursor:pointer;transition:transform .15s ease,box-shadow .2s ease,background .2s}',
    '.acct-ask-row button:hover{transform:translateY(-2px)}',
    '.acct-ask-row button:focus-visible,.acct-ask-x:focus-visible{outline:3px solid #ff4fd8;outline-offset:3px}',
    '.acct-ask-make{background:linear-gradient(120deg,#8b5cf6,#ff4fd8 55%,#ffc53d);color:#fff;border-color:transparent !important;box-shadow:0 14px 34px -10px rgba(255,79,216,.7)}',
    '.acct-ask-login{background:rgba(255,255,255,.08);color:#fff}',
    '.acct-ask-guest{background:transparent;color:#a7a3c4}',
    '.acct-badge[hidden]{display:none}',
    /* the account panel */
    '.acct-back{position:fixed;inset:0;z-index:100;background:rgba(5,4,12,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:none}',
    '.acct-back.on{display:block}',
    '.acct-box{position:absolute;top:84px;right:20px;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 104px);overflow:auto;background:linear-gradient(180deg,#171332,#0d0b1c);color:#f6f4ff;border:1px solid rgba(255,255,255,.14);border-radius:26px;box-shadow:0 40px 100px -20px rgba(139,92,246,.5);padding:24px;font-family:"Manrope",system-ui,sans-serif;animation:acctIn .2s cubic-bezier(.2,.9,.3,1.2)}',
    '@keyframes acctIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}',
    '.acct-x{position:absolute;top:14px;right:14px;width:38px;height:38px;border:1px solid rgba(255,255,255,.14);border-radius:50%;background:rgba(255,255,255,.05);cursor:pointer;display:grid;place-items:center;color:#fff}',
    '.acct-x:hover{background:rgba(255,255,255,.16)}',
    '.acct-box h2{font:800 23px/1.1 "Unbounded",sans-serif;letter-spacing:-.02em;margin:0 44px 8px 0}',
    '.acct-box p{color:#a7a3c4;font-size:14px;line-height:1.5}',
    '.acct-big{position:relative;width:84px;height:84px;color:#fff;border-radius:50%;display:grid;place-items:center;margin-bottom:14px;background:radial-gradient(circle at 35% 30%,#2a2350,#0d0b1c 70%);box-shadow:0 0 0 2px rgba(255,79,216,.6)}',
    '.acct-big svg{width:58px;height:58px}',
    '.acct-field{display:block;margin-top:14px;font:800 11px "Manrope",sans-serif;text-transform:uppercase;letter-spacing:.14em;color:#a7a3c4}',
    '.acct-field input,.acct-add input{display:block;width:100%;margin-top:7px;height:48px;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:0 14px;font:600 16px "Manrope",sans-serif;background:rgba(255,255,255,.05);color:#fff;outline:0;transition:border-color .15s,box-shadow .15s}',
    '.acct-field input:focus,.acct-add input:focus{border-color:rgba(139,92,246,.8);box-shadow:0 0 0 4px rgba(139,92,246,.22)}',
    '.acct-go{margin-top:18px;width:100%;height:52px;border:0;border-radius:999px;background:linear-gradient(120deg,#8b5cf6,#ff4fd8 55%,#ffc53d);color:#fff;font:800 15px "Unbounded",sans-serif;cursor:pointer;box-shadow:0 14px 30px -12px rgba(255,79,216,.7);transition:transform .15s ease}',
    '.acct-go:hover:not(:disabled){transform:translateY(-2px)}',
    '.acct-go:disabled{opacity:.55;cursor:default}',
    '.acct-err{color:#ff8fa3 !important;font-weight:700;min-height:20px;margin-top:10px}',
    '.acct-ok{color:#6ee7b7 !important;font-weight:700;min-height:20px;margin-top:10px}',
    '.acct-small{font-size:12.5px !important;margin-top:10px}',
    '.acct-head{display:flex;align-items:center;gap:14px;margin:-2px 44px 16px 0}',
    '.acct-head .acct-big{margin:0;flex:none;width:70px;height:70px}',
    '.acct-head .acct-big svg{width:48px;height:48px}',
    '.acct-head h2{margin:0;word-break:break-word}',
    '.acct-sync{display:flex;align-items:center;gap:6px;font:800 11px "Manrope",sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#a7a3c4;margin-top:6px}',
    '.acct-sync.ok{color:#6ee7b7}',
    '.acct-tabs{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);margin-bottom:16px}',
    '.acct-tabs button{flex:1;height:40px;border:0;border-radius:999px;background:transparent;font:800 13px "Manrope",sans-serif;cursor:pointer;color:#a7a3c4;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s,color .15s}',
    '.acct-tabs button.on{background:linear-gradient(120deg,#8b5cf6,#ff4fd8);color:#fff}',
    '.acct-tabs i{font-style:normal;background:#ff3d6e;color:#fff;border-radius:9px;padding:0 6px;font-size:11px;line-height:18px}',
    '.acct-label{font:800 11px "Manrope",sans-serif;text-transform:uppercase;letter-spacing:.14em;color:#a7a3c4;margin:4px 0 10px}',
    '.acct-skins{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px}',
    '.acct-skin{border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.04);padding:9px 4px 7px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font:700 12px "Manrope",sans-serif;color:#f6f4ff;transition:border-color .15s ease,transform .15s ease,background .15s}',
    '.acct-skin svg{width:46px;height:46px}',
    '.acct-skin:hover{border-color:rgba(255,255,255,.35);transform:translateY(-2px)}',
    '.acct-skin.on{border-color:#ff4fd8;background:rgba(255,79,216,.12);box-shadow:0 0 0 3px rgba(255,79,216,.2)}',
    '.acct-out{margin-top:18px;width:100%;height:46px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(255,255,255,.05);color:#fff;font:800 13px "Manrope",sans-serif;cursor:pointer}',
    '.acct-out:hover{background:rgba(255,255,255,.14)}',
    '.acct-del{margin-top:10px;width:100%;height:40px;border:0;border-radius:999px;background:none;color:#ff8fa3;font:700 12.5px "Manrope",sans-serif;cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
    '.acct-del:hover{background:rgba(255,61,110,.1)}',
    '.acct-del-box{margin-top:12px;border:1px solid rgba(255,61,110,.5);border-radius:16px;padding:14px;background:rgba(255,61,110,.08)}',
    '.acct-del-box b{display:block;font-size:15px;color:#ffb3c1}',
    '.acct-del-box p{margin-top:6px;font-size:13px}',
    '.acct-del-row{display:flex;gap:8px;margin-top:10px}',
    '.acct-del-row button{flex:1;margin:0;height:42px}',
    '.acct-del-yes{border:0;border-radius:999px;background:#e11d48;color:#fff;font:800 13px "Manrope",sans-serif;cursor:pointer}',
    '.acct-del-yes:disabled{opacity:.6}',
    '.acct-add{display:flex;gap:8px}',
    '.acct-add input{margin:0;flex:1;min-width:0}',
    '.acct-add button{flex:none;height:48px;padding:0 16px;border:0;border-radius:14px;background:linear-gradient(120deg,#8b5cf6,#ff4fd8);color:#fff;font:800 13px "Manrope",sans-serif;cursor:pointer;display:flex;align-items:center;gap:6px}',
    '.acct-add button:disabled{opacity:.55}',
    '.acct-list{display:flex;flex-direction:column;gap:8px;margin-top:6px}',
    '.acct-row{display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:9px 11px;background:rgba(255,255,255,.04)}',
    '.acct-row .av{width:42px;height:42px;flex:none;color:#fff;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#2a2350,#0d0b1c 70%);box-shadow:0 0 0 1.5px rgba(255,255,255,.2)}',
    '.acct-row .av svg{width:29px;height:29px}',
    '.acct-row .who{flex:1;min-width:0}',
    '.acct-row b{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.acct-row small{display:flex;align-items:center;gap:6px;color:#a7a3c4;font-size:12.5px;line-height:1.3}',
    '.acct-row small .d{width:8px;height:8px;border-radius:50%;background:#4b4766;flex:none}',
    '.acct-row small .d.on{background:#34d399}',
    '.acct-join{flex:none;height:36px;padding:0 14px;border:0;border-radius:999px;background:#10b981;color:#fff;font:800 12px "Manrope",sans-serif;cursor:pointer;display:flex;align-items:center;gap:6px}',
    '.acct-join:disabled{background:rgba(255,255,255,.06);color:#6f6a8f;cursor:default}',
    '.acct-join.no{background:rgba(255,255,255,.08);color:#fff}',
    '.acct-rm{flex:none;width:30px;height:30px;border:0;border-radius:50%;background:none;color:#8a85aa;cursor:pointer;display:grid;place-items:center}',
    '.acct-rm:hover{color:#fff;background:rgba(255,255,255,.08)}',
    '.acct-rm svg{width:15px;height:15px}',
    '.acct-req{background:rgba(255,197,61,.08) !important;border-color:rgba(255,197,61,.35) !important}',
    '.acct-empty{border:1px dashed rgba(255,255,255,.2);border-radius:16px;padding:14px;text-align:center;color:#a7a3c4;font-size:14px}',
    '.acct-link{border:0;background:none;color:#ff8ce6;font:inherit;font-weight:800;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:0}',
    '@media (max-width:640px){.acct-btn{gap:14px;padding:14px 16px}.acct-box{top:16px !important;left:16px;right:16px;width:auto;max-height:calc(100vh - 32px);padding:20px}}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- the button ----------
  var btn = document.createElement('button');
  btn.className = 'acct-btn'; btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.innerHTML = '<span class="acct-name"></span><span class="acct-ring"></span>';
  var nameEl = btn.firstChild, ring = btn.lastChild;
  var badge = document.createElement('i'); badge.className = 'acct-badge'; badge.hidden = true;
  // the page can give the button its own place (a slot), otherwise it sits top right
  var slot = document.getElementById('acctSlot');
  if (slot) { btn.classList.add('in-slot'); slot.appendChild(btn); } else document.body.appendChild(btn);

  var lastBtn = '';
  function drawButton() {
    var u = A.user, key = u ? u.name + '|' + u.skin : '-';
    if (key === lastBtn) return;
    lastBtn = key;
    nameEl.textContent = u ? u.name : 'Do you want to make an account?';
    btn.classList.toggle('guest', !u);
    ring.innerHTML = bean(u ? u.skin : 0);
    ring.appendChild(badge);
    btn.setAttribute('aria-label', u ? 'Din account: ' + u.name : 'Do you want to make an account?');
    makeRoom();
  }
  // the page header gets as much room at the top as the button needs
  function makeRoom() { document.documentElement.style.setProperty('--acct-h', btn.offsetHeight + 'px'); }
  addEventListener('resize', makeRoom);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(makeRoom);

  // ---------- the menu ----------
  var back = document.createElement('div'); back.className = 'acct-back';
  var box = document.createElement('div'); box.className = 'acct-box';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Account');
  back.appendChild(box); document.body.appendChild(back);
  var open = false, tab = 'profile', reqs = [], friendData = null, poll = null, confirmDel = false;

  var mode = 'create';
  function show(m) {
    mode = m || 'create';
    box.style.top = matchMedia('(max-width:640px)').matches ? '' : Math.round(btn.getBoundingClientRect().bottom + 14) + 'px';
    open = true; back.classList.add('on'); render(true);
    refresh();
    clearInterval(poll); poll = setInterval(refresh, 15000);
  }
  function hide() { open = false; confirmDel = false; back.classList.remove('on'); clearInterval(poll); btn.focus(); }
  btn.addEventListener('click', function () { if (open) hide(); else show(); });
  back.addEventListener('mousedown', function (e) { if (e.target === back) hide(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) hide(); });

  function syncText() {
    var s = A.status;
    if (s === 'ok') return '<div class="acct-sync ok">' + ICON.check + 'Dit progress er gemt</div>';
    if (s === 'syncing') return '<div class="acct-sync">' + ICON.cloud + 'Gemmer…</div>';
    if (s === 'offline') return '<div class="acct-sync">' + ICON.cloud + 'Offline – gemmes når du er online</div>';
    return '';
  }

  function render(focus) {
    if (!open) return;
    var u = A.user;
    shown = userKey();
    if (!u) return renderLogin(focus);
    var html = '<button class="acct-x" type="button" aria-label="Luk">' + ICON.x + '</button>' +
      '<div class="acct-head"><div class="acct-big">' + bean(u.skin) + '</div><div><h2>' + esc(u.name) + '</h2><div data-sync>' + syncText() + '</div></div></div>' +
      '<div class="acct-tabs"><button type="button" data-tab="profile" class="' + (tab === 'profile' ? 'on' : '') + '">Profil</button>' +
      '<button type="button" data-tab="friends" class="' + (tab === 'friends' ? 'on' : '') + '">Venner' + (reqs.length ? '<i>' + reqs.length + '</i>' : '') + '</button></div>';
    if (tab === 'profile') {
      html += '<div class="acct-label">Vælg dit profilbillede</div><div class="acct-skins">' +
        SKINS.map(function (s, i) { return '<button type="button" class="acct-skin' + (i === u.skin ? ' on' : '') + '" data-skin="' + i + '" aria-label="' + esc(s.name) + '">' + bean(i) + '<span>' + esc(s.name) + '</span></button>'; }).join('') +
        '</div><button type="button" class="acct-out" data-out>Log ud</button>' +
        (confirmDel
          ? '<div class="acct-del-box"><b>Vil du slette din account "' + esc(u.name) + '"?</b><p>Dit navn, dit profilbillede, dine venner og dit gemte progress online bliver slettet for altid. Spillene på denne enhed beholder deres progress.</p>' +
            '<div class="acct-del-row"><button type="button" class="acct-del-yes" data-delyes>Ja, slet den</button><button type="button" class="acct-out" data-delno>Fortryd</button></div><p class="acct-err" data-delmsg></p></div>'
          : '<button type="button" class="acct-del" data-del>Slet account</button>') +
        '<p class="acct-small">Dit progress i alle spil bliver gemt på din account, så du kan fortsætte hvor du slap – også på en anden computer eller iPad.</p>';
    } else {
      html += '<div class="acct-label">Tilføj en ven</div>' +
        '<form class="acct-add" data-add><input name="f" maxlength="16" placeholder="Skriv din vens navn" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="submit">' + ICON.plus + 'Tilføj</button></form>' +
        '<p class="acct-err" data-msg></p>';
      if (reqs.length) {
        html += '<div class="acct-label">Venneanmodninger</div><div class="acct-list">' + reqs.map(function (r) {
          return '<div class="acct-row acct-req"><div class="av">' + bean(0) + '</div><div class="who"><b>' + esc(r.from) + '</b><small>har tilføjet dig som ven</small></div>' +
            '<button type="button" class="acct-join" data-accept="' + esc(r.from) + '">Tilføj</button><button type="button" class="acct-rm" data-decline="' + esc(r.from) + '" aria-label="Nej tak">' + ICON.x + '</button></div>';
        }).join('') + '</div><div style="height:14px"></div>';
      }
      html += '<div class="acct-label">Dine venner</div><div class="acct-list" data-friends>' + friendRows() + '</div>';
    }
    box.innerHTML = html;
    if (focus && tab === 'friends') { var f = box.querySelector('[data-add] input'); if (f && matchMedia('(pointer:fine)').matches) f.focus(); }
  }

  function friendRows() {
    var u = A.user;
    if (!u.friends.length) return '<div class="acct-empty">Du har ingen venner endnu. Skriv en vens navn ovenfor – de skal have lavet en account først.</div>';
    var list = friendData || u.friends.map(function (n) { return { name: n, skin: 0, online: false, loading: true }; });
    // Online friends first.
    list = list.slice().sort(function (a, b) { return (b.online - a.online) || a.name.localeCompare(b.name); });
    return list.map(function (f) {
      var where, can = false;
      if (f.loading) where = '<span class="d"></span>Henter…';
      else if (!f.online) where = '<span class="d"></span>Offline';
      else if (f.gameName) { where = '<span class="d on"></span>Spiller ' + esc(f.gameName) + (f.party ? ' · party ' + esc(f.party) : ''); can = true; }
      else where = '<span class="d on"></span>Online på forsiden';
      return '<div class="acct-row"><div class="av">' + bean(f.skin) + '</div><div class="who"><b>' + esc(f.name) + '</b><small>' + where + '</small></div>' +
        '<button type="button" class="acct-join" data-join="' + esc(f.name) + '"' + (can ? '' : ' disabled') + '>' + ICON.play + 'Join</button>' +
        '<button type="button" class="acct-rm" data-remove="' + esc(f.name) + '" aria-label="Fjern ' + esc(f.name) + ' som ven">' + ICON.x + '</button></div>';
    }).join('');
  }

  function renderLogin(focus) {
    var login = mode === 'login';
    box.innerHTML = '<button class="acct-x" type="button" aria-label="Luk">' + ICON.x + '</button>' +
      '<div class="acct-big">' + bean(0) + '</div>' +
      (login ? '<h2>Log ind</h2><p>Skriv navnet og adgangskoden til din account.</p>'
        : '<h2>Lav din account</h2><p>Skriv et navn og en adgangskode. Så bliver dit progress gemt, og du kan tilføje venner og joine dem.</p>') +
      '<form data-login>' +
      '<label class="acct-field">Navn<input name="n" maxlength="16" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>' +
      '<label class="acct-field">Adgangskode<input name="p" type="password" autocomplete="' + (login ? 'current-password' : 'new-password') + '" required></label>' +
      '<button class="acct-go" type="submit">' + (login ? 'Log ind' : 'Lav account') + '</button>' +
      '<p class="acct-err" data-msg></p></form>' +
      (login ? '<p class="acct-small">Har du ikke en account? <button type="button" class="acct-link" data-mode="create">Lav en account</button></p>'
        : '<p class="acct-small">Har du allerede en account? <button type="button" class="acct-link" data-mode="login">Log ind</button> (eller skriv dit navn og din adgangskode her, så bliver du logget ind).</p>') +
      '<p class="acct-small">Brug ikke en adgangskode, som du også bruger andre steder.</p>';
    if (focus && matchMedia('(pointer:fine)').matches) box.querySelector('input').focus();
  }

  // ---------- actions ----------
  box.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, msg = box.querySelector('[data-msg]'), go = form.querySelector('button[type=submit]');
    if (form.hasAttribute('data-login')) {
      go.disabled = true; go.textContent = 'Et øjeblik…'; msg.textContent = '';
      A.login(form.n.value, form.p.value).then(function (r) {
        tab = 'profile'; friendData = null; render();
        var m = box.querySelector('.acct-small');
        if (m) m.insertAdjacentHTML('beforebegin', '<p class="acct-ok">' + (r.created ? 'Din account er lavet! Vælg et profilbillede.' : 'Du er logget ind. Velkommen tilbage!') + '</p>');
        refresh();
      }, function (err) {
        go.disabled = false; go.textContent = mode === 'login' ? 'Log ind' : 'Lav account'; msg.textContent = err.message;
      });
    } else if (form.hasAttribute('data-add')) {
      var name = form.f.value;
      go.disabled = true; msg.className = 'acct-err'; msg.textContent = '';
      A.addFriend(name).then(function (real) {
        friendData = null; render(); refresh();
        var m = box.querySelector('[data-msg]');
        if (m) { m.className = 'acct-ok'; m.textContent = real + ' er nu din ven.'; }
      }, function (err) { go.disabled = false; msg.textContent = err.message; });
    }
  });

  box.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.classList.contains('acct-x')) return hide();
    if (t.dataset.mode) { mode = t.dataset.mode; render(true); return; }
    if (t.dataset.tab) { tab = t.dataset.tab; render(true); if (tab === 'friends') refresh(); return; }
    if (t.dataset.skin != null) { A.setSkin(+t.dataset.skin); return; }
    if (t.hasAttribute('data-del')) { confirmDel = true; render(); var bx = box.querySelector('.acct-del-box'); if (bx) bx.scrollIntoView({ block: 'nearest' }); return; }
    if (t.hasAttribute('data-delno')) { confirmDel = false; render(); return; }
    if (t.hasAttribute('data-delyes')) {
      t.disabled = true; t.textContent = 'Sletter…';
      A.deleteAccount().then(function () {
        confirmDel = false; reqs = []; friendData = null; badge.hidden = true; render(true);
        var m = box.querySelector('[data-msg]'); if (m) { m.className = 'acct-ok'; m.textContent = 'Din account er slettet.'; }
      }, function (err) {
        t.disabled = false; t.textContent = 'Ja, slet den';
        var m = box.querySelector('[data-delmsg]'); if (m) m.textContent = err.message;
      });
      return;
    }
    if (t.hasAttribute('data-out')) { A.logout(); reqs = []; friendData = null; badge.hidden = true; render(true); return; }
    if (t.dataset.join) {
      var f = (friendData || []).filter(function (x) { return x.name === t.dataset.join; })[0];
      var url = A.joinUrl(f, '');
      if (url) location.href = url;
      return;
    }
    if (t.dataset.remove) {
      if (confirm('Fjern ' + t.dataset.remove + ' som ven?')) {
        A.removeFriend(t.dataset.remove);
        if (friendData) friendData = friendData.filter(function (x) { return x.name !== t.dataset.remove; });
        render();
      }
      return;
    }
    if (t.dataset.accept) {
      var who = t.dataset.accept; t.disabled = true;
      A.acceptRequest(who).then(function () {
        reqs = reqs.filter(function (r) { return r.from !== who; }); updateBadge(); friendData = null; render(); refresh();
      }, function () { t.disabled = false; });
      return;
    }
    if (t.dataset.decline) {
      var no = t.dataset.decline;
      reqs = reqs.filter(function (r) { return r.from !== no; }); updateBadge(); render();
      A.declineRequest(no);
    }
  });

  function updateBadge() {
    badge.hidden = !reqs.length;
    badge.textContent = reqs.length > 9 ? '9+' : String(reqs.length);
  }

  // Friend requests (for the red badge) and where friends are.
  var loading = false;
  function refresh() {
    if (!A.user || loading) return;
    loading = true;
    var wasReqs = reqs.length;
    Promise.all([
      A.requests().then(function (r) { reqs = r; }, function () {}),
      open && tab === 'friends' ? A.friends().then(function (f) { friendData = f; }, function () {}) : null
    ]).then(function () {
      loading = false; updateBadge();
      if (!open) return;
      // Only redraw the parts that changed, so typing and messages are not interrupted.
      var list = box.querySelector('[data-friends]'), a = document.activeElement;
      var typing = a && a.tagName === 'INPUT' && box.contains(a);
      if (wasReqs !== reqs.length && !typing) render();
      else if (list) list.innerHTML = friendRows();
    });
  }

  var shown = '';
  function userKey() { var u = A.user; return u ? u.name + '|' + u.skin + '|' + u.friends.join(',') : '-'; }
  A.on(function (what) {
    drawButton();
    if (!open) return;
    var s = box.querySelector('[data-sync]'); if (s) s.innerHTML = syncText();
    if (what === 'status') return;
    // Skin, name or friends changed: redraw unless the person is typing.
    var k = userKey();
    if (k === shown) return;
    var a = document.activeElement;
    if (a && a.tagName === 'INPUT' && box.contains(a)) return;
    if (A.user && friendData && A.user.friends.length !== friendData.length) friendData = null;
    render();
  });

  // ---------- no account? Ask right away when the page opens (once per visit) ----------
  var ask = document.createElement('div'); ask.className = 'acct-ask'; ask.hidden = true;
  ask.setAttribute('role', 'dialog'); ask.setAttribute('aria-modal', 'true'); ask.setAttribute('aria-labelledby', 'acctAskTitle');
  ask.innerHTML = '<div class="acct-ask-box"><button class="acct-ask-x" type="button" aria-label="Close" data-ask="guest">' + ICON.x + '</button>' +
    '<div class="acct-ask-bean">' + bean(0) + '</div>' +
    '<h2 id="acctAskTitle">Do you want to create an account?</h2>' +
    '<div class="acct-ask-row"><button type="button" class="acct-ask-make" data-ask="create">Make an account</button>' +
    '<button type="button" class="acct-ask-login" data-ask="login">Login</button>' +
    '<button type="button" class="acct-ask-guest" data-ask="guest">Play as guest</button></div></div>';
  document.body.appendChild(ask);
  function closeAsk(then) {
    ask.hidden = true;
    try { sessionStorage.setItem('b10-asked', '1'); } catch (e) {}
    if (then) show(then); else btn.focus();
  }
  ask.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ask]');
    if (t) closeAsk(t.dataset.ask === 'guest' ? null : t.dataset.ask);
    else if (e.target === ask) closeAsk(null);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ask.hidden) closeAsk(null); });
  var asked = false; try { asked = sessionStorage.getItem('b10-asked') === '1'; } catch (e) {}
  if (!A.user && !asked) { ask.hidden = false; var first = ask.querySelector('.acct-ask-make'); if (first) first.focus(); }

  drawButton();
  refresh();
  setInterval(function () { if (!open) refresh(); }, 60000);
})();
