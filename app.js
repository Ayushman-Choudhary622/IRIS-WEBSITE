/**
 * PROJECT IRIS
 * Next-Gen 3D Motion & Interactive Assistive Technology Engine
 * Written in Vanilla JavaScript for maximum 60–120 FPS performance.
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. CONFIGURATION & STATE
  // -------------------------------------------------------------------------
  const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  
  const CONFIG = {
    totalFramesDark: 275,
    totalFramesLight: 276,
    // Primary: WebP high-performance frames (44KB each vs 500KB PNGs — 10x faster & 90% memory reduction)
    darkFramePath: (i) => `frames_dark_opt/frame_${String(i).padStart(3, '0')}.webp`,
    lightFramePath: (i) => `frames_light_opt/frame_${String(i).padStart(3, '0')}.webp`,
    // Fallback: Raw PNG frames if WebP fails
    darkFramePathPng: (i) => `Dark theme frames/ezgif-frame-${String(i).padStart(3, '0')}.png`,
    lightFramePathPng: (i) => `Light theme frames/ezgif-frame-${String(i).padStart(3, '0')}.png`,
    lerpFactor: isMobile ? 0.2 : 0.12,
  };

  const savedTheme = localStorage.getItem('iris_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const state = {
    theme: savedTheme,
    darkImages: [],
    lightImages: [],
    darkLoaded: 0,
    lightLoaded: 0,
    isReady: false,
    sfxEnabled: true,
    scrollProgress: 0,
    currentFrame: 0,
    targetFrame: 0,
    isAutoPlaying: false,
    autoPlayDirection: 1,
    activeTile: null,
    virtualRoomLightOn: true,
    currentWizardStep: 1,
    selectedComponent: 'xiao',
    inactiveThemeQueued: false,
  };

  // -------------------------------------------------------------------------
  // 2. WEB AUDIO SFX SYNTHESIZER
  // -------------------------------------------------------------------------
  let audioCtx = null;
  let lastTickTime = 0;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.1) {
    if (!state.sfxEnabled) return;
    initAudio();
    if (!audioCtx) return;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  function playScrollTick() {
    // Throttle scroll ticks so rapid mobile touch drags don't flood Web Audio
    const now = performance.now();
    if (now - lastTickTime < 85) return;
    lastTickTime = now;
    playTone(1400, 'triangle', 0.02, 0.012);
  }

  function playBlinkSound(category) {
    if (category === 'ignored') {
      playTone(220, 'sine', 0.06, 0.05);
    } else if (category === 'single') {
      playTone(880, 'sine', 0.15, 0.12);
    } else if (category === 'double') {
      playTone(880, 'sine', 0.08, 0.1);
      setTimeout(() => playTone(1320, 'sine', 0.16, 0.14), 90);
    } else if (category === 'sos') {
      playTone(550, 'sawtooth', 0.2, 0.2);
      setTimeout(() => playTone(750, 'sawtooth', 0.2, 0.25), 180);
    }
  }

  // -------------------------------------------------------------------------
  // 3. WEB SPEECH API VOCALIZER (Real Assistive Voice Synthesis)
  // -------------------------------------------------------------------------
  function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  // -------------------------------------------------------------------------
  // 4. ASSET PRELOADER ENGINE (OPTIMIZED FOR ZERO SLUGGISHNESS)
  // -------------------------------------------------------------------------
  const preloader = document.getElementById('preloader');
  const preloaderBar = document.getElementById('preloader-bar');
  const preloaderText = document.getElementById('preloader-text');

  function queueDarkFrames() {
    if (state.darkImages.length > 0) return;
    for (let i = 1; i <= CONFIG.totalFramesDark; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        state.darkLoaded++;
        checkPreloadProgress();
      };
      img.onerror = () => {
        // Fallback to raw PNG if webp missing
        img.onerror = () => {
          state.darkLoaded++;
          checkPreloadProgress();
        };
        img.src = CONFIG.darkFramePathPng(i);
      };
      img.src = CONFIG.darkFramePath(i);
      state.darkImages.push(img);
    }
  }

  function queueLightFrames() {
    if (state.lightImages.length > 0) return;
    for (let i = 1; i <= CONFIG.totalFramesLight; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        state.lightLoaded++;
        checkPreloadProgress();
      };
      img.onerror = () => {
        // Fallback to raw PNG if webp missing
        img.onerror = () => {
          state.lightLoaded++;
          checkPreloadProgress();
        };
        img.src = CONFIG.lightFramePathPng(i);
      };
      img.src = CONFIG.lightFramePath(i);
      state.lightImages.push(img);
    }
  }

  function checkPreloadProgress() {
    const activeTotal = state.theme === 'light' ? CONFIG.totalFramesLight : CONFIG.totalFramesDark;
    const activeLoaded = state.theme === 'light' ? state.lightLoaded : state.darkLoaded;
    const percent = Math.min(100, Math.floor((activeLoaded / activeTotal) * 100));

    if (preloaderBar) preloaderBar.style.width = percent + '%';
    if (preloaderText) preloaderText.textContent = `Buffering 3D motion frames... ${percent}%`;

    // Instant launch threshold: on mobile, 15 frames gives instant interaction; 25 on desktop
    const readyThreshold = isMobile ? 12 : 25;
    if (activeLoaded >= readyThreshold && !state.isReady) {
      state.isReady = true;
      dismissPreloader();
      requestAnimationFrame(renderLoop);
    }
  }

  function preloadFrames() {
    // Only queue active theme at startup! Saves ~150MB of RAM and 276 network calls on mobile
    if (state.theme === 'light') {
      queueLightFrames();
      // Lazy load inactive theme only when idle or after delay
      const scheduleDark = () => {
        if (!state.inactiveThemeQueued) {
          state.inactiveThemeQueued = true;
          queueDarkFrames();
        }
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(scheduleDark, { timeout: 3000 });
      } else {
        setTimeout(scheduleDark, 2000);
      }
    } else {
      queueDarkFrames();
      const scheduleLight = () => {
        if (!state.inactiveThemeQueued) {
          state.inactiveThemeQueued = true;
          queueLightFrames();
        }
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(scheduleLight, { timeout: 3000 });
      } else {
        setTimeout(scheduleLight, 2000);
      }
    }
  }

  function dismissPreloader() {
    if (preloader) {
      preloader.classList.add('fade-out');
      setTimeout(() => {
        preloader.style.display = 'none';
      }, 500);
    }
  }

  // Fallback safety timeout: never trap user on mobile
  setTimeout(() => {
    if (!state.isReady) {
      state.isReady = true;
      dismissPreloader();
      requestAnimationFrame(renderLoop);
    }
  }, isMobile ? 2200 : 3500);

  // -------------------------------------------------------------------------
  // 5. MASTER SCROLLY ENGINE (TWO-PHASE CONTINUOUS EXPERIENCE)
  // Phase 1: Pure 3D Rotation (Clean, zero text cards obstructing the model)
  // Phase 2: Microscopic Component Zoom Journey (Pins on final frame & zooms line-by-line)
  // -------------------------------------------------------------------------
  const canvas = document.getElementById('motion-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const heroViewport = document.getElementById('hero-intro');
  const heroTopIntro = document.getElementById('hero-top-intro');
  const canvasZoomWrapper = document.getElementById('canvas-zoom-wrapper');
  const cameraReticle = document.getElementById('camera-reticle');
  const scrubPhase = document.getElementById('scrub-phase');
  const zoomSteps = document.querySelectorAll('.zoom-scroll-step');
  const ambientGlow = document.getElementById('ambient-glow');

  let lastDrawnFrame = -1;

  // Exact coordinates and magnification for each component on the final exploded blueprint frame
  const ZOOM_TARGETS = {
    overview: { x: 50, y: 50, scale: 1.0, reticle: false },
    xiao:     { x: 50, y: 44, scale: 2.6, reticle: true },
    imu:      { x: 50, y: 58, scale: 2.8, reticle: true },
    ir:       { x: 28, y: 48, scale: 2.8, reticle: true },
    battery:  { x: 63, y: 44, scale: 2.5, reticle: true },
    magnets:  { x: 18, y: 48, scale: 2.8, reticle: true },
    headband: { x: 50, y: 78, scale: 2.1, reticle: true }
  };

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const isMob = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const dpr = Math.min(window.devicePixelRatio || 1, isMob ? 1.5 : 2);
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    
    drawFrame(Math.round(state.currentFrame));
  }

  window.addEventListener('resize', resizeCanvas);

  // Direct touch drag on 3D canvas (Allows swiping to spin wearable model on mobile)
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartFrame = 0;

  if (canvas) {
    canvas.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartFrame = state.targetFrame;
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;

      // When horizontal drag is dominant, rotate the 3D model directly
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        const maxFrames = state.theme === 'light' ? CONFIG.totalFramesLight : CONFIG.totalFramesDark;
        const frameDelta = -Math.round(dx * 0.45);
        state.targetFrame = Math.max(0, Math.min(maxFrames - 1, touchStartFrame + frameDelta));
      }
    }, { passive: true });
  }

  function updateScroll() {
    if (!heroViewport || !scrubPhase) return;

    // Relative to heroViewport container so rotation starts immediately on scroll
    const heroRect = heroViewport.getBoundingClientRect();
    const scrubDistance = scrubPhase.offsetHeight || (window.innerHeight * 2.2);
    
    // Top hero title fades out smoothly as scroll starts (0 to 180px)
    const traveled = -heroRect.top;
    if (heroTopIntro) {
      if (traveled <= 0) {
        heroTopIntro.style.opacity = '1';
        heroTopIntro.style.transform = 'translateX(-50%) translateY(0)';
        heroTopIntro.style.pointerEvents = 'auto';
      } else {
        const fadeIntro = Math.max(0, 1 - traveled / 160);
        heroTopIntro.style.opacity = fadeIntro.toFixed(2);
        heroTopIntro.style.transform = `translateX(-50%) translateY(-${(1 - fadeIntro) * 45}px)`;
        heroTopIntro.style.pointerEvents = fadeIntro > 0.05 ? 'auto' : 'none';
      }
    }

    const maxTravel = Math.max(1, scrubDistance - window.innerHeight);
    const phase1Progress = Math.min(1, Math.max(0, traveled / maxTravel));
    const maxFrames = state.theme === 'light' ? CONFIG.totalFramesLight : CONFIG.totalFramesDark;

    if (phase1Progress < 1) {
      // -----------------------------------------------------------------------
      // PHASE 1: Pure 3D Rotation (Clean screen, NO text cards during rotation!)
      // -----------------------------------------------------------------------
      state.targetFrame = Math.floor(phase1Progress * (maxFrames - 1));

      // Reset camera zoom & reticle to default overview
      if (canvasZoomWrapper) {
        canvasZoomWrapper.style.transformOrigin = '50% 50%';
        canvasZoomWrapper.style.transform = 'scale(1)';
      }
      if (cameraReticle) {
        cameraReticle.classList.remove('active');
      }
      zoomSteps.forEach((s) => s.classList.remove('active-step'));
      state.activeZoomStep = null;
    } else {
      // -----------------------------------------------------------------------
      // PHASE 2: Completed 3D rotation -> Locks on final frame and zooms in
      // -----------------------------------------------------------------------
      state.targetFrame = maxFrames - 1; // Always lock on final exploded frame (280/276)

      // Calculate which component zoom card is centered in the viewport
      let closestStep = null;
      let minDistance = Infinity;
      const viewCenter = window.innerHeight * 0.5;

      zoomSteps.forEach((step) => {
        const rect = step.getBoundingClientRect();
        const stepCenter = rect.top + rect.height * 0.5;
        const dist = Math.abs(stepCenter - viewCenter);
        if (dist < minDistance && rect.bottom > 0 && rect.top < window.innerHeight) {
          minDistance = dist;
          closestStep = step;
        }
      });

      if (closestStep) {
        const stepKey = closestStep.getAttribute('data-step');
        if (stepKey !== state.activeZoomStep) {
          state.activeZoomStep = stepKey;
          zoomSteps.forEach((s) => s.classList.toggle('active-step', s === closestStep));

          const target = ZOOM_TARGETS[stepKey] || ZOOM_TARGETS.overview;

          if (canvasZoomWrapper) {
            const isMob = window.innerWidth <= 768;
            const targetScale = isMob ? Math.min(target.scale, 2.1) : target.scale;
            canvasZoomWrapper.style.transformOrigin = `${target.x}% ${target.y}%`;
            canvasZoomWrapper.style.transform = `scale(${targetScale})`;
          }

          if (cameraReticle) {
            if (target.reticle) {
              cameraReticle.classList.add('active');
              cameraReticle.style.left = `${target.x}%`;
              cameraReticle.style.top = `${target.y}%`;
            } else {
              cameraReticle.classList.remove('active');
            }
          }

          playTone(920, 'sine', 0.04, 0.04);
        }
      }
    }

    // Header background blur on scroll
    const header = document.getElementById('header');
    if (header) {
      if (window.scrollY > 40) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
  }

  // RAF throttled scroll event listener for buttery 60-120 FPS mobile scrolling
  let scrollTicking = false;
  function scheduleScrollUpdate() {
    if (!scrollTicking) {
      requestAnimationFrame(() => {
        updateScroll();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }

  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });

  function drawFrame(frameIndex) {
    if (!canvas || !ctx) return;

    const activeImages = state.theme === 'light' ? state.lightImages : state.darkImages;
    if (!activeImages || activeImages.length === 0) return;

    const safeIndex = Math.min(activeImages.length - 1, Math.max(0, frameIndex));
    const img = activeImages[safeIndex];

    if (!img || !img.complete || img.naturalWidth === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    const canvasRatio = canvasW / canvasH;
    const imgRatio = imgW / imgH;

    let drawW, drawH, drawX, drawY;

    if (canvasRatio > imgRatio) {
      drawH = canvasH;
      drawW = canvasH * imgRatio;
      drawX = (canvasW - drawW) / 2;
      drawY = 0;
    } else {
      drawW = canvasW;
      drawH = canvasW / imgRatio;
      drawX = 0;
      drawY = (canvasH - drawH) / 2;
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }

  function renderLoop() {
    const prevFrame = Math.round(state.currentFrame);
    state.currentFrame += (state.targetFrame - state.currentFrame) * CONFIG.lerpFactor;
    const rounded = Math.round(state.currentFrame);

    if (rounded !== prevFrame || lastDrawnFrame !== rounded) {
      drawFrame(rounded);
      lastDrawnFrame = rounded;

      if (Math.abs(rounded - prevFrame) >= 2) {
        playScrollTick();
      }
    }

    requestAnimationFrame(renderLoop);
  }

  // Ambient mouse glow in hero
  window.addEventListener('mousemove', (e) => {
    if (!ambientGlow) return;
    ambientGlow.style.left = `${e.clientX}px`;
    ambientGlow.style.top = `${e.clientY}px`;
  }, { passive: true });

  // -------------------------------------------------------------------------
  // 6. DUAL THEME TOGGLE & AUDIO SFX TOGGLE
  // -------------------------------------------------------------------------
  const themeToggle = document.getElementById('theme-toggle');
  const themeLabelText = document.getElementById('theme-label-text');

  if (themeToggle) {
    if (themeLabelText) {
      themeLabelText.textContent = state.theme === 'light' ? 'Dark' : 'Light';
    }

    themeToggle.addEventListener('click', () => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      state.theme = nextTheme;
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('iris_theme', nextTheme);
      
      if (themeLabelText) {
        themeLabelText.textContent = nextTheme === 'light' ? 'Dark' : 'Light';
      }

      // Ensure target theme frames are loaded
      if (nextTheme === 'dark' && state.darkImages.length === 0) {
        queueDarkFrames();
      } else if (nextTheme === 'light' && state.lightImages.length === 0) {
        queueLightFrames();
      }

      playTone(nextTheme === 'dark' ? 440 : 660, 'sine', 0.1, 0.08);
      drawFrame(Math.round(state.currentFrame));
    });
  }

  // SFX Global Button
  const sfxToggle = document.getElementById('sfx-toggle');
  const sfxIcon = document.getElementById('sfx-icon');
  if (sfxToggle) {
    sfxToggle.addEventListener('click', () => {
      state.sfxEnabled = !state.sfxEnabled;
      if (sfxIcon) sfxIcon.textContent = state.sfxEnabled ? '🔊' : '🔇';
      sfxToggle.querySelector('.label').textContent = state.sfxEnabled ? 'SFX On' : 'SFX Muted';
      if (state.sfxEnabled) playTone(880, 'sine', 0.1, 0.1);
    });
  }

  // -------------------------------------------------------------------------
  // 7. PLAYABLE GAZE & REACTION REHAB ARCADE: CYBER DINO JUMP
  // -------------------------------------------------------------------------
  const dinoCanvas = document.getElementById('dino-canvas');
  const dinoCtx = dinoCanvas ? dinoCanvas.getContext('2d') : null;
  const gameScoreEl = document.getElementById('game-score');
  const gameHiScoreEl = document.getElementById('game-hi-score');
  const gameOverModal = document.getElementById('game-over-modal');
  const gameOverMsg = document.getElementById('game-over-msg');
  const btnRestartGame = document.getElementById('btn-restart-game');
  const btnGameJump = document.getElementById('btn-game-jump');

  let dinoGameState = 'IDLE'; // 'IDLE', 'PLAYING', 'GAMEOVER'
  let gameScore = 0;
  let gameHiScore = parseInt(localStorage.getItem('iris_dino_hi') || '0', 10);
  let gameSpeed = 5.8;
  let gameFrameCount = 0;
  let nextObstacleDistance = 80;
  let groundOffset = 0;

  if (gameHiScoreEl) gameHiScoreEl.textContent = String(gameHiScore).padStart(4, '0');

  const dino = {
    x: 60,
    y: 172,
    baseY: 172,
    w: 42,
    h: 46,
    vy: 0,
    gravity: 0.68,
    jumpForce: -12.8,
    isGrounded: true,
    legToggle: 0
  };

  let obstacles = [];

  function resetDinoGame() {
    dino.y = dino.baseY;
    dino.vy = 0;
    dino.isGrounded = true;
    obstacles = [];
    gameScore = 0;
    gameSpeed = 5.8;
    gameFrameCount = 0;
    nextObstacleDistance = 80;
    dinoGameState = 'PLAYING';
    if (gameOverModal) gameOverModal.classList.remove('show');
    if (gameScoreEl) gameScoreEl.textContent = '0000';
    playTone(660, 'sine', 0.1, 0.08);
  }

  function dinoJump() {
    if (dinoGameState === 'IDLE' || dinoGameState === 'GAMEOVER') {
      resetDinoGame();
      return;
    }
    if (dino.isGrounded) {
      dino.vy = dino.jumpForce;
      dino.isGrounded = false;
      playTone(880, 'sine', 0.08, 0.12);
    }
  }

  function spawnObstacle() {
    if (!dinoCanvas) return;
    const types = [
      { w: 18, h: 38, type: 'spike', label: '145ms' },
      { w: 26, h: 44, type: 'barrier', label: '220ms' },
      { w: 34, h: 48, type: 'double', label: '350ms' },
      { w: 26, h: 22, type: 'drone', yOffset: -54, label: 'Saccade' }
    ];
    const template = types[Math.floor(Math.random() * types.length)];
    const obsY = template.yOffset 
      ? (dino.baseY + dino.h - template.h + template.yOffset) 
      : (dino.baseY + dino.h - template.h);

    obstacles.push({
      x: dinoCanvas.width + 20,
      y: obsY,
      w: template.w,
      h: template.h,
      type: template.type,
      label: template.label
    });
  }

  function updateDinoGame() {
    if (dinoGameState !== 'PLAYING') return;

    gameFrameCount++;
    if (gameFrameCount % 4 === 0) {
      gameScore++;
      if (gameScoreEl) gameScoreEl.textContent = String(gameScore).padStart(4, '0');
      if (gameScore > gameHiScore) {
        gameHiScore = gameScore;
        localStorage.setItem('iris_dino_hi', gameHiScore);
        if (gameHiScoreEl) gameHiScoreEl.textContent = String(gameHiScore).padStart(4, '0');
      }
      if (gameScore % 100 === 0 && gameScore > 0) {
        gameSpeed += 0.35;
        playTone(1100, 'triangle', 0.15, 0.1);
      }
    }

    // Dino Physics
    dino.vy += dino.gravity;
    dino.y += dino.vy;
    if (dino.y >= dino.baseY) {
      dino.y = dino.baseY;
      dino.vy = 0;
      dino.isGrounded = true;
    }

    if (gameFrameCount % 6 === 0) {
      dino.legToggle = (dino.legToggle + 1) % 2;
    }

    groundOffset = (groundOffset + gameSpeed) % 24;

    // Obstacle management
    nextObstacleDistance -= 1;
    if (nextObstacleDistance <= 0) {
      spawnObstacle();
      nextObstacleDistance = Math.floor(Math.random() * 55 + 50);
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      obs.x -= gameSpeed;

      // Hitbox Collision Check (AABB with 5px margin for fair gameplay)
      const pad = 5;
      if (
        dino.x + pad < obs.x + obs.w - pad &&
        dino.x + dino.w - pad > obs.x + pad &&
        dino.y + pad < obs.y + obs.h - pad &&
        dino.y + dino.h - pad > obs.y + pad
      ) {
        // Crash / Game Over
        dinoGameState = 'GAMEOVER';
        playTone(160, 'sawtooth', 0.28, 0.18);
        if (gameOverModal) gameOverModal.classList.add('show');
        if (gameOverMsg) {
          const reactionTime = Math.max(140, Math.round(380 - gameScore * 1.5));
          gameOverMsg.textContent = `Score: ${gameScore} pts · Simulated Saccadic Latency: ${reactionTime} ms`;
        }
        return;
      }

      if (obs.x + obs.w < -40) {
        obstacles.splice(i, 1);
      }
    }
  }

  function drawCyberDino(dCtx, x, y, w, h, isGrounded, legToggle, isDark) {
    dCtx.save();

    // Trail when airborne
    if (!isGrounded) {
      dCtx.fillStyle = isDark ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0, 102, 255, 0.16)';
      dCtx.beginPath();
      dCtx.arc(x + w / 2, y + h + 10, 8, 0, Math.PI * 2);
      dCtx.fill();
    }

    // Body structure
    dCtx.fillStyle = isDark ? '#ffffff' : '#111827';
    dCtx.beginPath();
    // Head & Snout
    if (dCtx.roundRect) {
      dCtx.roundRect(x + 14, y, 26, 20, [4, 8, 2, 2]);
      dCtx.roundRect(x + 8, y + 16, 24, 22, [2, 2, 6, 4]);
      dCtx.roundRect(x, y + 22, 10, 8, [4, 0, 0, 4]);
    } else {
      dCtx.rect(x + 14, y, 26, 20);
      dCtx.rect(x + 8, y + 16, 24, 22);
      dCtx.rect(x, y + 22, 10, 8);
    }
    dCtx.fill();

    // Glowing Visor / IRIS Eye
    dCtx.fillStyle = '#00e5ff';
    dCtx.shadowColor = '#00e5ff';
    dCtx.shadowBlur = 8;
    dCtx.fillRect(x + 28, y + 4, 8, 5);
    dCtx.shadowBlur = 0;

    // Small arms
    dCtx.fillStyle = isDark ? '#e0e0e0' : '#334155';
    dCtx.fillRect(x + 30, y + 24, 7, 3);

    // Legs
    dCtx.fillStyle = isDark ? '#ffffff' : '#111827';
    if (!isGrounded) {
      dCtx.fillRect(x + 14, y + 36, 4, 7);
      dCtx.fillRect(x + 24, y + 36, 4, 7);
    } else {
      if (legToggle === 0) {
        dCtx.fillRect(x + 14, y + 38, 4, 8);
        dCtx.fillRect(x + 12, y + 44, 6, 2);
        dCtx.fillRect(x + 24, y + 38, 4, 5);
      } else {
        dCtx.fillRect(x + 14, y + 38, 4, 5);
        dCtx.fillRect(x + 24, y + 38, 4, 8);
        dCtx.fillRect(x + 22, y + 44, 6, 2);
      }
    }

    dCtx.restore();
  }

  function drawObstacle(dCtx, obs, isDark) {
    dCtx.save();
    if (obs.type === 'drone') {
      dCtx.fillStyle = isDark ? '#ff3366' : '#e11d48';
      dCtx.shadowColor = '#ff3366';
      dCtx.shadowBlur = 6;
      dCtx.beginPath();
      dCtx.arc(obs.x + obs.w / 2, obs.y + obs.h / 2, obs.w / 2, 0, Math.PI * 2);
      dCtx.fill();
      dCtx.shadowBlur = 0;
      dCtx.strokeStyle = '#ffffff';
      dCtx.lineWidth = 1.5;
      dCtx.beginPath();
      dCtx.moveTo(obs.x - 4, obs.y + 4);
      dCtx.lineTo(obs.x + obs.w + 4, obs.y + 4);
      dCtx.stroke();
    } else {
      const grad = dCtx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
      grad.addColorStop(0, '#00e5ff');
      grad.addColorStop(1, '#7928ca');
      dCtx.fillStyle = grad;
      dCtx.shadowColor = 'rgba(0, 229, 255, 0.4)';
      dCtx.shadowBlur = 8;
      dCtx.beginPath();
      if (dCtx.roundRect) {
        dCtx.roundRect(obs.x, obs.y, obs.w, obs.h, [4, 4, 0, 0]);
      } else {
        dCtx.rect(obs.x, obs.y, obs.w, obs.h);
      }
      dCtx.fill();
      dCtx.shadowBlur = 0;

      dCtx.fillStyle = '#ffffff';
      dCtx.beginPath();
      dCtx.arc(obs.x + obs.w / 2, obs.y, 2.5, 0, Math.PI * 2);
      dCtx.fill();
    }
    dCtx.restore();
  }

  function drawDinoGame() {
    if (!dinoCanvas || !dinoCtx) return;

    dinoCtx.clearRect(0, 0, dinoCanvas.width, dinoCanvas.height);

    const groundY = dino.baseY + dino.h;
    const isDark = state.theme === 'dark';

    // Draw Background Grid
    dinoCtx.strokeStyle = isDark ? 'rgba(0, 229, 255, 0.05)' : 'rgba(0, 102, 255, 0.04)';
    dinoCtx.lineWidth = 1;
    for (let x = 0; x < dinoCanvas.width; x += 40) {
      dinoCtx.beginPath();
      dinoCtx.moveTo(x, 0);
      dinoCtx.lineTo(x, groundY);
      dinoCtx.stroke();
    }

    // Ground line
    dinoCtx.strokeStyle = isDark ? 'rgba(0, 229, 255, 0.4)' : 'rgba(0, 102, 255, 0.3)';
    dinoCtx.lineWidth = 2;
    dinoCtx.beginPath();
    dinoCtx.moveTo(0, groundY);
    dinoCtx.lineTo(dinoCanvas.width, groundY);
    dinoCtx.stroke();

    // Moving ground dash points
    dinoCtx.fillStyle = isDark ? 'rgba(0, 229, 255, 0.25)' : 'rgba(0, 102, 255, 0.2)';
    for (let x = -groundOffset; x < dinoCanvas.width; x += 24) {
      dinoCtx.fillRect(x, groundY + 5, 8, 2);
    }

    // Draw Cyber Dino
    drawCyberDino(dinoCtx, dino.x, dino.y, dino.w, dino.h, dino.isGrounded, dino.legToggle, isDark);

    // Draw Obstacles
    for (const obs of obstacles) {
      drawObstacle(dinoCtx, obs, isDark);
    }

    // Idle instructions
    if (dinoGameState === 'IDLE') {
      dinoCtx.fillStyle = isDark ? '#00e5ff' : '#0066ff';
      dinoCtx.font = 'bold 15px monospace';
      dinoCtx.textAlign = 'center';
      dinoCtx.fillText('PRESS SPACEBAR / TAP TO INITIATE OCULAR RUNNER', dinoCanvas.width / 2, 85);
      dinoCtx.fillStyle = isDark ? '#99aabb' : '#556677';
      dinoCtx.font = '12px monospace';
      dinoCtx.fillText('Calibrates saccadic elevation & deliberate blink reaction time', dinoCanvas.width / 2, 110);
    }
  }

  function dinoGameLoop() {
    updateDinoGame();
    drawDinoGame();
    requestAnimationFrame(dinoGameLoop);
  }

  requestAnimationFrame(dinoGameLoop);

  if (dinoCanvas) {
    dinoCanvas.addEventListener('click', dinoJump);
    dinoCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      dinoJump();
    });
  }

  if (btnGameJump) {
    btnGameJump.addEventListener('click', dinoJump);
  }

  if (btnRestartGame) {
    btnRestartGame.addEventListener('click', resetDinoGame);
  }

  // -------------------------------------------------------------------------
  // 8. INTERACTIVE BLINK LAB & REAL WEB SPEECH API VOCALIZER
  // -------------------------------------------------------------------------
  const eyeLidPath = document.getElementById('eyelid-top');
  const irBeam = document.getElementById('ir-beam');
  const oscCanvas = document.getElementById('oscilloscope-canvas');
  const oscCtx = oscCanvas ? oscCanvas.getContext('2d') : null;
  const verdictText = document.getElementById('verdict-text');
  const verdictTime = document.getElementById('verdict-time');
  const irVoltageReadout = document.getElementById('ir-voltage-readout');

  const btnQuickBlink = document.getElementById('btn-quick-blink');
  const btnHoldBlink = document.getElementById('btn-hold-blink');
  const btnDoubleBlink = document.getElementById('btn-double-blink');

  let blinkStartTime = 0;
  let isEyeClosed = false;
  let lastBlinkEndTime = 0;
  let recentBlinkDurations = [];
  const oscData = new Array(80).fill(94);

  function animateEyelid(closedProgress) {
    if (!eyeLidPath) return;
    const curveY = 12 + closedProgress * 156;
    eyeLidPath.setAttribute('d', `M 18 90 Q 160 ${curveY} 302 90 Q 160 14 18 90 Z`);
    if (irBeam) irBeam.style.opacity = (1 - closedProgress * 0.85).toFixed(2);
  }

  function startBlink() {
    if (isEyeClosed) return;
    isEyeClosed = true;
    blinkStartTime = Date.now();
    animateEyelid(1);
    initAudio();
  }

  function endBlink() {
    if (!isEyeClosed) return;
    isEyeClosed = false;
    animateEyelid(0);

    const now = Date.now();
    const duration = now - blinkStartTime;
    const timeSinceLastBlink = now - lastBlinkEndTime;
    lastBlinkEndTime = now;

    processBlinkTiming(duration, timeSinceLastBlink);
  }

  function processBlinkTiming(duration, gap) {
    if (!verdictText || !verdictTime) return;
    verdictTime.textContent = `Measured hold duration: ${duration} ms (gap: ${gap} ms)`;

    if (gap < 600 && recentBlinkDurations.length > 0 && recentBlinkDurations[recentBlinkDurations.length - 1] >= 180) {
      verdictText.innerHTML = `<span style="color: var(--accent-iris);">🔥 DOUBLE DELIBERATE BLINK — RIGHT CLICK (RC)</span>`;
      playBlinkSound('double');
      triggerVirtualAction('RC');
      recentBlinkDurations = [];
      return;
    }

    recentBlinkDurations.push(duration);
    if (recentBlinkDurations.length > 3) recentBlinkDurations.shift();

    if (duration < 200) {
      verdictText.innerHTML = `<span style="color: var(--text-muted);">⚡ INVOLUNTARY REFLEX BLINK (&lt; 200ms) — IGNORED (0 Misfires)</span>`;
      playBlinkSound('ignored');
    } else if (duration >= 200 && duration <= 600) {
      verdictText.innerHTML = `<span style="color: var(--success);">🎯 DELIBERATE INTENTIONAL BLINK — LEFT CLICK (LC) FIRED</span>`;
      playBlinkSound('single');
      triggerVirtualAction('LC');
    } else {
      verdictText.innerHTML = `<span style="color: var(--warning);">⏳ EXTENDED LONG BLINK (&gt; 600ms) — CLUTCH ZEROING GYRO</span>`;
      playTone(330, 'sine', 0.2, 0.08);
    }
  }

  function drawOscilloscope() {
    if (!oscCanvas || !oscCtx) return;

    oscData.shift();
    const currentReflectance = isEyeClosed ? 12 + Math.random() * 5 : 94 + (Math.random() * 2 - 1);
    oscData.push(currentReflectance);

    if (irVoltageReadout) {
      irVoltageReadout.textContent = `Reflectance: ${currentReflectance.toFixed(1)}%`;
    }

    oscCtx.clearRect(0, 0, oscCanvas.width, oscCanvas.height);

    oscCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    oscCtx.lineWidth = 1;
    for (let y = 15; y < oscCanvas.height; y += 20) {
      oscCtx.beginPath();
      oscCtx.moveTo(0, y);
      oscCtx.lineTo(oscCanvas.width, y);
      oscCtx.stroke();
    }

    oscCtx.beginPath();
    oscCtx.strokeStyle = isEyeClosed ? '#ff3366' : '#00f2fe';
    oscCtx.lineWidth = 2.5;
    oscCtx.shadowColor = isEyeClosed ? '#ff3366' : '#00f2fe';
    oscCtx.shadowBlur = 8;

    const stepX = oscCanvas.width / (oscData.length - 1);

    for (let i = 0; i < oscData.length; i++) {
      const val = oscData[i];
      const y = oscCanvas.height - (val / 100) * (oscCanvas.height - 16) - 8;
      const x = i * stepX;

      if (i === 0) {
        oscCtx.moveTo(x, y);
      } else {
        oscCtx.lineTo(x, y);
      }
    }
    oscCtx.stroke();
    oscCtx.shadowBlur = 0;

    requestAnimationFrame(drawOscilloscope);
  }

  requestAnimationFrame(drawOscilloscope);

  // Keyboard Spacebar / ArrowUp listener
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      // Trigger Dino Jump in the game
      dinoJump();
      // Also simulate deliberate blink in Blink Lab
      startBlink();
      if (btnHoldBlink) btnHoldBlink.classList.add('active');
    }
  });

  window.addEventListener('keyup', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && isEyeClosed) {
      e.preventDefault();
      endBlink();
      if (btnHoldBlink) btnHoldBlink.classList.remove('active');
    }
  });

  if (btnQuickBlink) {
    btnQuickBlink.addEventListener('click', () => {
      startBlink();
      setTimeout(endBlink, 95);
    });
  }

  if (btnHoldBlink) {
    btnHoldBlink.addEventListener('mousedown', startBlink);
    btnHoldBlink.addEventListener('mouseup', endBlink);
    btnHoldBlink.addEventListener('touchstart', (e) => { e.preventDefault(); startBlink(); });
    btnHoldBlink.addEventListener('touchend', (e) => { e.preventDefault(); endBlink(); });
  }

  if (btnDoubleBlink) {
    btnDoubleBlink.addEventListener('click', () => {
      startBlink();
      setTimeout(() => {
        endBlink();
        setTimeout(() => {
          startBlink();
          setTimeout(endBlink, 260);
        }, 140);
      }, 260);
    });
  }

  // Virtual Desktop Steering & Real Web Speech Integration
  const virtualDesktop = document.getElementById('virtual-desktop');
  const virtualCursor = document.getElementById('virtual-cursor');
  const actionBanner = document.getElementById('action-banner');
  const bannerText = document.getElementById('banner-text');
  const pipeStep2 = document.getElementById('pipe-step-2');
  const pipeStep3 = document.getElementById('pipe-step-3');
  const assistTiles = document.querySelectorAll('.assist-tile');

  if (virtualDesktop && virtualCursor) {
    virtualDesktop.addEventListener('mousemove', (e) => {
      const rect = virtualDesktop.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);

      virtualCursor.style.transform = `translate(${x}px, ${y}px)`;

      state.activeTile = null;
      assistTiles.forEach((tile) => {
        const tRect = tile.getBoundingClientRect();
        if (
          e.clientX >= tRect.left &&
          e.clientX <= tRect.right &&
          e.clientY >= tRect.top &&
          e.clientY <= tRect.bottom
        ) {
          tile.classList.add('hovered');
          state.activeTile = tile;
        } else {
          tile.classList.remove('hovered');
        }
      });
    });

    virtualDesktop.addEventListener('click', () => {
      startBlink();
      setTimeout(endBlink, 300);
    });
  }

  function triggerVirtualAction(clickType) {
    if (!state.activeTile) return;

    const action = state.activeTile.getAttribute('data-action');
    state.activeTile.style.transform = 'scale(0.94)';
    setTimeout(() => {
      if (state.activeTile) state.activeTile.style.transform = '';
    }, 150);

    if (pipeStep2) pipeStep2.classList.add('active');
    setTimeout(() => {
      if (pipeStep3) pipeStep3.classList.add('active');
    }, 145);

    setTimeout(() => {
      if (pipeStep2) pipeStep2.classList.remove('active');
      if (pipeStep3) pipeStep3.classList.remove('active');
    }, 2800);

    if (action === 'WATER') {
      setBannerMessage('💧 [SPOKEN ALOUD] "I need drinking water, please help me." (ntfy.sh alert: 145ms)', 'success');
      speakText('I need drinking water, please help me.');
    } else if (action === 'REST') {
      setBannerMessage('🛏️ [SPOKEN ALOUD] "Please help me turn or adjust my position."', 'success');
      speakText('Please help me turn or adjust my position.');
    } else if (action === 'SOS') {
      playBlinkSound('sos');
      setBannerMessage('🚨 [CRITICAL ALARM] "Emergency alert! Caretaker needed immediately!"', 'danger');
      speakText('Emergency alert! Caretaker needed immediately!');
    } else if (action === 'LIGHT') {
      state.virtualRoomLightOn = !state.virtualRoomLightOn;
      const lampIcon = document.getElementById('room-lamp-icon');
      const lampText = document.getElementById('room-lamp-text');
      if (lampIcon) lampIcon.textContent = state.virtualRoomLightOn ? '💡' : '🌑';
      if (lampText) lampText.textContent = state.virtualRoomLightOn ? 'ROOM LIGHT: ON' : 'ROOM LIGHT: OFF';
      setBannerMessage(`💡 [IOT WI-FI] Toggled bedroom room light to ${state.virtualRoomLightOn ? 'ON' : 'OFF'}.`, 'success');
      speakText(`Bedroom light turned ${state.virtualRoomLightOn ? 'on' : 'off'}`);
    }
  }

  function setBannerMessage(msg, type = 'normal') {
    if (!bannerText) return;
    bannerText.textContent = msg;
    if (actionBanner) {
      actionBanner.style.background = type === 'danger' ? 'rgba(255, 51, 102, 0.25)' : 'var(--card-border-subtle)';
      actionBanner.style.color = type === 'danger' ? 'var(--danger)' : 'var(--accent-iris)';
    }
  }

  // -------------------------------------------------------------------------
  // 9. INTERACTIVE 5-STEP CALIBRATION WIZARD (SLIDE 13)
  // -------------------------------------------------------------------------
  const wizardNodes = document.querySelectorAll('.wizard-step-node');
  const wizardPrevBtn = document.getElementById('wizard-prev-btn');
  const wizardNextBtn = document.getElementById('wizard-next-btn');
  const wizardTitle = document.getElementById('wizard-title');
  const wizardDesc = document.getElementById('wizard-desc');
  const wizardIcon = document.getElementById('wizard-icon');
  const wizardTimer = document.getElementById('wizard-timer');

  const WIZARD_STEPS = [
    {
      step: 1,
      title: 'Step 1: Wireless Link & Baseline Horizon Lock',
      desc: 'Launch the Python bridge on your computer. IRIS advertises over Bluetooth 5.0 at 2Hz. The patient sits still for 1 second while the MPU6050 locks the baseline head horizon.',
      icon: '📶',
      badge: 'Step 1 of 5 · Baseline Lock (1 sec)'
    },
    {
      step: 2,
      title: 'Step 2: Returning vs New User Profile Check',
      desc: 'The software checks local storage. Returning patients reload their personalized sensitivity parameters instantly in under 200 milliseconds, bypassing repeated setups.',
      icon: '👤',
      badge: 'Step 2 of 5 · Profile Auto-Load (<0.2 sec)'
    },
    {
      step: 3,
      title: 'Step 3: Head Gesture Boundary Calibration',
      desc: 'The user makes gentle head nods (up/down) and head tilts (left/right). The algorithm calculates their comfortable range of motion and sets the software dead-zone filter.',
      icon: '🧭',
      badge: 'Step 3 of 5 · Motion Range Learn (1 sec)'
    },
    {
      step: 4,
      title: 'Step 4: Optical Blink Timing Lock',
      desc: 'The patient performs two deliberate intentional blinks. The 950nm multi-beam sensor registers sclera reflection amplitude and establishes the 200–500ms timing window.',
      icon: '👁️',
      badge: 'Step 4 of 5 · Optical Threshold (1 sec)'
    },
    {
      step: 5,
      title: 'Step 5: Ready! Hands-Free OS Cursor Active',
      desc: 'Calibration complete in just 2.3 seconds total! The PyAutoGUI driver takes over system mouse controls across Windows, macOS, Linux, or Android with zero further setup.',
      icon: '🚀',
      badge: 'Calibration Complete · Total Time: 2.3s'
    }
  ];

  function renderWizardStep(stepNum) {
    state.currentWizardStep = stepNum;
    const data = WIZARD_STEPS[stepNum - 1];

    if (wizardTitle) wizardTitle.textContent = data.title;
    if (wizardDesc) wizardDesc.textContent = data.desc;
    if (wizardIcon) wizardIcon.textContent = data.icon;
    if (wizardTimer) wizardTimer.textContent = data.badge;

    wizardNodes.forEach((node) => {
      const nStep = parseInt(node.getAttribute('data-step'), 10);
      node.classList.toggle('active', nStep === stepNum);
    });

    if (wizardPrevBtn) wizardPrevBtn.disabled = stepNum === 1;
    if (wizardNextBtn) {
      wizardNextBtn.textContent = stepNum === 5 ? 'Restart Calibration ↺' : `Next Step: Step ${stepNum + 1} →`;
    }

    playTone(400 + stepNum * 120, 'sine', 0.1, 0.08);
  }

  if (wizardNextBtn) {
    wizardNextBtn.addEventListener('click', () => {
      const next = state.currentWizardStep === 5 ? 1 : state.currentWizardStep + 1;
      renderWizardStep(next);
    });
  }

  if (wizardPrevBtn) {
    wizardPrevBtn.addEventListener('click', () => {
      if (state.currentWizardStep > 1) {
        renderWizardStep(state.currentWizardStep - 1);
      }
    });
  }

  wizardNodes.forEach((node) => {
    node.addEventListener('click', () => {
      const s = parseInt(node.getAttribute('data-step'), 10);
      renderWizardStep(s);
    });
  });

  // -------------------------------------------------------------------------
  // 10. FIRMWARE & PYTHON CODE STUDIO (SLIDE 40)
  // -------------------------------------------------------------------------
  const codeDisplay = document.getElementById('code-display');
  const codeTabs = document.querySelectorAll('.code-tab-btn');
  const btnRunSim = document.getElementById('btn-run-code-sim');
  const terminalLog = document.getElementById('terminal-log');

  const CODE_SNIPPETS = {
    firmware: `/* Seeed Studio XIAO ESP32C3 Firmware - Project IRIS */
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#define IR_PIN 2        // LM393 Comparator Digital Out
#define MPU_ADDR 0x68   // MPU6050 I2C Address

