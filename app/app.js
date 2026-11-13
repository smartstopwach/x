(() => {
  'use strict';

  const LEVELS = {
    easy:   { cols: 4, rows: 3, label: 'Easy' },
    medium: { cols: 4, rows: 4, label: 'Medium' },
    hard:   { cols: 6, rows: 4, label: 'Hard' },
  };
  const SYMBOLS = ['🍎','🍌','🍇','🍓','🍒','🍑','🥝','🍍','🥥','🍉','🌽','🥕','🍄','🌵','🐶','🐱','🦊','🐼','🐸','🦁','🐙','🦋','🚀','⭐'];
  const AVATARS = ['🙂','😎','🤖','🦄','🐯','🐨','🐧','🦖','👾','🧙','🥷','🧑‍🚀'];
  const STORE_KEY = 'match.v1';

  // ---------- Storage ----------
  const defaults = () => ({
    name: '', avatar: '🙂', haptics: true, sound: false,
    best: {}, // level -> { moves, time }
    played: 0, won: 0, history: [],
  });
  let state;
  try { state = { ...defaults(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; }
  catch { state = defaults(); }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} };

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function haptic(ms = 12) { if (state.haptics && navigator.vibrate) navigator.vibrate(ms); }

  let audioCtx;
  function tone(freq = 520, dur = 0.08) {
    if (!state.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch {}
  }

  // ---------- Navigation ----------
  const SCREEN_META = {
    home:    { title: 'Match', tab: 'home', back: false },
    game:    { title: 'Playing', tab: 'home', back: true },
    scores:  { title: 'Scores', tab: 'scores', back: false },
    profile: { title: 'Profile', tab: 'profile', back: false },
  };
  const history_ = [];
  let current = 'home';

  function show(name, { push = true } = {}) {
    const meta = SCREEN_META[name];
    if (!meta) return;
    const prev = current;
    const isBack = !push;
    $$('.screen').forEach((s) => s.classList.remove('active', 'enter-back'));
    const el = $(`#screen-${name}`);
    el.classList.add('active');
    if (isBack) el.classList.add('enter-back');
    el.scrollTop = 0;
    if (push && prev !== name) history_.push(prev);
    current = name;
    $('#title').textContent = meta.title;
    $('#back-btn').classList.toggle('hidden', !meta.back);
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tabTarget === meta.tab));
    $('#tabbar').classList.toggle('hidden', name === 'game');
    if (name === 'scores') renderScores();
    if (name === 'profile') renderProfile();
    if (name === 'home') renderBests();
  }
  function goBack() {
    const prev = history_.pop() || 'home';
    show(prev, { push: false });
  }

  // ---------- Game ----------
  let game = null;
  let timerId = null;

  function startGame(level) {
    const cfg = LEVELS[level];
    const pairs = (cfg.cols * cfg.rows) / 2;
    const symbols = shuffle([...SYMBOLS]).slice(0, pairs);
    const deck = shuffle([...symbols, ...symbols]);
    game = {
      level, cfg, deck, pairs,
      open: [], lock: false, moves: 0, matched: 0,
      started: null, elapsed: 0, done: false,
    };
    const board = $('#board');
    board.style.setProperty('--cols', cfg.cols);
    board.innerHTML = '';
    deck.forEach((sym, i) => {
      const card = document.createElement('button');
      card.className = 'card';
      card.dataset.i = i;
      card.setAttribute('aria-label', 'Hidden card');
      card.innerHTML = `<div class="card-inner"><div class="face front"></div><div class="face back">${sym}</div></div>`;
      board.appendChild(card);
    });
    updateStats();
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
    $('#win-sheet').classList.add('hidden');
    show('game');
  }

  function tick() {
    if (!game || game.done || game.started === null) return;
    game.elapsed = Math.floor((Date.now() - game.started) / 1000);
    $('#stat-time').textContent = fmt(game.elapsed);
  }

  function updateStats() {
    $('#stat-moves').textContent = game.moves;
    $('#stat-matched').textContent = `${game.matched}/${game.pairs}`;
    $('#stat-time').textContent = fmt(game.elapsed);
  }

  function onCardTap(e) {
    const btn = e.target.closest('.card');
    if (!btn || !game || game.done || game.lock) return;
    const i = Number(btn.dataset.i);
    if (btn.classList.contains('flipped') || btn.classList.contains('matched')) return;
    if (game.started === null) game.started = Date.now();

    flip(btn, true);
    tone(600);
    haptic(8);
    game.open.push({ i, el: btn });
    if (game.open.length < 2) return;

    game.moves++;
    game.lock = true;
    const [a, b] = game.open;
    updateStats();
    if (game.deck[a.i] === game.deck[b.i]) {
      setTimeout(() => {
        a.el.classList.add('matched'); b.el.classList.add('matched');
        a.el.disabled = b.el.disabled = true;
        game.matched++;
        game.open = []; game.lock = false;
        updateStats();
        tone(880, 0.14); haptic(20);
        if (game.matched === game.pairs) finishGame();
      }, 350);
    } else {
      a.el.classList.add('wrong'); b.el.classList.add('wrong');
      setTimeout(() => {
        flip(a.el, false); flip(b.el, false);
        a.el.classList.remove('wrong'); b.el.classList.remove('wrong');
        game.open = []; game.lock = false;
      }, 800);
    }
  }

  function flip(el, up) {
    el.classList.toggle('flipped', up);
    el.setAttribute('aria-label', up ? 'Revealed card' : 'Hidden card');
  }

  function finishGame() {
    game.done = true;
    clearInterval(timerId);
    game.elapsed = Math.max(1, Math.floor((Date.now() - game.started) / 1000));
    updateStats();

    const { level, moves, elapsed } = game;
    state.played++; state.won++;
    const prevBest = state.best[level];
    const isBest = !prevBest || moves < prevBest.moves || (moves === prevBest.moves && elapsed < prevBest.time);
    if (isBest) state.best[level] = { moves, time: elapsed };
    state.history.unshift({ level, moves, time: elapsed, at: Date.now() });
    state.history = state.history.slice(0, 50);
    save();

    $('#win-text').textContent = `${LEVELS[level].label}: ${moves} moves in ${fmt(elapsed)}.` +
      (isBest ? ' New best score! 🏆' : '');
    setTimeout(() => {
      $('#win-sheet').classList.remove('hidden');
      tone(988, 0.3); haptic([30, 60, 30]);
    }, 500);
  }

  function renderBests() {
    for (const lvl of Object.keys(LEVELS)) {
      const b = state.best[lvl];
      $(`#best-${lvl}`).textContent = b ? `${b.moves} mv · ${fmt(b.time)}` : '—';
    }
  }

  // ---------- Scores ----------
  function renderScores() {
    const list = $('#scores-list');
    const rows = Object.entries(state.best);
    list.innerHTML = '';
    $('#scores-empty').classList.toggle('hidden', rows.length > 0);
    for (const [lvl, b] of rows) {
      const row = document.createElement('div');
      row.className = 'score-row';
      row.innerHTML = `
        <span class="badge ${lvl}">${LEVELS[lvl].cols}×${LEVELS[lvl].rows}</span>
        <div class="li-body"><strong>${LEVELS[lvl].label}</strong><small>Best run</small></div>
        <div class="val">${b.moves} moves<small>${fmt(b.time)}</small></div>`;
      list.appendChild(row);
    }
    const extra = $('#scores-extra');
    extra.innerHTML = '';
    if (state.history.length) {
      const h = document.createElement('h3');
      h.className = 'section-title';
      h.textContent = 'Recent games';
      extra.appendChild(h);
      const recent = document.createElement('div');
      recent.className = 'card-list';
      state.history.slice(0, 10).forEach((g) => {
        const row = document.createElement('div');
        row.className = 'score-row';
        row.innerHTML = `
          <div class="li-body"><strong>${LEVELS[g.level].label}</strong><small>${new Date(g.at).toLocaleDateString()}</small></div>
          <div class="val">${g.moves} moves<small>${fmt(g.time)}</small></div>`;
        recent.appendChild(row);
      });
      extra.appendChild(recent);
    }
  }

  // ---------- Profile ----------
  function renderProfile() {
    $('#name-input').value = state.name;
    $('#avatar').textContent = state.avatar;
    $('#opt-haptics').checked = state.haptics;
    $('#opt-sound').checked = state.sound;
    $('#profile-stats').textContent = state.played
      ? `${state.played} games · ${state.won} won`
      : 'No games played yet';
    const picker = $('#avatar-picker');
    picker.innerHTML = '';
    AVATARS.forEach((a) => {
      const b = document.createElement('button');
      b.textContent = a;
      b.setAttribute('aria-label', `Avatar ${a}`);
      if (a === state.avatar) b.classList.add('selected');
      b.addEventListener('click', () => {
        state.avatar = a; save(); renderProfile(); haptic(6);
      });
      picker.appendChild(b);
    });
  }

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const act = actionEl.dataset.action;
      if (act === 'start') startGame(actionEl.dataset.level || 'medium');
      else if (act === 'restart') startGame(game ? game.level : 'medium');
      else if (act === 'home') { $('#win-sheet').classList.add('hidden'); show('home'); }
      return;
    }
    const tab = e.target.closest('[data-tab-target]');
    if (tab) { show(tab.dataset.tabTarget); haptic(4); }
  });

  $('#back-btn').addEventListener('click', () => {
    clearInterval(timerId);
    goBack();
  });
  $('#board').addEventListener('click', onCardTap);

  $('#name-input').addEventListener('change', (e) => {
    state.name = e.target.value.trim().slice(0, 20); save();
    toast(state.name ? `Hi, ${state.name}!` : 'Name cleared');
  });
  $('#opt-haptics').addEventListener('change', (e) => { state.haptics = e.target.checked; save(); });
  $('#opt-sound').addEventListener('change', (e) => { state.sound = e.target.checked; save(); if (state.sound) tone(660); });
  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('Erase all scores and settings?')) return;
    state = defaults(); save();
    renderProfile(); renderBests(); toast('Data reset');
  });

  // Prevent the "pull to zoom" double-tap quirks on buttons
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch < 300 && e.target.closest('button')) e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  // ---------- Install (PWA) ----------
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#install-btn').classList.remove('hidden');
  });
  $('#install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#install-btn').classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => toast('Installed! 🎉'));

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ---------- Init ----------
  renderBests();
  show('home', { push: false });
})();
