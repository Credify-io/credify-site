/* Shared UI behaviors for all pages (extracted from the per-page inline
   scripts). Every block guards on its own elements, so one file serves
   home, /solutions/ and /apply/. */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const page = document.body.dataset.page || '';

  // ---------- Services dropdown (click toggle, hover-to-open, outside-click + Esc) ----------
  document.querySelectorAll('[data-nav-dropdown]').forEach(dd => {
    const trigger = dd.querySelector('.nav-link--trigger');
    const menu = dd.querySelector('.nav-menu');
    if (!trigger || !menu) return;

    let hoverTimer = null;
    const open = () => {
      dd.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      dd.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    };
    const toggle = () => {
      if (dd.classList.contains('is-open')) close(); else open();
    };

    trigger.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
    dd.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(open, 90);
    });
    dd.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(close, 180);
    });
    document.addEventListener('click', (e) => {
      if (!dd.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dd.classList.contains('is-open')) {
        close();
        trigger.focus();
      }
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  });

  // ---------- Morphing nav (bar -> liquid-glass pill) ----------
  const navEl = document.getElementById('nav');
  if (navEl) {
    const threshold = page === 'home' ? 80 : 24;
    let ticking = false;
    const updateNav = () => {
      if (window.scrollY > threshold) navEl.classList.add('is-stuck');
      else navEl.classList.remove('is-stuck');
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { window.requestAnimationFrame(updateNav); ticking = true; }
    }, { passive: true });
    updateNav();
  }

  // ---------- IntersectionObserver reveal with sibling stagger ----------
  const reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(el => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const parent = entry.target.parentElement;
          const siblings = parent ? Array.from(parent.querySelectorAll(':scope > .reveal')) : [];
          const idx = siblings.indexOf(entry.target);
          const delay = Math.max(0, idx) * 80;
          setTimeout(() => entry.target.classList.add('is-in'), delay);
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    reveals.forEach(el => io.observe(el));
  }

  // ---------- 3D tilt cards ----------
  if (!reduce && !window.matchMedia('(pointer: coarse)').matches) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      let raf = null;
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          card.classList.add('is-tilting');
          card.style.transform =
            'perspective(900px) rotateX(' + (-py * 6).toFixed(2) + 'deg) rotateY(' +
            (px * 8).toFixed(2) + 'deg) translateY(-2px)';
          // feed the cursor-spotlight gradient
          card.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%');
          card.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
        });
      });
      card.addEventListener('pointerleave', () => {
        card.classList.remove('is-tilting');
        card.style.transform = '';
      });
    });
  }

  // ---------- Capital-range bucket (calculator CTA + capture form funnel) ----------
  // Values must match the /apply/ capital-range option text exactly (en dashes).
  const bucketAmount = (total) => {
    if (total < 250000) return '$100K – $250K';
    if (total < 500000) return '$250K – $500K';
    if (total < 1000000) return '$500K – $1M';
    if (total < 2500000) return '$1M – $2.5M';
    if (total < 5000000) return '$2.5M – $5M';
    return '$5M+';
  };

  // ---------- Calculator (eligibility tool) ----------
  (function initCalculator() {
    const calc = document.getElementById('calculator');
    if (!calc) return;

    const state = {
      revenue: 30000,
      creditScore: 680,
      industry: 'Construction',
      timeInBusiness: '1-3 yr',
      bizType: 'LLC',
    };
    const TIME_FACTOR = { '< 6 mo': 0.3, '6-12 mo': 0.6, '1-3 yr': 0.9, '3+ yr': 1.0 };
    const TYPE_FACTOR = { 'LLC': 1.0, 'S-Corp': 1.05, 'C-Corp': 1.1, 'Sole Prop': 0.85 };
    const PRODUCT_LABELS = {
      revBased: 'Revenue-Based Financing',
      loc: 'Business Line of Credit',
      term: 'Term Loan',
      sba: 'SBA 7(a) Loan',
      asset: 'Asset-Based Loan',
    };
    // Theoretical maximum total (all inputs maxed) - normalizes the intensity
    // signal sent to the WebGL scene.
    const MAX_TOTAL = 1300000;

    const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

    function compute() {
      const revFactor = state.revenue / 30000;
      const creditFactor = Math.max(0, (state.creditScore - 500) / 300);
      const tf = TIME_FACTOR[state.timeInBusiness] || 0.9;
      const xf = TYPE_FACTOR[state.bizType] || 1.0;
      const base = 118500 * revFactor * (0.5 + 0.5 * creditFactor) * tf * xf;
      const revBased = Math.round(base * 0.165 / 500) * 500;
      const loc      = Math.round(base * 0.253 / 500) * 500;
      const term     = Math.round(base * 0.38  / 500) * 500;
      const sba      = (state.creditScore >= 650 && tf >= 0.9) ? Math.round(base * 0.5 / 1000) * 1000 : 0;
      const asset    = Math.round(base * 0.2  / 500) * 500;
      return { revBased, loc, term, sba, asset, total: revBased + loc + term + sba + asset };
    }

    function paintSlider(input) {
      const min = +input.min, max = +input.max, val = +input.value;
      const pct = ((val - min) / (max - min)) * 100;
      input.style.background =
        'linear-gradient(to right, var(--emerald) 0%, var(--emerald) ' + pct + '%, ' +
        'rgba(255,255,255,0.10) ' + pct + '%, rgba(255,255,255,0.10) 100%)';
    }

    const calcCta = calc.querySelector('.calc-cta');

    function update() {
      const r = compute();
      calc.querySelector('[data-out="total"]').textContent = fmt(r.total);
      Object.keys(PRODUCT_LABELS).forEach((k) => {
        const row = calc.querySelector('[data-row="' + k + '"]');
        if (!row) return;
        const amt = row.querySelector('[data-out]');
        const v = r[k];
        if (v > 0) {
          row.classList.remove('is-off');
          amt.textContent = fmt(v);
        } else {
          row.classList.add('is-off');
          amt.textContent = 'Not eligible';
        }
      });
      if (calcCta) {
        calcCta.href = '/apply/?amount=' + encodeURIComponent(bucketAmount(r.total));
      }
      // Feed the WebGL layer: sliders energize the stream and the live
      // total renders onto the 3D card's face.
      window.dispatchEvent(new CustomEvent('credify:calc', {
        detail: { ratio: Math.min(1, r.total / MAX_TOTAL), totalLabel: fmt(r.total) }
      }));
    }

    const revSlider = calc.querySelector('#calc-revenue');
    const credSlider = calc.querySelector('#calc-credit');
    const indSelect = calc.querySelector('#calc-industry');

    revSlider.addEventListener('input', () => {
      state.revenue = +revSlider.value;
      calc.querySelector('[data-target="revenue"]').textContent = fmt(state.revenue);
      paintSlider(revSlider);
      update();
    });
    credSlider.addEventListener('input', () => {
      state.creditScore = +credSlider.value;
      calc.querySelector('[data-target="credit"]').textContent = state.creditScore;
      paintSlider(credSlider);
      update();
    });
    indSelect.addEventListener('change', (e) => { state.industry = e.target.value; update(); });

    calc.querySelectorAll('.calc-pills').forEach((group) => {
      const target = group.dataset.target;
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('.calc-pill');
        if (!btn) return;
        group.querySelectorAll('.calc-pill').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const value = btn.dataset.value;
        if (target === 'time') state.timeInBusiness = value;
        else if (target === 'type') state.bizType = value;
        update();
      });
    });

    paintSlider(revSlider);
    paintSlider(credSlider);
    update();
  })();

  // ---------- Calc total: emerald flash on value change ----------
  const totalEl = document.querySelector('[data-out="total"]');
  if (totalEl) {
    let flashTimer = null;
    let lastValue = totalEl.textContent;
    const obs = new MutationObserver(() => {
      if (totalEl.textContent === lastValue) return;
      lastValue = totalEl.textContent;
      totalEl.classList.add('is-flashing');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => totalEl.classList.remove('is-flashing'), 480);
    });
    obs.observe(totalEl, { childList: true, characterData: true, subtree: true });
  }

  // ---------- Stats: count up on view ----------
  const statFigs = document.querySelectorAll('.stat-fig');
  if (statFigs.length && !reduce && 'IntersectionObserver' in window) {
    const parseStat = (text) => {
      const m = text.match(/^(\$?)(\d+(?:\.\d+)?)([KMB]?\+?)$/);
      if (!m) return null;
      return { prefix: m[1], num: parseFloat(m[2]), suffix: m[3], original: text };
    };
    const formatStat = (parsed, value) => {
      const rounded = parsed.num >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
      return parsed.prefix + rounded + parsed.suffix;
    };
    const animate = (el, parsed) => {
      const dur = 1400;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = formatStat(parsed, parsed.num * eased);
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = parsed.original;
      };
      requestAnimationFrame(tick);
    };
    const sio = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const parsed = parseStat(el.textContent.trim());
        if (parsed) animate(el, parsed);
        obs.unobserve(el);
      });
    }, { threshold: 0.4 });
    statFigs.forEach((el) => sio.observe(el));
  }

  // ---------- Process timeline: animate connector when in view ----------
  const pathEl = document.querySelector('.path');
  if (pathEl) {
    if (reduce || !('IntersectionObserver' in window)) {
      pathEl.classList.add('is-drawn');
    } else {
      const pio = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            pathEl.classList.add('is-drawn');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      pio.observe(pathEl);
    }
  }

  // ---------- Scroll morph: sections scale/slide/fade as they travel ----------
  // Continuous scroll-driven transform (not a one-shot reveal): each section
  // eases up to full size/opacity as it approaches viewport center and
  // recedes as it leaves. Skipped for reduced motion.
  if (!reduce && page === 'home') {
    const morphs = Array.from(document.querySelectorAll('main > section'))
      .filter(s => !s.classList.contains('hero'));
    morphs.forEach(s => { s.style.willChange = 'transform, opacity'; });
    let mTick = false;
    const morphUpdate = () => {
      const vh = window.innerHeight;
      morphs.forEach((sec) => {
        const r = sec.getBoundingClientRect();
        if (r.bottom < -240 || r.top > vh + 240) return; // offscreen, skip work
        const c = r.top + r.height / 2;
        const d = (c - vh / 2) / (vh / 2 + r.height / 2); // signed distance, -1..1
        const a = Math.min(1, Math.abs(d));
        const v = 1 - a * a;
        const scale = 0.94 + 0.06 * v;
        const ty = d * 48;
        sec.style.transform =
          'perspective(1200px) translateY(' + ty.toFixed(1) + 'px) scale(' +
          scale.toFixed(3) + ') rotateX(' + (d * -3).toFixed(2) + 'deg)';
        sec.style.opacity = (0.35 + 0.65 * v).toFixed(3);
      });
      mTick = false;
    };
    window.addEventListener('scroll', () => {
      if (!mTick) { requestAnimationFrame(morphUpdate); mTick = true; }
    }, { passive: true });
    window.addEventListener('resize', morphUpdate);
    morphUpdate();
  }

  // ---------- Form UX: phone auto-format + live validation ----------
  document.querySelectorAll('input[type="tel"]').forEach((el) => {
    el.addEventListener('input', () => {
      const d = el.value.replace(/\D/g, '').slice(0, 10);
      let v = d;
      if (d.length > 6) v = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
      else if (d.length > 3) v = '(' + d.slice(0, 3) + ') ' + d.slice(3);
      else if (d.length > 0) v = '(' + d;
      el.value = v;
    });
  });

  document.querySelectorAll('.field-input, .field-select').forEach((el) => {
    const update = () => {
      if (el.value && el.checkValidity()) {
        el.classList.add('is-valid');
        el.classList.remove('is-invalid');
      } else if (!el.value) {
        el.classList.remove('is-valid', 'is-invalid');
      } else {
        el.classList.remove('is-valid');
      }
    };
    el.addEventListener('input', update);
    el.addEventListener('change', update);
    el.addEventListener('blur', () => {
      update();
      if (el.required && (!el.value || !el.checkValidity())) el.classList.add('is-invalid');
    });
  });

  // ---------- Cursor-follow emerald glow (desktop, non-reduced) ----------
  if (!reduce && !window.matchMedia('(pointer: coarse)').matches) {
    const glow = document.createElement('div');
    glow.id = 'cursor-glow';
    document.body.appendChild(glow);
    let gx = 0, gy = 0, tx = -500, ty = -500, gRaf = null;
    const step = () => {
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      glow.style.transform = 'translate(' + gx.toFixed(1) + 'px, ' + gy.toFixed(1) + 'px)';
      gRaf = (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5) ? requestAnimationFrame(step) : null;
    };
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!gRaf) gRaf = requestAnimationFrame(step);
    }, { passive: true });
  }

  // ---------- Inline capture form (home): funnel into /apply/ prefilled ----------
  const capture = document.getElementById('capture-form');
  if (capture) {
    // quick-pick amount chips -> hidden input
    const amountInput = document.getElementById('c-amount');
    capture.querySelectorAll('.amount-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const active = chip.classList.contains('is-active');
        capture.querySelectorAll('.amount-chip').forEach((c) => c.classList.remove('is-active'));
        if (!active) {
          chip.classList.add('is-active');
          amountInput.value = chip.dataset.value;
        } else {
          amountInput.value = '';
        }
      });
    });
    capture.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!capture.checkValidity()) {
        capture.reportValidity();
        return;
      }
      const params = new URLSearchParams();
      const map = { 'c-name': 'name', 'c-email': 'email', 'c-phone': 'phone', 'c-amount': 'amount' };
      Object.keys(map).forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.value) params.set(map[id], el.value.trim());
      });
      window.location.href = '/apply/?' + params.toString();
    });
  }

  // ---------- Sticky mobile CTA (appears once the hero scrolls out) ----------
  const stickyCta = document.getElementById('sticky-cta');
  if (stickyCta) {
    let sticking = false;
    const updateSticky = () => {
      const show = window.scrollY > window.innerHeight * 0.7;
      stickyCta.classList.toggle('is-visible', show);
      sticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!sticking) { requestAnimationFrame(updateSticky); sticking = true; }
    }, { passive: true });
    updateSticky();
  }

  // ---------- Industry rail (solutions): highlight active section ----------
  const railLinks = Array.from(document.querySelectorAll('.ind-rail-link'));
  if (railLinks.length && 'IntersectionObserver' in window) {
    const cards = railLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if (cards.length) {
      const setActive = (id) => {
        railLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
      };
      const railIO = new IntersectionObserver((entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (!visible.length) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        setActive(visible[0].target.id);
      }, { threshold: 0, rootMargin: '-180px 0px -60% 0px' });
      cards.forEach(c => railIO.observe(c));
    }
  }

  // ---------- Apply page: day/time-slot picker + prefill + submit ----------
  const form = document.getElementById('apply-form');
  if (form) {
    const dayTrack  = document.querySelector('.day-track');
    const slotGrid  = document.querySelector('.slot-grid');
    const slotInput = document.getElementById('f-slot');
    const slotHint  = document.getElementById('slot-hint');
    const slotHintText = document.getElementById('slot-hint-text');

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MO  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const SLOTS = [
      '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM',
      '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
      '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
      '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM'
    ];
    // Deterministic pseudo-random keyed on the date string, so revisits see a
    // stable calendar of "taken" slots.
    const seedHash = (s) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    };
    const isTaken = (dateStr, slotIdx) => (seedHash(dateStr + ':' + slotIdx) % 100) < 35;

    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i + 1); // start tomorrow
      const dow = d.getDay();
      const isWeekend = (dow === 0 || dow === 6);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({
        date: d, dateStr,
        dow: DOW[dow], day: d.getDate(), mo: MO[d.getMonth()],
        isWeekend
      });
    }

    const visibleDays = window.matchMedia('(max-width: 720px)').matches ? days : days.slice(0, 7);

    visibleDays.forEach(d => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'day-tile' + (d.isWeekend ? ' is-disabled' : '');
      tile.setAttribute('role', 'radio');
      tile.setAttribute('aria-checked', 'false');
      tile.setAttribute('aria-label', `${d.dow} ${d.mo} ${d.day}${d.isWeekend ? ' (closed)' : ''}`);
      if (d.isWeekend) tile.disabled = true;
      tile.dataset.dateStr = d.dateStr;
      tile.innerHTML = `
        <span class="day-tile-dow">${d.dow}</span>
        <span class="day-tile-day">${d.day}</span>
        <span class="day-tile-mo">${d.mo}</span>
      `;
      tile.addEventListener('click', () => {
        if (d.isWeekend) return;
        selectDay(d);
      });
      dayTrack.appendChild(tile);
    });

    function renderSlots(d) {
      slotGrid.innerHTML = '';
      SLOTS.forEach((label, idx) => {
        const taken = isTaken(d.dateStr, idx);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot-btn';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.setAttribute('aria-label', `${label} on ${d.dow} ${d.mo} ${d.day}${taken ? ' (unavailable)' : ''}`);
        btn.disabled = taken;
        btn.textContent = label;
        btn.addEventListener('click', () => selectSlot(d, label, btn));
        slotGrid.appendChild(btn);
      });
    }

    function selectDay(d) {
      slotInput.value = '';
      [...dayTrack.children].forEach(t => {
        const isMe = t.dataset.dateStr === d.dateStr;
        t.classList.toggle('is-active', isMe);
        t.setAttribute('aria-checked', isMe ? 'true' : 'false');
      });
      renderSlots(d);
      slotHint.classList.remove('is-confirmed');
      slotHintText.textContent = `Choose a time for ${d.dow}, ${d.mo} ${d.day}`;
    }

    function selectSlot(d, label, btn) {
      [...slotGrid.children].forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-checked', 'true');
      const value = `${d.dow}, ${d.mo} ${d.day} · ${label} ET`;
      slotInput.value = value;
      slotHint.classList.add('is-confirmed');
      slotHintText.textContent = `Holding ${value}`;
    }

    // Auto-select the first open day so times show immediately - one less
    // decision before the user sees available slots.
    const firstOpen = visibleDays.find(d => !d.isWeekend);
    if (firstOpen) selectDay(firstOpen);
    if (slotGrid && !slotGrid.children.length) {
      const empty = document.createElement('div');
      empty.className = 'slot-grid-empty';
      empty.textContent = 'Pick a day above to see open times.';
      slotGrid.appendChild(empty);
    }

    // Pre-fill from URL params (from the home capture form, calculator CTA,
    // or solutions deep links).
    const params = new URLSearchParams(window.location.search);
    const setIfParam = (paramKey, fieldId) => {
      const v = params.get(paramKey);
      if (!v) return;
      const el = document.getElementById(fieldId);
      if (!el) return;
      if (el.tagName === 'SELECT') {
        const found = [...el.options].find(o => o.value === v || o.textContent.trim() === v);
        if (found) el.value = found.value || found.textContent;
      } else {
        el.value = v;
      }
    };
    setIfParam('industry', 'f-industry');
    setIfParam('amount', 'f-amount');
    setIfParam('name', 'f-fname');
    setIfParam('email', 'f-email');
    setIfParam('phone', 'f-phone');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const successWhen = document.getElementById('success-when');
      if (successWhen && slotInput && slotInput.value) {
        successWhen.textContent = slotInput.value;
      }
      form.classList.add('is-submitted');
      window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
    });
  }
})();