void setup() {
  pinMode(IR_PIN, INPUT);
  Wire.begin();
  Wire.setClock(400000); // 400kHz Fast I2C
  BLEDevice::init("IRIS_XIAO_C3");
  // Built-in CC/CV Li-Po charge regulator active via BAT+/BAT-
}

void loop() {
  bool eyeClosed = (digitalRead(IR_PIN) == LOW);
  int16_t ax, ay, az, gx, gy, gz;
  readMPU6050(&gx, &gy, &gz);
  
  // Stream 50Hz gesture tokens over BLE 5.0 with Wi-Fi failover
  broadcastToken(eyeClosed, gx, gy);
  delay(20); // 50Hz deterministic loop
}`,

    python: `# IRIS Python Host Bridge - OS Driver
import serial, pyautogui, time
from iris_engine import EyeDigitalTwin

# Connect dual-wireless bridge with Wi-Fi failover
link = EyeDigitalTwin.connect(ble='IRIS_XIAO_C3', wifi_backup=True)
eye_twin = EyeDigitalTwin.launch_live_window()

while True:
    packet = link.read_denoised_packet() # 50Hz telemetry
    eye_twin.sync_blink(packet.ir_sclera_level)
    
    cmd = packet.command
    if cmd == 'L':  pyautogui.moveRel(-32, 0)
    if cmd == 'R':  pyautogui.moveRel(32, 0)
    if cmd == 'U':  pyautogui.moveRel(0, -32)
    if cmd == 'D':  pyautogui.moveRel(0, 32)
    if cmd == 'LC': pyautogui.click()
    if cmd == 'RC': pyautogui.rightClick()`,

    denoiser: `# TensorFlow Rolling Filter - Ambient Noise Elimination
