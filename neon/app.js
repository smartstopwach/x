(() => {
  'use strict';
  const ROUNDS = 5;
  const BEST_KEY = 'neon-reaction.best';
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const video = $('#cam');
  const mctx = $('#motion').getContext('2d', { willReadFrequently: true });

  const S = {
    phase: 'idle',        // idle | wait | go | early | done
    round: 0,             // 0-based index
    times: [],
    goAt: 0,
    timers: [],
    stream: null,
    camOn: false,
    prev: null,
    motionTimer: null,
    lastTrigger: 0,
  };

  const later = (fn, ms) => { const id = setTimeout(fn, ms); S.timers.push(id); return id; };
  const clearTimers = () => { S.timers.forEach(clearTimeout); S.timers = []; };
  const buzz = (p) => { if (navigator.vibrate) navigator.vibrate(p); };

  function showPanel(id) {
    ['#p-start', '#p-play', '#p-result'].forEach((p) => $(p).classList.toggle('hidden', p !== id));
  }
  function setPhase(p) { S.phase = p; stage.dataset.phase = p; }
  function setCue(text) { $('#cue').textContent = text; }
  function flash(bad) {
    const f = $('#flash');
    f.classList.remove('on', 'bad');
    void f.offsetWidth;
    f.classList.add('on');
    if (bad) f.classList.add('bad');
  }
  const cueWord = () => (S.camOn ? 'WAVE!' : 'TAP!');

  // ---------- Camera ----------
  async function enableCamera() {
    const status = $('#cam-status');
    status.className = 'status';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.className = 'status err';
      status.textContent = 'Camera is not available in this browser. Use tap mode instead.';
      return false;
    }
    status.textContent = 'Waiting for permission…';
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      video.srcObject = S.stream;
      await video.play().catch(() => {});
      S.camOn = true;
      stage.classList.add('cam-on');
      status.textContent = 'Camera on. Wave your hand when the ring turns green.';
      startMotion();
      return true;
    } catch (err) {
      status.className = 'status err';
      status.textContent = err && err.name === 'NotAllowedError'
        ? 'Camera permission was denied. You can allow it in browser settings, or play with tap.'
        : 'Could not open the camera. Play with tap instead.';
      return false;
    }
  }

  function stopCamera() {
    stopMotion();
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null; S.camOn = false; video.srcObject = null;
    stage.classList.remove('cam-on');
  }

  // Motion detection on a tiny grayscale frame. Frames never leave the device.
  function startMotion() {
    stopMotion();
    S.prev = null;
    S.motionTimer = setInterval(checkMotion, 70);
  }
  function stopMotion() { clearInterval(S.motionTimer); S.motionTimer = null; S.prev = null; }
  function checkMotion() {
    if (video.readyState < 2) return;
    const w = 48, h = 36;
    mctx.drawImage(video, 0, 0, w, h);
    const data = mctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11);
    }
    const prev = S.prev;
    S.prev = gray;
    if (!prev || S.phase !== 'go') return;
    let diff = 0;
    for (let k = 0; k < gray.length; k++) diff += Math.abs(gray[k] - prev[k]);
    const avg = diff / gray.length;
    // Threshold: a real hand wave changes many pixels; sensor noise stays low.
    if (avg > 14 && performance.now() - S.lastTrigger > 300) {
      S.lastTrigger = performance.now();
      onReact();
    }
  }

  // ---------- Game ----------
  function startGame() {
    clearTimers();
    S.round = 0; S.times = [];
    $('#times').innerHTML = '';
    showPanel('#p-play');
    runRound();
  }

  function runRound() {
    clearTimers();
    setPhase('wait');
    $('#round-label').textContent = `Round ${S.round + 1} / ${ROUNDS}`;
    $('#hint').textContent = S.camOn ? 'Keep your hand still. Wave when it turns green.' : 'Tap when it turns green.';
    setCue('Wait…');
    const delay = 1500 + Math.random() * 3000;
    later(() => {
      if (S.phase !== 'wait') return;
      setPhase('go');
      S.goAt = performance.now();
      setCue(cueWord());
      flash(false); buzz(20);
    }, delay);
  }

  function onReact() {
    if (S.phase === 'wait') {
      // false start
      clearTimers();
      setPhase('early');
      setCue('Too early!');
      flash(true); buzz([40, 60, 40]);
      later(() => runRound(), 1200);
      return;
    }
    if (S.phase !== 'go') return;
    const rt = Math.round(performance.now() - S.goAt);
    S.times.push(rt);
    setPhase('done');
    setCue(`${rt} ms`);
    buzz(12);
    const chip = document.createElement('span');
    chip.className = 't';
    chip.textContent = `${rt} ms`;
    $('#times').appendChild(chip);
    S.round++;
    clearTimers();
    later(() => (S.round < ROUNDS ? runRound() : showResults()), 1100);
  }

  function gradeFor(avg) {
    if (avg < 200) return 'LIGHTNING ⚡';
    if (avg < 250) return 'Super fast';
    if (avg < 300) return 'Solid reflexes';
    if (avg < 380) return 'Getting there';
    return 'Warm up, try again';
  }

  function showResults() {
    setPhase('idle');
    const avg = Math.round(S.times.reduce((a, b) => a + b, 0) / S.times.length);
    $('#res-avg').textContent = avg;
    $('#res-grade').textContent = gradeFor(avg);
    $('#res-rounds').innerHTML = S.times.map((t, i) =>
      `<span class="r ${t > 300 ? 'bad' : ''}">#${i + 1} · ${t} ms</span>`).join('');
    const best = Number(localStorage.getItem(BEST_KEY)) || 0;
    if (!best || avg < best) {
      localStorage.setItem(BEST_KEY, String(avg));
      $('#res-grade').textContent += ' · NEW BEST!';
    }
    renderBest();
    showPanel('#p-result');
  }

  function renderBest() {
    const b = Number(localStorage.getItem(BEST_KEY)) || 0;
    $('#best-avg').textContent = b ? `${b} ms` : '—';
  }

  function toMenu() {
    clearTimers();
    setPhase('idle');
    stopCamera();
    renderBest();
    showPanel('#p-start');
  }

  // ---------- Events ----------
  $('#btn-cam').addEventListener('click', async () => {
    const ok = await enableCamera();
    if (ok) startGame();
  });
  $('#btn-tap').addEventListener('click', () => { startGame(); });
  $('#btn-again').addEventListener('click', () => {
    if (S.camOn) startGame(); else startGame();
  });
  $('#btn-home').addEventListener('click', toMenu);
  $('#btn-quit').addEventListener('click', toMenu);

  // Any tap/press counts while the game panel is visible.
  document.addEventListener('pointerdown', (e) => {
    if ($('#p-play').classList.contains('hidden')) return;
    if (e.target.closest('button')) return;
    onReact();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !$('#p-play').classList.contains('hidden')) { e.preventDefault(); onReact(); }
  });

  renderBest();
})();
