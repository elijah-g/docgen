// Deterministic walkthrough player, ported from reference/tallyup/pipeline/player/player.js.
// Every visual is a pure function of time: window.renderAt(t) puts the DOM in its state for
// second t and resolves once the screenshots it needs are decoded, so the renderer can capture
// any frame in any order. Opened directly in a browser it also plays in real time.
/* global TIMELINE */
(() => {
  const TL = window.TIMELINE
  const $ = (id) => document.getElementById(id)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, p) => a + (b - a) * p
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) // cubic in-out
  const easeOut = (p) => 1 - Math.pow(1 - p, 3)
  const ramp = (t, t0, d) => clamp((t - t0) / d, 0, 1)
  const VW = TL.viewport.w, VH = TL.viewport.h
  const K = TL.stage.w / VW

  // ------------------------------------------------------------ static DOM
  const stage = $('stage')
  Object.assign(stage.style, { left: `${TL.stage.x}px`, top: `${TL.stage.y}px`, width: `${TL.stage.w}px`, height: `${TL.stage.h}px` })
  const imgA = $('imgA'), imgB = $('imgB')
  const spot = $('spot'), cursor = $('cursor'), cam = $('cam')
  const ripples = TL.clicks.map(() => { const r = document.createElement('div'); r.className = 'ripple'; cam.insertBefore(r, cursor); return r })

  const brand = TL.brand ?? { name: '' }
  for (const [nameId, logoId] of [['brand-name', 'brand-logo'], ['outro-brand-name', 'outro-logo']]) {
    $(nameId).textContent = brand.name
    if (brand.logoSrc) { $(logoId).src = brand.logoSrc; $(logoId).style.display = '' }
  }

  $('intro-eyebrow').textContent = TL.intro.eyebrow
  $('intro-title').innerHTML = TL.intro.titleHtml
  $('intro-sub').textContent = TL.intro.subtitle
  $('intro-parts').innerHTML = TL.chapters.map((c, i) => `<div class="part"><span class="n">${i + 1}</span>${c}</div>`).join('')
  $('outro-title').textContent = TL.outro.title
  const tick = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  $('outro-recap').innerHTML = TL.outro.recap.map((r) => `<div class="row"><span class="tick">${tick}</span><span>${r}</span></div>`).join('')
  const recapRows = [...$('outro-recap').children]
  $('outro-tagline').textContent = brand.name

  // ------------------------------------------------------------ lookups
  function lastAtOrBefore(list, t, key = 't') {
    let lo = 0, hi = list.length - 1, ans = -1
    while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m][key] <= t) { ans = m; lo = m + 1 } else hi = m - 1 }
    return ans
  }

  function cameraAt(t) {
    const i = lastAtOrBefore(TL.cameras, t, 't0')
    if (i < 0) return TL.cameras[0].from
    const c = TL.cameras[i]
    const p = ease(ramp(t, c.t0, c.t1 - c.t0))
    return { z: lerp(c.from.z, c.to.z, p), cx: lerp(c.from.cx, c.to.cx, p), cy: lerp(c.from.cy, c.to.cy, p) }
  }

  function cursorAt(t) {
    const i = lastAtOrBefore(TL.moves, t, 't0')
    if (i < 0) return { ...TL.cursorStart }
    const m = TL.moves[i]
    const p = ease(ramp(t, m.t0, m.t1 - m.t0))
    // Gentle arc: bend the straight path sideways by a fraction of its length.
    const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y
    const bend = Math.sin(Math.PI * p) * 0.08
    return { x: lerp(m.from.x, m.to.x, p) - dy * bend, y: lerp(m.from.y, m.to.y, p) + dx * bend }
  }

  // ------------------------------------------------------------ images
  function setSrc(img, src) {
    if (img.dataset.src === src) return img.decode().catch(() => {})
    img.dataset.src = src
    img.src = src
    return img.decode().catch(() => {})
  }

  // ------------------------------------------------------------ render
  // packages/engine/src/render/state.ts's frameSignature() is a hand-kept Node-side port of every
  // value this function computes (no DOM, so it can run per-candidate-frame without a browser) —
  // video.ts's renderFrameRange uses it to skip re-rendering a frame whose signature matches the
  // previous one. Any change here that changes what's visible (a new ramp/ease term, a new
  // branch, a new style/content assignment) must be mirrored there, or a frame that actually
  // changed could get a false signature match and come out as a repeated/frozen frame with no
  // test catching it.
  async function renderAt(t) {
    const waits = []

    // Scene envelope: intro card -> stage -> outro card.
    const sIn = ease(ramp(t, TL.stageIn.t0, TL.stageIn.t1 - TL.stageIn.t0))
    const sOut = ease(ramp(t, TL.stageOut.t0, TL.stageOut.t1 - TL.stageOut.t0))
    const stageVis = sIn * (1 - sOut)
    stage.style.opacity = stageVis
    stage.style.transform = `translateY(${(1 - sIn) * 40 + sOut * -30}px) scale(${0.94 + 0.06 * sIn - 0.04 * sOut})`
    stage.style.visibility = stageVis > 0.001 ? 'visible' : 'hidden'

    // Intro card.
    const intro = $('intro')
    const iOut = ease(ramp(t, TL.stageIn.t0 - 0.45, 0.5))
    intro.style.visibility = iOut < 0.999 ? 'visible' : 'hidden'
    intro.style.opacity = 1 - iOut
    intro.style.transform = `translateY(${-50 * iOut}px)`
    const reveal = (el, start, dur = 0.7, dy = 26) => {
      const p = easeOut(ramp(t, start, dur))
      el.style.opacity = p
      el.style.transform = `translateY(${(1 - p) * dy}px)`
    }
    reveal($('intro-brand'), 0.15)
    reveal($('intro-eyebrow'), 0.45)
    reveal($('intro-title'), 0.65, 0.8, 40)
    reveal($('intro-sub'), 1.15)
    reveal($('intro-parts'), 1.6)

    // Outro card.
    const outro = $('outro')
    const oIn = ease(ramp(t, TL.stageOut.t0 + 0.25, 0.7))
    outro.style.visibility = oIn > 0.001 ? 'visible' : 'hidden'
    outro.style.opacity = oIn
    const o0 = TL.stageOut.t0 + 0.35
    reveal($('outro-title'), o0, 0.7, 40)
    recapRows.forEach((row, i) => reveal(row, o0 + 0.5 + i * 0.35, 0.6, 18))
    reveal($('outro-foot'), o0 + 0.6 + recapRows.length * 0.35)

    if (stageVis > 0.001) {
      // Screenshot layers: current frame over the previous one while fading.
      const fi = Math.max(0, lastAtOrBefore(TL.frames, t))
      const cur = TL.frames[fi], prev = TL.frames[Math.max(0, fi - 1)]
      const fadeP = cur.transition === 'fade' ? ramp(t, cur.t, TL.fade) : 1
      waits.push(setSrc(imgA, prev.src), setSrc(imgB, cur.src))
      imgB.style.opacity = fadeP

      // Camera.
      const c = cameraAt(t)
      const z = c.z
      const cx = clamp(c.cx, VW / 2 / z, VW - VW / 2 / z)
      const cy = clamp(c.cy, VH / 2 / z, VH - VH / 2 / z)
      const s = K * z
      cam.style.transform = `translate(${TL.stage.w / 2 - cx * s}px, ${TL.stage.h / 2 - cy * s}px) scale(${s})`

      // Highlight.
      const hi = TL.highlights.find((h) => t >= h.t0 && t <= h.t1)
      if (hi) {
        const a = Math.min(easeOut(ramp(t, hi.t0, 0.3)), 1 - ramp(t, hi.t1 - 0.25, 0.25))
        const pad = 8 + (1 - a) * 10
        Object.assign(spot.style, {
          display: 'block', opacity: a,
          left: `${hi.box.x - pad}px`, top: `${hi.box.y - pad}px`,
          width: `${hi.box.w + pad * 2}px`, height: `${hi.box.h + pad * 2}px`,
        })
      } else spot.style.display = 'none'

      // Cursor (counter-scaled a little so it never balloons when zoomed).
      const p = cursorAt(t)
      const press = TL.clicks.some((k) => t >= k.t && t <= k.t + 0.16) ? 0.86 : 1
      const cs = (1 / Math.sqrt(z)) * press / K * 1.15
      const cVis = ramp(t, TL.stageIn.t1 - 0.2, 0.4)
      cursor.style.opacity = cVis
      cursor.style.transform = `translate(${p.x - 2}px, ${p.y - 1}px) scale(${cs})`

      // Click ripples.
      TL.clicks.forEach((k, i) => {
        const r = ripples[i]
        const q = (t - k.t) / 0.55
        if (q < 0 || q > 1) { r.style.display = 'none'; return }
        const d = 14 + easeOut(q) * 56
        Object.assign(r.style, { display: 'block', left: `${k.x}px`, top: `${k.y}px`, width: `${d}px`, height: `${d}px`, opacity: 1 - q })
      })
    }

    // Caption band.
    const cap = TL.captions.find((c) => t >= c.t0 && t <= c.t1)
    const capEl = $('caption')
    if (cap) {
      capEl.textContent = cap.text
      capEl.style.opacity = Math.min(ramp(t, cap.t0, 0.2), 1 - ramp(t, cap.t1 - 0.2, 0.2))
    } else capEl.style.opacity = 0
    const chip = TL.chips.find((c) => t >= c.t0 && t < c.t1)
    const chipEl = $('chip')
    if (chip) {
      chipEl.querySelector('.num').textContent = chip.num
      chipEl.querySelector('.eyebrow').textContent = chip.eyebrow
      chipEl.querySelector('.title').textContent = chip.title
      const a = easeOut(ramp(t, chip.t0, 0.35))
      chipEl.style.opacity = a
      chipEl.style.transform = `translateX(${(1 - a) * -16}px)`
    } else chipEl.style.opacity = 0

    await Promise.all(waits)
  }
  window.renderAt = renderAt

  // ------------------------------------------------------------ live preview
  if (!/render=1/.test(location.search)) {
    const audio = new Audio(TL.previewAudio)
    let playing = false, t0 = 0
    const loop = async () => {
      if (!playing) return
      const t = audio.currentTime
      await renderAt(t)
      if (t >= TL.duration) { playing = false; return }
      requestAnimationFrame(loop)
    }
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return
      playing = !playing
      if (playing) { audio.play(); loop() } else audio.pause()
    })
    renderAt(t0)
    console.log('Press space to play / pause')
  }
})()