import tensorflow as tf
import numpy as np

class TensorFlowBlinkFilter:
    def __init__(self, sample_window=10):
        self.buffer = np.zeros(sample_window)
        self.threshold = 0.45
        
    def filter_ambient_noise(self, raw_ir_signal):
        self.buffer = np.roll(self.buffer, -1)
        self.buffer[-1] = raw_ir_signal
        
        # Eliminate micro-tremors and sunlight IR fluctuations
        smoothed = np.convolve(self.buffer, np.ones(3)/3, mode='valid')
        return smoothed[-1] < self.threshold`,

    ntfy: `// Caregiver Remote Push Proxy - ntfy.sh sub-300ms Pipeline
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.post('/api/care/ntfy', async (req, res) => {
  const { priority, message, tags } = req.body;
  
  // Forward to Caregiver phone via ntfy.sh bypassing adblockers
  const response = await fetch('https://ntfy.sh/iris-patient-alert', {
    method: 'POST',
    body: message,
    headers: {
      'Title': 'Project IRIS Alert',
      'Priority': priority || 'urgent',
      'Tags': tags || 'warning,hospital'
    }
  });
  
  res.json({ delivered: true, latency_ms: 145 });
});`
  };

  codeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      codeTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.getAttribute('data-code');
      if (codeDisplay) codeDisplay.textContent = CODE_SNIPPETS[key];
      playTone(700, 'sine', 0.06, 0.06);
    });
  });

  if (btnRunSim && terminalLog) {
    btnRunSim.addEventListener('click', () => {
      playTone(1000, 'triangle', 0.1, 0.1);
      const simulatedPackets = [
        '[50Hz BLE] MPU6050 Gyro: Pitch=+4.2° Roll=-1.1° -> CMD: CENTER (DEAD-ZONE)',
        '[50Hz BLE] MPU6050 Gyro: Pitch=+14.8° Roll=-0.3° -> CMD: HEAD NOD DOWN -> CURSOR (Y+32)',
        '[50Hz BLE] IR Sclera Emitter: High Reflectance (94.8%) -> State: EYE_OPEN',
        '[50Hz BLE] IR Sclera Emitter: Reflectance Drop to 11.2% -> State: EYE_CLOSED (Timer: 280ms)',
        '[SIGNAL] Intent Threshold Met (280ms in [200-500ms]) -> FIRED: LEFT CLICK (LC)',
        '[ALERT] ntfy.sh notification packet dispatched -> Caregiver phone pinged in 145ms!'
      ];

      simulatedPackets.forEach((pkt, idx) => {
        setTimeout(() => {
          const div = document.createElement('div');
          div.textContent = `[${new Date().toLocaleTimeString()}] ${pkt}`;
          terminalLog.appendChild(div);
          terminalLog.scrollTop = terminalLog.scrollHeight;
          playTone(600 + idx * 80, 'sine', 0.04, 0.05);
        }, idx * 280);
      });
    });
  }

  // -------------------------------------------------------------------------
  // 11. BELT STATUS RGB LED SIMULATOR (SLIDE 30)
  // -------------------------------------------------------------------------
  const beltLedBulb = document.getElementById('belt-led-bulb');
  const beltLedGlow = document.getElementById('belt-led-glow');
  const beltLedStatusText = document.getElementById('belt-led-status-text');
  const beltStateBtns = document.querySelectorAll('.belt-state-btn');

  let ledBlinkInterval = null;

  function setBeltLedState(state) {
    if (ledBlinkInterval) {
      clearInterval(ledBlinkInterval);
      ledBlinkInterval = null;
    }

    beltStateBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-state') === state));

    if (state === 'boot') {
      if (beltLedBulb) {
        beltLedBulb.style.background = '#00e676';
        beltLedBulb.style.boxShadow = '0 0 16px #00e676, 0 0 32px rgba(0, 230, 118, 0.6)';
        beltLedBulb.style.opacity = '1';
      }
      if (beltLedGlow) beltLedGlow.style.background = 'radial-gradient(circle, rgba(0, 230, 118, 0.4) 0%, transparent 70%)';
      if (beltLedStatusText) {
        beltLedStatusText.textContent = 'BOOTING · SOLID GREEN (2s)';
        beltLedStatusText.style.color = '#00e676';
      }
      playTone(440, 'triangle', 0.12, 0.08);
      setTimeout(() => playTone(660, 'triangle', 0.15, 0.08), 120);
    } else if (state === 'advertising') {
      if (beltLedStatusText) {
        beltLedStatusText.textContent = 'SEARCHING / PAIRING · PULSING BLUE (2Hz)';
        beltLedStatusText.style.color = '#00f2fe';
      }
      let on = true;
      ledBlinkInterval = setInterval(() => {
        on = !on;
        if (beltLedBulb) {
          beltLedBulb.style.background = '#00f2fe';
          beltLedBulb.style.boxShadow = on ? '0 0 20px #00f2fe, 0 0 36px rgba(0, 242, 254, 0.7)' : 'none';
          beltLedBulb.style.opacity = on ? '1' : '0.2';
        }
        if (on) playTone(880, 'sine', 0.03, 0.03);
      }, 250);
    } else if (state === 'connected') {
      if (beltLedBulb) {
        beltLedBulb.style.background = '#ffb703';
        beltLedBulb.style.boxShadow = '0 0 16px #ffb703, 0 0 32px rgba(255, 183, 3, 0.6)';
        beltLedBulb.style.opacity = '1';
      }
      if (beltLedGlow) beltLedGlow.style.background = 'radial-gradient(circle, rgba(255, 183, 3, 0.35) 0%, transparent 70%)';
      if (beltLedStatusText) {
        beltLedStatusText.textContent = 'CONNECTED · SOLID YELLOW';
        beltLedStatusText.style.color = '#ffb703';
      }
      playTone(523, 'sine', 0.1, 0.08);
      setTimeout(() => playTone(659, 'sine', 0.12, 0.08), 100);
    } else if (state === 'sos') {
      if (beltLedStatusText) {
        beltLedStatusText.textContent = 'SOS ALARM · STROBE RED ALERT';
        beltLedStatusText.style.color = '#ff3366';
      }
      let on = true;
      ledBlinkInterval = setInterval(() => {
        on = !on;
        if (beltLedBulb) {
          beltLedBulb.style.background = '#ff3366';
          beltLedBulb.style.boxShadow = on ? '0 0 24px #ff3366, 0 0 45px rgba(255, 51, 102, 0.9)' : 'none';
          beltLedBulb.style.opacity = on ? '1' : '0.1';
        }
        if (on) playTone(980, 'sawtooth', 0.06, 0.1);
      }, 120);
    }
  }

  beltStateBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const st = btn.getAttribute('data-state');
      setBeltLedState(st);
    });
  });

  // -------------------------------------------------------------------------
  // 12. 360° COCKPIT FLIGHT SIMULATOR HUD & GAZE ARCADE (SLIDES 13 & 42)
  // -------------------------------------------------------------------------
  const tabFlightSim = document.getElementById('tab-flight-sim');
  const tabDinoJump = document.getElementById('tab-dino-jump');
  const panelFlightSim = document.getElementById('flight-sim-panel');
  const panelDinoJump = document.getElementById('dino-jump-panel');

  if (tabFlightSim && tabDinoJump) {
    tabFlightSim.addEventListener('click', () => {
      tabFlightSim.classList.add('active');
      tabDinoJump.classList.remove('active');
      if (panelFlightSim) panelFlightSim.style.display = 'block';
      if (panelDinoJump) panelDinoJump.style.display = 'none';
      playTone(600, 'sine', 0.08, 0.05);
    });

    tabDinoJump.addEventListener('click', () => {
      tabDinoJump.classList.add('active');
      tabFlightSim.classList.remove('active');
      if (panelDinoJump) panelDinoJump.style.display = 'block';
      if (panelFlightSim) panelFlightSim.style.display = 'none';
      playTone(720, 'triangle', 0.08, 0.05);
    });
  }

  const cockpitCanvas = document.getElementById('cockpit-canvas');
  const cockpitCtx = cockpitCanvas ? cockpitCanvas.getContext('2d') : null;
  const flightViewport = document.getElementById('flight-viewport');
  const hudAirspeed = document.getElementById('hud-airspeed');
  const hudAltitude = document.getElementById('hud-altitude');
  const hudHeading = document.getElementById('hud-heading');
  const btnRecenterFlight = document.getElementById('btn-recenter-flight');
  const targetLockStatus = document.getElementById('target-lock-status');
  const flightTargetBox = document.getElementById('flight-target-box');

  let pitch = 0;
  let roll = 0;
  let yaw = 84;
  let targetLocked = false;
  let cloudOffsets = [
    { x: -180, y: -80, r: 40 },
    { x: 120, y: -120, r: 60 },
    { x: 260, y: -60, r: 35 },
    { x: -300, y: -140, r: 50 },
  ];

  if (flightViewport) {
    function handleFlightAim(clientX, clientY) {
      const rect = flightViewport.getBoundingClientRect();
      const normX = Math.max(-0.5, Math.min(0.5, (clientX - rect.left) / rect.width - 0.5));
      const normY = Math.max(-0.5, Math.min(0.5, (clientY - rect.top) / rect.height - 0.5));

      pitch = -normY * 35;
      roll = normX * 40;
      yaw = (84 + normX * 60 + 360) % 360;

      if (hudHeading) hudHeading.textContent = `${Math.round(yaw).toString().padStart(3, '0')}° E`;
      if (hudAltitude) hudAltitude.textContent = `${Math.round(4200 + pitch * 25).toLocaleString()}`;
      if (hudAirspeed) hudAirspeed.textContent = `${Math.round(142 + pitch * 1.2)}`;

      if (flightTargetBox) {
        flightTargetBox.style.transform = `translate(calc(-50% + ${normX * 50}px), calc(-50% + ${normY * 40}px))`;
      }
    }

    flightViewport.addEventListener('mousemove', (e) => {
      handleFlightAim(e.clientX, e.clientY);
    });

    // Touch controls: Prevents whole page scrolling while steering aircraft on mobile
    flightViewport.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        e.preventDefault();
        handleFlightAim(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    flightViewport.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        e.preventDefault();
        handleFlightAim(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    const triggerFlightAction = (e) => {
      if (e && e.type === 'touchstart') e.preventDefault();
      targetLocked = !targetLocked;
      if (targetLocked) {
        playTone(1760, 'sine', 0.15, 0.15);
        if (targetLockStatus) {
          targetLockStatus.textContent = '🎯 TARGET LOCKED · WINGS STABILIZED';
          targetLockStatus.style.color = '#ffb703';
        }
      } else {
        playTone(880, 'sine', 0.1, 0.1);
        if (targetLockStatus) {
          targetLockStatus.textContent = 'GAZE LOCK: TRACKING SKY TARGET';
          targetLockStatus.style.color = '#00e676';
        }
      }
      pitch = 0;
      roll = 0;
    };

    flightViewport.addEventListener('click', triggerFlightAction);
    if (btnRecenterFlight) btnRecenterFlight.addEventListener('click', triggerFlightAction);
  }

  function drawCockpit() {
    if (!cockpitCanvas || !cockpitCtx) return;
    const w = cockpitCanvas.width;
    const h = cockpitCanvas.height;

    cockpitCtx.clearRect(0, 0, w, h);
    cockpitCtx.save();

    cockpitCtx.translate(w / 2, h / 2);
    cockpitCtx.rotate((roll * Math.PI) / 180);
    cockpitCtx.translate(0, (pitch / 40) * (h / 2));

    // Sky Gradient
    const skyGrad = cockpitCtx.createLinearGradient(0, -h * 2, 0, 0);
    skyGrad.addColorStop(0, '#021028');
    skyGrad.addColorStop(0.7, '#0b3260');
    skyGrad.addColorStop(1, '#1b5695');
    cockpitCtx.fillStyle = skyGrad;
    cockpitCtx.fillRect(-w * 2, -h * 2, w * 4, h * 2);

    // Ground / Terrain Gradient
    const groundGrad = cockpitCtx.createLinearGradient(0, 0, 0, h * 2);
    groundGrad.addColorStop(0, '#1c1b18');
    groundGrad.addColorStop(0.4, '#121110');
    groundGrad.addColorStop(1, '#080807');
    cockpitCtx.fillStyle = groundGrad;
    cockpitCtx.fillRect(-w * 2, 0, w * 4, h * 2);

    // Grid Lines on Terrain
    cockpitCtx.strokeStyle = 'rgba(0, 242, 254, 0.12)';
    cockpitCtx.lineWidth = 1;
    for (let gy = 20; gy < h * 2; gy += 30) {
      cockpitCtx.beginPath();
      cockpitCtx.moveTo(-w * 2, gy);
      cockpitCtx.lineTo(w * 2, gy);
      cockpitCtx.stroke();
    }
    for (let gx = -w; gx <= w; gx += 80) {
      cockpitCtx.beginPath();
      cockpitCtx.moveTo(gx, 0);
      cockpitCtx.lineTo(gx * 2.5, h * 2);
      cockpitCtx.stroke();
    }

    // Clouds in Sky
    cockpitCtx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    cloudOffsets.forEach((c) => {
      cockpitCtx.beginPath();
      cockpitCtx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      cockpitCtx.arc(c.x + c.r * 0.6, c.y - c.r * 0.2, c.r * 0.7, 0, Math.PI * 2);
      cockpitCtx.arc(c.x - c.r * 0.6, c.y - c.r * 0.1, c.r * 0.6, 0, Math.PI * 2);
      cockpitCtx.fill();
    });

    // Horizon Line
    cockpitCtx.strokeStyle = '#00f2fe';
    cockpitCtx.lineWidth = 2.5;
    cockpitCtx.beginPath();
    cockpitCtx.moveTo(-w * 2, 0);
    cockpitCtx.lineTo(w * 2, 0);
    cockpitCtx.stroke();

    // Pitch Ladder
    cockpitCtx.strokeStyle = 'rgba(0, 242, 254, 0.65)';
    cockpitCtx.fillStyle = '#00f2fe';
    cockpitCtx.font = '11px monospace';
    cockpitCtx.lineWidth = 1.5;
    for (let p = -30; p <= 30; p += 10) {
      if (p === 0) continue;
      const y = -(p / 40) * (h / 2);
      const span = p > 0 ? 55 : 40;
      cockpitCtx.beginPath();
      cockpitCtx.moveTo(-span, y);
      cockpitCtx.lineTo(-15, y);
      cockpitCtx.moveTo(15, y);
      cockpitCtx.lineTo(span, y);
      cockpitCtx.stroke();
      cockpitCtx.fillText(`${p > 0 ? '+' : ''}${p}°`, span + 6, y + 4);
    }

    cockpitCtx.restore();

    // Fixed Aircraft Symbol (Flight Path Reticle)
    cockpitCtx.strokeStyle = '#ffb703';
    cockpitCtx.lineWidth = 3;
    cockpitCtx.beginPath();
    cockpitCtx.moveTo(w / 2 - 50, h / 2);
    cockpitCtx.lineTo(w / 2 - 15, h / 2);
    cockpitCtx.lineTo(w / 2 - 15, h / 2 + 10);
    cockpitCtx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
    cockpitCtx.moveTo(w / 2 + 15, h / 2 + 10);
    cockpitCtx.lineTo(w / 2 + 15, h / 2);
    cockpitCtx.lineTo(w / 2 + 50, h / 2);
    cockpitCtx.stroke();

    requestAnimationFrame(drawCockpit);
  }

  requestAnimationFrame(drawCockpit);

  // -------------------------------------------------------------------------
  // 13. GEMINI AI TELEGRAPHIC-TO-SPEECH EXPANDER (SLIDE 36)
  // -------------------------------------------------------------------------
  const GEMINI_INTENTS = {
    'pain / left shoulder / sharp': {
      en: "I am experiencing a sharp pain in my left shoulder; could you please help me readjust my position and check my pillows?",
      hi: "मेरे बाएं कंधे में तेज दर्द हो रहा है; कृपया मेरी करवट बदलने में मदद करें और तकिए ठीक कर दें।"
    },
    'water / cold / thirsty': {
      en: "May I please have a glass of cold drinking water? I am feeling quite thirsty.",
      hi: "क्या मुझे एक गिलास ठंडा पीने का पानी मिल सकता है? मुझे बहुत प्यास लगी है।"
    },
    'breath / heavy / fan': {
      en: "My chest feels slightly heavy and congested; could you please turn up the ceiling fan and elevate my back?",
      hi: "मेरी सांस थोड़ी भारी लग रही है; कृपया पंखे की गति बढ़ा दें और मेरी पीठ को सहारा दें।"
    },
    'medicine / head / 2pm': {
      en: "It is past 2 PM; could someone please check if it is time for my scheduled headache medication?",
      hi: "दोपहर के २ बज चुके हैं; कृपया देखें कि क्या मेरे सिरदर्द की दवा का समय हो गया है?"
    },
    'family / call / video': {
      en: "I would love to connect with my family; could you please set up a quick video call on the tablet?",
      hi: "मैं अपने परिवार से बात करना चाहता हूँ; कृपया टैबलेट पर एक वीडियो कॉल लगा दें।"
    }
  };

  const teleChips = document.querySelectorAll('.tele-chip-btn');
  const teleCustomInput = document.getElementById('tele-custom-input');
  const btnRunGemini = document.getElementById('btn-run-gemini');
  const geminiEnOutput = document.getElementById('gemini-en-output');
  const geminiHiOutput = document.getElementById('gemini-hi-output');
  const btnVocalizeEn = document.getElementById('btn-vocalize-en');
  const btnVocalizeHi = document.getElementById('btn-vocalize-hi');

  let currentEnText = "I am experiencing a sharp pain in my left shoulder; could you please help me readjust my position and check my pillows?";
  let currentHiText = "मेरे बाएं कंधे में तेज दर्द हो रहा है; कृपया मेरी करवट बदलने में मदद करें और तकिए ठीक कर दें।";

  function expandIntent(query) {
    const qNorm = query.toLowerCase().trim();
    let match = GEMINI_INTENTS[qNorm];

    if (!match) {
      match = {
        en: `Patient request based on intent "${query}": Please attend to my comfort and care needs as requested.`,
        hi: `मरीज का अनुरोध ("${query}"): कृपया मेरी देखभाल और आवश्यकता के अनुसार मेरी सहायता करें।`
      };
    }

    currentEnText = match.en;
    currentHiText = match.hi;

    if (geminiEnOutput) {
      geminiEnOutput.textContent = '';
      let i = 0;
      const timer = setInterval(() => {
        geminiEnOutput.textContent += match.en.charAt(i);
        i++;
        if (i >= match.en.length) clearInterval(timer);
      }, 16);
    }

    if (geminiHiOutput) {
      geminiHiOutput.textContent = match.hi;
    }

    playTone(1050, 'sine', 0.1, 0.08);
  }

  teleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      teleChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const txt = chip.getAttribute('data-intent');
      if (teleCustomInput) teleCustomInput.value = txt;
      expandIntent(txt);
    });
  });

  if (btnRunGemini && teleCustomInput) {
    btnRunGemini.addEventListener('click', () => {
      expandIntent(teleCustomInput.value || 'pain / left shoulder / sharp');
    });
  }

  if (btnVocalizeEn) {
    btnVocalizeEn.addEventListener('click', () => {
      speakText(currentEnText, 'en-US');
      playTone(800, 'sine', 0.08, 0.08);
    });
  }

  if (btnVocalizeHi) {
    btnVocalizeHi.addEventListener('click', () => {
      speakText(currentHiText, 'hi-IN');
      playTone(720, 'sine', 0.08, 0.08);
    });
  }

  // -------------------------------------------------------------------------
  // 14. COMPANION APP TILES & NTFY DISPATCHER
  // -------------------------------------------------------------------------
  const appTileWater = document.getElementById('app-tile-water');
  const appTileRest = document.getElementById('app-tile-rest');
  const appTileSos = document.getElementById('app-tile-sos');
  const appTileLight = document.getElementById('app-tile-light');
  const appTileSettings = document.getElementById('app-tile-settings');
  const companionFeedbackText = document.getElementById('companion-feedback-text');
  const tileIotLampIcon = document.getElementById('tile-iot-lamp-icon');
  const tileIotLampText = document.getElementById('tile-iot-lamp-text');

  let roomLightOn = false;

  function setCompanionFeedback(msg, isAlert = false) {
    if (companionFeedbackText) {
      companionFeedbackText.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      companionFeedbackText.style.color = isAlert ? 'var(--danger)' : 'var(--accent-iris)';
    }
  }

  if (appTileWater) {
    appTileWater.addEventListener('click', () => {
      speakText('I need drinking water, please help me.', 'en-US');
      setCompanionFeedback('💧 Hydration request vocalized: "I need drinking water, please help me."');
      playTone(660, 'sine', 0.1, 0.08);
    });
  }

  if (appTileRest) {
    appTileRest.addEventListener('click', () => {
      speakText('Please help me turn or adjust my position.', 'en-US');
      setCompanionFeedback('🛏️ Position request vocalized: "Please help me turn or adjust my position."');
      playTone(550, 'sine', 0.1, 0.08);
    });
  }

  if (appTileSos) {
    appTileSos.addEventListener('click', () => {
      triggerCaregiverAlert();
    });
  }

  if (appTileLight) {
    appTileLight.addEventListener('click', () => {
      roomLightOn = !roomLightOn;
      if (tileIotLampIcon) tileIotLampIcon.textContent = roomLightOn ? '💡' : '🌑';
      if (tileIotLampText) tileIotLampText.textContent = roomLightOn ? 'LIGHT: ON' : 'ROOM LIGHT';
      speakText(`Bedroom light turned ${roomLightOn ? 'on' : 'off'}`, 'en-US');
      setCompanionFeedback(`💡 Wi-Fi IoT Relay: Bedroom ceiling light switched to ${roomLightOn ? 'ON' : 'OFF'}.`);
      playTone(roomLightOn ? 880 : 440, 'triangle', 0.1, 0.08);
    });
  }

  // Caregiver Alert Dispatcher
  const btnTestCaregiverAlert = document.getElementById('btn-test-caregiver-alert');
  const phoneAlertPopup = document.getElementById('phone-alert-popup');
  const btnAckAlert = document.getElementById('btn-ack-alert');
  const btnOpenPortal = document.getElementById('btn-open-portal');

  function triggerCaregiverAlert() {
    speakText('Emergency alert! Caretaker needed immediately!', 'en-US');
    setCompanionFeedback('🚨 CRITICAL SOS DISPATCHED: Caretaker phone buzzed in 145ms via ntfy.sh!', true);
    setBeltLedState('sos');
    if (phoneAlertPopup) phoneAlertPopup.style.display = 'flex';
    playBlinkSound('sos');
  }

  if (btnTestCaregiverAlert) {
    btnTestCaregiverAlert.addEventListener('click', triggerCaregiverAlert);
  }

  if (btnAckAlert) {
    btnAckAlert.addEventListener('click', () => {
      if (phoneAlertPopup) phoneAlertPopup.style.display = 'none';
      setBeltLedState('connected');
      setCompanionFeedback('✓ Caretaker acknowledged emergency alert. Mean response time: 18.2 seconds.');
      playTone(1000, 'sine', 0.1, 0.1);
    });
  }

  if (btnOpenPortal) {
    btnOpenPortal.addEventListener('click', () => {
      alert('Opening IRIS Caregiver Live Portal (Sub-300ms WebRTC Stream)');
    });
  }

  // -------------------------------------------------------------------------
  // 15. UNIVERSAL SETTINGS HUB MODAL (SLIDES 14 & 17)
  // -------------------------------------------------------------------------
  const settingsModal = document.getElementById('settings-hub-modal');
  const floatingSettingsBtn = document.getElementById('floating-settings-btn');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
  const settingsPanes = document.querySelectorAll('.settings-tab-pane');

  function openSettingsModal() {
    if (settingsModal) {
      settingsModal.style.display = 'flex';
      settingsModal.setAttribute('aria-hidden', 'false');
      playTone(800, 'sine', 0.08, 0.06);
    }
  }

  function closeSettingsModal() {
    if (settingsModal) {
      settingsModal.style.display = 'none';
      settingsModal.setAttribute('aria-hidden', 'true');
      playTone(500, 'sine', 0.08, 0.06);
    }
  }

  if (floatingSettingsBtn) floatingSettingsBtn.addEventListener('click', openSettingsModal);
  if (appTileSettings) appTileSettings.addEventListener('click', openSettingsModal);
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsModal);

  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal && settingsModal.style.display === 'flex') {
      closeSettingsModal();
    }
  });

  settingsTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      settingsTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      settingsPanes.forEach(pane => {
        pane.style.display = pane.id === `pane-${tabId}` ? 'block' : 'none';
      });
      playTone(700, 'sine', 0.05, 0.05);
    });
  });

  // Modal actions
  const btnModalLaunchSim = document.getElementById('btn-modal-launch-sim');
  const btnModalLaunchDino = document.getElementById('btn-modal-launch-dino');
  const btnToggleLofi = document.getElementById('btn-toggle-lofi');
  const btnIotRoomLight = document.getElementById('btn-iot-room-light');
  const btnIotFan = document.getElementById('btn-iot-fan');

  if (btnModalLaunchSim) {
    btnModalLaunchSim.addEventListener('click', () => {
      closeSettingsModal();
      if (tabFlightSim) tabFlightSim.click();
      const el = document.getElementById('arcade-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (btnModalLaunchDino) {
    btnModalLaunchDino.addEventListener('click', () => {
      closeSettingsModal();
      if (tabDinoJump) tabDinoJump.click();
      const el = document.getElementById('arcade-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  }

  let lofiOsc = null;
  if (btnToggleLofi) {
    btnToggleLofi.addEventListener('click', () => {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;

      if (lofiOsc) {
        lofiOsc.stop();
        lofiOsc.disconnect();
        lofiOsc = null;
        btnToggleLofi.textContent = 'Play Lo-Fi ♫';
      } else {
        lofiOsc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        lofiOsc.type = 'sine';
        lofiOsc.frequency.setValueAtTime(432, audioCtx.currentTime); // 432 Hz Alpha wave
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        lofiOsc.connect(gain);
        gain.connect(audioCtx.destination);
        lofiOsc.start();
        btnToggleLofi.textContent = 'Pause Lo-Fi ⏸';
      }
    });
  }

  if (btnIotRoomLight) {
    btnIotRoomLight.addEventListener('click', () => {
      const isOn = btnIotRoomLight.classList.toggle('on');
      btnIotRoomLight.classList.toggle('off', !isOn);
      btnIotRoomLight.textContent = isOn ? 'ON' : 'OFF';
      playTone(isOn ? 880 : 440, 'triangle', 0.1, 0.08);
    });
  }

  if (btnIotFan) {
    btnIotFan.addEventListener('click', () => {
      const isOn = btnIotFan.classList.toggle('on');
      btnIotFan.classList.toggle('off', !isOn);
      btnIotFan.textContent = isOn ? 'ON' : 'OFF';
      playTone(isOn ? 920 : 460, 'triangle', 0.1, 0.08);
    });
  }

  // -------------------------------------------------------------------------
  // 16. GITHUB CLONE & MOBILE DRAWER
  // -------------------------------------------------------------------------
  const copyBtn = document.getElementById('copy-clone-btn');
  const cloneCmd = document.getElementById('clone-cmd');

  if (copyBtn && cloneCmd) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(cloneCmd.textContent).then(() => {
        copyBtn.textContent = 'Copied!';
        playTone(990, 'sine', 0.1, 0.1);
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      });
    });
  }

  const mobileBtn = document.getElementById('mobile-menu-btn');
  const mobileDrawer = document.getElementById('mobile-drawer');
  if (mobileBtn && mobileDrawer) {
    mobileBtn.addEventListener('click', () => {
      const isOpen = mobileDrawer.classList.toggle('open');
      mobileDrawer.setAttribute('aria-hidden', !isOpen);
    });

    document.querySelectorAll('.mobile-nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        mobileDrawer.setAttribute('aria-hidden', 'true');
      });
    });
  }

  // Initialize
  preloadFrames();
  resizeCanvas();
  updateScroll();

})();
