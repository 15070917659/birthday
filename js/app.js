/* =========================================================
 * 生日时光纪念册 · 主逻辑（360° 圆环 + 物理惯性滑动）
 * - 封面 overlay → 进入 → 图片轮播 → 退出 → 结尾 overlay
 * - 轮播只有图片卡，每张按自身比例显示
 * - 滑动力度控制速度：rAF + velocity 衰减
 * ========================================================= */

const CONFIG = {
  imagesDir: '图片',
  imageExt: '.jpg',
  bgFallback: '图片/背景图.jpg',
  dataUrl: 'data/pages.json',
  loadConcurrency: 2,
  probeTimeoutMs: 8000,
  // 物理参数
  friction: 0.94,          // 每帧速度衰减（减小此值使停止更快，更可控）
  stopThreshold: 0.3,      // 速度低于此值吸附
  swipeFactor: 0.10,       // 滑动距离 → 角度转换系数（减小使拖拽感更稳重）
  flickFactor: 0.22,       // 释放速度 → 角度速度系数（显著减小释放后的惯性速度）
  maxVelocity: 7,          // 最大角速度限制（严格限制最高速，防止飞转）
  maxCardWidth: 320,       // 减小最大宽度
  maxCardHeight: 450,      // 减小最大高度
  minCardWidth: 220,       // 减小最小宽度
  minCardHeight: 300,      // 减小最小高度
  // 物理与反馈参数
  enableTickSound: true,
  enableVibration: true,
  springTension: 0.01,     // 减小张力，使回弹更柔和
  springFriction: 0.9,     // 增大阻尼，使抖动快速平息
  // GPU/内存优化
  maxImgDim: 1600          // 纹理长边上限（卡最大 320×450 CSS px，@3x ≈1350px 足够）
};

/* ---------- 哒哒哒音效生成器 ---------- */
class TickSound {
  constructor() {
    this.audioCtx = null;
    this.lastPlayTime = 0;
  }

  _init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  play() {
    try {
      this._init();
      const now = this.audioCtx.currentTime;
      // 防止播放过于密集
      if (Date.now() - this.lastPlayTime < 40) return;
      this.lastPlayTime = Date.now();

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine'; // 柔和的哒哒声
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.04);

      gain.gain.setValueAtTime(0.6, now); // 调大音量，确保清晰
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.04);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      console.warn('AudioContext play failed - app.js:74', e);
    }
  }
}
const ticker = new TickSound();

/* ---------- 工具 ---------- */
function preloadImage(src, timeoutMs = CONFIG.probeTimeoutMs){
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const timer = setTimeout(() => {
      if(done) return;
      done = true;
      resolve({ ok: false, w: 0, h: 0, timeout: true });
    }, timeoutMs);
    img.onload = () => {
      if(done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      if(done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, w: 0, h: 0 });
    };
    img.src = src;
  });
}

/* 计算卡片显示尺寸：按图片真实比例，限制最大最小宽高 */
function calcCardSize(w, h){
  if(!w || !h) return { w: 300, h: 400 };
  let cw = w, ch = h;
  const maxW = CONFIG.maxCardWidth;
  const maxH = CONFIG.maxCardHeight;
  // 先按最大宽高缩放
  const scaleMax = Math.min(maxW / cw, maxH / ch);
  cw = cw * scaleMax;
  ch = ch * scaleMax;
  // 再按最小宽高放大（保证不太小）
  const scaleMin = Math.max(CONFIG.minCardWidth / cw, CONFIG.minCardHeight / ch);
  if(scaleMin > 1){
    cw = cw * scaleMin;
    ch = ch * scaleMin;
    // 如果放大后超出最大，再缩回
    if(cw > maxW || ch > maxH){
      const s = Math.min(maxW / cw, maxH / ch);
      cw *= s;
      ch *= s;
    }
  }
  return { w: Math.round(cw), h: Math.round(ch) };
}

/* ---------- 加载数据 ---------- */
async function loadData(){
  if(typeof window.PAGES_DATA === 'object' && window.PAGES_DATA){
    return window.PAGES_DATA;
  }
  try{
    const res = await fetch(CONFIG.dataUrl, { cache: 'no-cache' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }catch(err){
    console.error('[数据加载失败] - app.js:141', err);
    return null;
  }
}

/* ---------- 渲染：时间线卡（占位） ---------- */
function renderTimelinePlaceholder(item){
  const title = item.title || '';
  const desc  = item.desc || '';
  const time  = item.time || '';
  return `
    <div class="item-date">${time}</div>
    <div class="card-3d">
      <div class="card-inner">
        <div class="card-face card-front card-loading" style="background:linear-gradient(135deg,#5b2a4f,#2a0f24);display:flex;align-items:center;justify-content:center;flex-direction:column;">
          <div class="loader">
            <div class="loader-dot"></div>
            <div class="loader-dot"></div>
            <div class="loader-dot"></div>
          </div>
          <span class="loader-text">图片加载中…</span>
        </div>
        <div class="card-face card-back">
          <h3>${title}</h3>
          <p>${desc}</p>
          <div class="heart"></div>
        </div>
      </div>
    </div>`;
}

/* ---------- 把已加载图片应用到卡片 ---------- */
function applyImageToCard(cardEl, src, w, h, title){
  const front = cardEl.querySelector('.card-front');
  front.classList.remove('card-loading');
  front.innerHTML = `
    <img src="${src}" alt="${title}" loading="lazy">
    <span class="hint"><span class="dot"></span>点击翻开</span>
  `;
}

/* ---------- 填满爱心 ---------- */
function fillHearts(cardEl){
  const heartEl = cardEl.querySelector('.heart');
  if(!heartEl) return;
  const cardWidth = cardEl.offsetWidth;
  if(cardWidth <= 0) return;
  const heartSize = 14;
  const gap = 6;
  const padding = 44;
  const available = cardWidth - padding;
  const count = Math.max(3, Math.floor(available / (heartSize + gap)));
  heartEl.innerHTML = Array.from({length: count}, () => '♥').join(' ');
}

/* ---------- 文字字号自适应 ---------- */
function fitTextSize(cardEl){
  const cw = cardEl.offsetWidth;
  const ch = cardEl.offsetHeight;
  const pEl = cardEl.querySelector('.card-back p');
  if(!pEl) return;
  const textLen = pEl.textContent.length;
  const diag = Math.sqrt(cw * cw + ch * ch);
  let base = diag / 26;
  if(textLen > 40)  base *= 0.92;
  if(textLen > 80)  base *= 0.90;
  if(textLen > 120) base *= 0.88;
  if(textLen > 160) base *= 0.85;
  const textSize = Math.max(10, Math.min(18, base));
  cardEl.style.setProperty('--text-size', textSize.toFixed(1) + 'px');
}

/* =========================================================
 * 3D 圆环 + 物理惯性
 * ========================================================= */
class Carousel{
  constructor(){
    this.trackEl = document.getElementById('track');
    this.stageEl = document.getElementById('stage');
    this.items = [...document.querySelectorAll('.carousel-item')];
    this.total = this.items.length;
    this.dots = [...document.querySelectorAll('.pager .dot')];
    this.btnPrev = document.getElementById('btnPrev');
    this.btnNext = document.getElementById('btnNext');
    this.swipeHint = document.getElementById('swipeHint');
    this.progress  = document.getElementById('progress');
    this.counterTagEl = document.getElementById('counterTag');
    this.pagesData = [];   // 时间线文本

    this.angleStep = 360 / this.total;
    this.currentAngle = 0;     // 当前 track 角度
    this.targetAngle = 0;      // 吸附目标角度
    this.velocity = 0;          // 角速度
    this.dragging = false;
    this.snapping = false;
    this.dragStartX = 0;
    this.dragStartAngle = 0;
    this.posHistory = [];
    this.rafId = null;
    this.lastTick = 0;
    this._lastTickIdx = 0;

    this._layout();
    // 应用 transform，并确保立即生效
    this.trackEl.style.transform = `translate3d(0, 0, ${-this.radius}px) rotateY(${this.currentAngle}deg)`;
    
    // 初始化渲染位置、缩放和透明度
    this._cullItems(); 
    this._bind();
    this._updateUI(0);
  }

  /* 布局：每个 item 按圆环排列 */
  _layout(){
    // 半径：根据最大卡片宽度算，稍微增大半径让圆环更明显
    const cw = CONFIG.maxCardWidth;
    const n = this.total;
    const radius = (cw / 2) / Math.tan(Math.PI / n) + 120; // 增加间距
    this.radius = radius;
    this.items.forEach((el, i) => {
      const angle = i * this.angleStep;
      el.style.setProperty('--angle', angle + 'deg');
      el.style.setProperty('--radius', radius + 'px');
    });
  }

  /* 获取当前最接近正前方的索引 */
  getCurrentIndex(){
    let normalized = -this.currentAngle / this.angleStep;
    let n = this.total;
    let idx = Math.round(normalized);
    idx = ((idx % n) + n) % n;
    return idx;
  }

  /* 主循环：物理动画 */
  _tick(timestamp){
    if(!this.lastTick) this.lastTick = timestamp;
    const dt = Math.min(32, timestamp - this.lastTick);
    this.lastTick = timestamp;

    let needsNextFrame = this.dragging;

    if(!this.dragging){
      if(this.snapping){
        // 弹簧物理模型：实现“果冻感”吸附
        const diff = this.targetAngle - this.currentAngle;
        
        // 核心公式：加速度 = (距离 * 张力) - (速度 * 阻尼)
        const accel = diff * CONFIG.springTension - this.velocity * (1 - CONFIG.springFriction);
        this.velocity += accel;
        this.currentAngle += this.velocity;

        // 如果距离和速度都足够小，则停止
        if(Math.abs(diff) < 0.01 && Math.abs(this.velocity) < 0.01){
          this.currentAngle = this.targetAngle;
          this.velocity = 0;
          this.snapping = false;
        } else {
          needsNextFrame = true;
        }
      } else {
        // 惯性滑动
        if(Math.abs(this.velocity) > CONFIG.maxVelocity){
          this.velocity = Math.sign(this.velocity) * CONFIG.maxVelocity;
        }
        
        if(Math.abs(this.velocity) > CONFIG.stopThreshold){
          this.currentAngle += this.velocity;
          this.velocity *= CONFIG.friction;
          needsNextFrame = true;
        } else if(this.velocity !== 0){
          this._snap();
          needsNextFrame = true;
        }
      }
    }

    // 应用 transform
    this.trackEl.style.transform = `translate3d(0, 0, ${-this.radius}px) rotateY(${this.currentAngle}deg)`;
    
    // 性能优化：剔除不可见卡片
    this._cullItems();

    // 播放滑动音效与震动反馈
    const rawIdx = -this.currentAngle / this.angleStep;
    const rounded = Math.round(rawIdx);
    if(rounded !== this._lastTickIdx){
      this._lastTickIdx = rounded;
      if(CONFIG.enableTickSound) ticker.play();
      
      // 增强震动逻辑：兼容不同系统，尝试多种调用方式
      if(CONFIG.enableVibration){
        try {
          if (navigator.vibrate) {
            // 某些安卓设备对极短震动不敏感，尝试稍微增加时长并使用数组格式
            navigator.vibrate(20); 
          }
        } catch(e) {}
      }
    }

    // 更新 UI
    const idx = this.getCurrentIndex();
    if(idx !== this._lastIdx){
      this._lastIdx = idx;
      this._updateUI(idx);
    }
    
    if (needsNextFrame) {
      this.rafId = requestAnimationFrame((t) => this._tick(t));
    } else {
      this.rafId = null;
    }
  }

  /* 渲染不可见卡片，但通过透明度和模糊产生深度感 */
  _cullItems() {
    const step = this.angleStep;
    this.items.forEach((el, i) => {
      let itemAngle = (i * step + this.currentAngle) % 360;
      if (itemAngle > 180) itemAngle -= 360;
      if (itemAngle < -180) itemAngle += 360;

      const absAngle = Math.abs(itemAngle);
      
      // 始终显示，但根据角度调整透明度和缩放
      el.style.visibility = 'visible';
      el.style.display = 'block';
      
      // 计算深度感：0度(正面)透明度1，180度(背面)透明度0.2
      const opacity = Math.max(0.2, 1 - (absAngle / 180) * 0.8);
      el.style.opacity = opacity.toFixed(2);
      
      // 增加缩放深度感：远处的卡片变小
      const scale = Math.max(0.5, 1 - (absAngle / 180) * 0.5);
      // 注意：transform 已经在样式中定义了变量，这里我们通过 scale 进一步增强
      el.style.transform = `translate3d(-50%, -50%, 0) rotateY(var(--angle)) translateZ(var(--radius)) scale(${scale})`;

      // 只有最前面的卡片才显示日期
      const dateEl = el.querySelector('.item-date');
      if (dateEl) {
        dateEl.style.opacity = absAngle < 35 ? '1' : '0';
      }
    });
  }

  /* 启动或重置动画循环 */
  _requestTick() {
    if (!this.rafId) {
      this.lastTick = performance.now();
      this.rafId = requestAnimationFrame((t) => this._tick(t));
    }
  }

  /* 吸附到最近卡片 */
  _snap(){
    const step = this.angleStep;
    this.targetAngle = -Math.round(-this.currentAngle / step) * step;
    this.snapping = true;
  }

  /* 跳到指定索引 */
  goTo(i){
    const n = this.total;
    const step = this.angleStep;
    const currentNormalized = Math.round(-this.currentAngle / step);
    let diff = i - (((currentNormalized % n) + n) % n);
    if(diff > n / 2) diff -= n;
    if(diff < -n / 2) diff += n;
    
    this.targetAngle = this.currentAngle - diff * step;
    this.velocity = 0;
    this.snapping = true;
    this._requestTick();
  }

  next(){ this.goTo(this.getCurrentIndex() + 1); }
  prev(){ this.goTo(this.getCurrentIndex() - 1); }

  /* UI 更新 */
  _updateUI(idx){
    this.items.forEach((el, i) => {
      const isActive = i === idx;
      el.classList.toggle('active', isActive);
    });
    
    if(this.dots.length > 0){
      this.dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    }

    // 自动隐藏滑动提示
    if(idx > 0 && this.swipeHint){
      this.swipeHint.style.opacity = '0';
      this.swipeHint.style.pointerEvents = 'none';
    }
    
    if(this.progress){
      this.progress.style.width = ((idx + 1) / this.total * 100) + '%';
    }

    if(this.counterTagEl){
      this.counterTagEl.textContent = `${idx + 1} / ${this.total}`;
    }

    // 填爱心（在活跃卡片上处理）
    const card = this.items[idx].querySelector('.card-3d');
    if(card){
      fillHearts(card);
      fitTextSize(card);
    }

    if(this.onIndexChange) this.onIndexChange(idx);
  }

  /* 绑定事件 */
  _bind(){
    this.btnNext.addEventListener('click', () => this.next());
    this.btnPrev.addEventListener('click', () => this.prev());

    document.addEventListener('keydown', e => {
      if(e.key === 'ArrowRight' || e.key === ' '){ e.preventDefault(); this.next(); }
      else if(e.key === 'ArrowLeft'){ e.preventDefault(); this.prev(); }
      else if(e.key === 'Enter'){
        const idx = this.getCurrentIndex();
        const card = this.items[idx].querySelector('.card-3d');
        if(card) card.classList.toggle('flipped');
      }
    });

    // 触摸
    this.stageEl.addEventListener('touchstart', e => {
      this.dragging = true;
      this.snapping = false;
      this.dragStartX = e.touches[0].clientX;
      this.dragStartAngle = this.currentAngle;
      this.posHistory = [{ x: this.dragStartX, time: performance.now() }];
      this.velocity = 0;
      this._requestTick();
    }, { passive: true });

    this.stageEl.addEventListener('touchmove', e => {
      if(!this.dragging) return;
      const x = e.touches[0].clientX;
      const dx = x - this.dragStartX;
      this.currentAngle = this.dragStartAngle + dx * CONFIG.swipeFactor;
      
      const now = performance.now();
      this.posHistory.push({ x, time: now });
      if(this.posHistory.length > 10) this.posHistory.shift();
      
      this._requestTick();
    }, { passive: true });

    this.stageEl.addEventListener('touchend', e => {
      if(this.dragging && this.posHistory.length > 1){
        const now = performance.now();
        const recent = this.posHistory.filter(p => now - p.time < 100);
        if(recent.length > 1){
          const first = recent[0];
          const last = recent[recent.length - 1];
          const dt = last.time - first.time;
          if(dt > 20){
            this.velocity = ((last.x - first.x) / dt) * CONFIG.flickFactor * 16;
          }
        }
      }
      const x = e.changedTouches[0].clientX;
      const moved = Math.abs(x - this.dragStartX) > 10;
      this._wasDragging = moved;
      this.dragging = false;
      this._requestTick();
    }, { passive: true });

    // 鼠标拖拽
    let mouseDown = false;
    this.stageEl.addEventListener('mousedown', e => {
      mouseDown = true;
      this.dragging = true;
      this.snapping = false;
      this.dragStartX = e.clientX;
      this.dragStartAngle = this.currentAngle;
      this.posHistory = [{ x: e.clientX, time: performance.now() }];
      this.velocity = 0;
      this._requestTick();
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if(!mouseDown) return;
      const x = e.clientX;
      const dx = x - this.dragStartX;
      this.currentAngle = this.dragStartAngle + dx * CONFIG.swipeFactor;
      
      const now = performance.now();
      this.posHistory.push({ x, time: now });
      if(this.posHistory.length > 10) this.posHistory.shift();
      
      this._requestTick();
    });
    document.addEventListener('mouseup', e => {
      if(mouseDown){
        if(this.posHistory.length > 1){
          const now = performance.now();
          const recent = this.posHistory.filter(p => now - p.time < 100);
          if(recent.length > 1){
            const first = recent[0];
            const last = recent[recent.length - 1];
            const dt = last.time - first.time;
            if(dt > 20){
              this.velocity = ((last.x - first.x) / dt) * CONFIG.flickFactor * 16;
            }
          }
        }
        const x = e.clientX;
        const moved = Math.abs(x - this.dragStartX) > 10;
        this._wasDragging = moved;
        mouseDown = false;
        this.dragging = false;
        this._requestTick();
      }
    });

    // 点击当前卡翻转
    this.items.forEach((el, i) => {
      el.addEventListener('click', e => {
        // 区分拖拽 vs 点击
        if(this._wasDragging){ this._wasDragging = false; return; }
        const idx = this.getCurrentIndex();
        if(i === idx){
          const card = el.querySelector('.card-3d');
          if(card) card.classList.toggle('flipped');
        } else {
          this.goTo(i);
        }
      });
    });

    // 指示器
    this.dots.forEach((dot, i) => {
      dot.addEventListener('click', () => this.goTo(i));
    });

    // 窗口 resize 重算布局
    window.addEventListener('resize', () => {
      clearTimeout(this._rTimer);
      this._rTimer = setTimeout(() => this._layout(), 150);
    });
  }
}

/* ---------- 音乐控制器 ---------- */
class MusicController{
  constructor(src){
    this.audio   = document.getElementById('bgMusic');
    this.btn     = document.getElementById('musicBtn');
    this.src     = src;
    this.playing = false;
    this.tipEl   = null;
    this._initTip();
    if(src) this._setup(); else this._noSource();
  }
  _setup(){
    this.audio.src = this.src;
    this.audio.load();
    this.btn.addEventListener('click', e => {
      e.stopPropagation();
      this.toggle();
    });
    const tryAutoplay = () => {
      if(this.playing) return;
      this.play().then(() => {
        document.removeEventListener('click',     tryAutoplay, true);
        document.removeEventListener('touchstart', tryAutoplay, true);
        document.removeEventListener('keydown',    tryAutoplay, true);
      }).catch(() => {});
    };
    document.addEventListener('click',     tryAutoplay, true);
    document.addEventListener('touchstart', tryAutoplay, true);
    document.addEventListener('keydown',    tryAutoplay, true);
  }
  _noSource(){
    this.btn.style.opacity = '.55';
    this.btn.addEventListener('click', () => {
      this._showTip('未配置音乐文件<br>请将音乐放入「音乐/」文件夹');
    });
  }
  _initTip(){
    const tip = document.createElement('div');
    tip.className = 'music-tip';
    document.body.appendChild(tip);
    this.tipEl = tip;
  }
  _showTip(html, ms = 3500){
    if(!this.tipEl) return;
    this.tipEl.innerHTML = html;
    this.tipEl.classList.add('show');
    clearTimeout(this._tipTimer);
    this._tipTimer = setTimeout(() => this.tipEl.classList.remove('show'), ms);
  }
  play(){
    const p = this.audio.play();
    if(p && p.then){
      return p.then(() => {
        this.playing = true;
        this.btn.classList.add('playing');
      }).catch(err => { throw err; });
    }
    this.playing = true;
    this.btn.classList.add('playing');
    return Promise.resolve();
  }
  pause(){
    this.audio.pause();
    this.playing = false;
    this.btn.classList.remove('playing');
  }
  toggle(){
    if(!this.src){ this._showTip('未配置音乐文件'); return; }
    if(this.playing){
      this.pause();
      this._showTip('音乐已暂停', 1500);
    } else {
      this.play().catch(() => this._showTip('播放失败，请检查音乐文件'));
    }
  }
}

/* ---------- 飘落花瓣 ---------- */
function startPetals(){
  function spawn(){
    const p = document.createElement('div');
    p.className = 'petal';
    p.style.left = Math.random() * 100 + 'vw';
    const dur = 8 + Math.random() * 8;
    p.style.animationDuration = dur + 's';
    p.style.width = (8 + Math.random() * 10) + 'px';
    p.style.height = p.style.width;
    p.style.opacity = 0.5 + Math.random() * 0.4;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), dur * 1000);
  }
  setInterval(spawn, 700);
  for(let i = 0; i < 6; i++) setTimeout(spawn, i * 300);
}

/* ---------- 鼠标视差背景 ---------- */
function bindParallax(){
  document.addEventListener('mousemove', e => {
    if(window.innerWidth < 768) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 12;
    const y = (e.clientY / window.innerHeight - 0.5) * 12;
    document.getElementById('bgLayer').style.transform =
      `scale(1.1) translate(${x}px, ${y}px)`;
  });
}

/* ---------- 主入口 ---------- */
async function main(){
  const data = await loadData();
  if(!data){
    document.getElementById('track').innerHTML =
      '<div style="color:#fff;text-align:center;padding:40px;">数据加载失败</div>';
    return;
  }

  // 1. 背景
  const bg = data.background || CONFIG.bgFallback;
  const bgEl = document.getElementById('bgLayer');
  const bgImg = new Image();
  bgImg.onload = () => { bgEl.style.backgroundImage = `url('${bg}')`; };
  bgImg.src = bg;

  // 2. 填充封面 overlay
  const coverEl = document.getElementById('coverOverlay');
  const c = data.cover || {};
  coverEl.innerHTML = `
    <div class="badge">${c.badge || 'HAPPY BIRTHDAY'}</div>
    <h1>${c.title || '生日快乐'}</h1>
    <div class="name">致 · <span>${c.name || ''}</span></div>
    <div class="subtitle">${c.subtitle || ''}</div>
    <p class="wish">${c.wish || ''}</p>
    <button class="enter-btn" id="enterBtn">点 击 进 入</button>
  `;

  // 3. 填充结尾 overlay
  const endingEl = document.getElementById('endingOverlay');
  const e = data.ending || {};
  endingEl.innerHTML = `
    <div class="end-title">${e.title || ''}</div>
    <div class="end-name">${e.name || ''}</div>
    <p class="end-text">${e.text || ''}</p>
    <div class="cake">${e.emoji || '🎂'}</div>
  `;

  // 4. 构建图片轮播（只含时间线图片卡）
  const track = document.getElementById('track');
  const pager = document.getElementById('pager');
  track.innerHTML = '';
  pager.innerHTML = '';

  const txtPages = data.pages || [];
  const tlItemEls = [];
  for(let i = 0; i < txtPages.length; i++){
    const el = document.createElement('div');
    el.className = 'carousel-item';
    // 先用默认尺寸占位（流式加载后会被更新）
    el.style.width  = '300px';
    el.style.height = '400px';
    el.innerHTML = renderTimelinePlaceholder(txtPages[i]);
    track.appendChild(el);
    tlItemEls.push(el);
    // 指示器
    const dot = document.createElement('div');
    dot.className = 'dot';
    pager.appendChild(dot);
  }

  // 5. 初始化交互
  startPetals();
  bindParallax();
  window.music = new MusicController(data.music || '');

  // 6. 初始化 Carousel
  window.carousel = new Carousel();
  window.carousel.pagesData = txtPages;
  window.carousel.data = data;

  // 7. 进入按钮：隐藏封面 overlay
  document.getElementById('enterBtn').addEventListener('click', () => {
    coverEl.classList.add('hide');
    // 激活音效与震动上下文
    if(CONFIG.enableTickSound) ticker.play(); 
    if(CONFIG.enableVibration && navigator.vibrate) navigator.vibrate(20);
    
    // 尝试播放音乐（用户手势内）
    if(window.music && !window.music.playing){
      window.music.play().catch(() => {});
    }
  });

  // 8. 流式加载图片
  const queue = [];
  for(let i = 0; i < txtPages.length; i++){
    queue.push({ index: i, src: `${CONFIG.imagesDir}/${i+1}${CONFIG.imageExt}`, txt: txtPages[i] });
  }

  let probeStop = false;
  let cursor = 0;
  async function worker(){
    while(cursor < queue.length && !probeStop){
      const myIndex = cursor++;
      const job = queue[myIndex];
      const r = await preloadImage(job.src);
      if(!r.ok){
        probeStop = true;
        const cardEl = tlItemEls[job.index].querySelector('.card-3d');
        if(cardEl){
          const front = cardEl.querySelector('.card-front');
          front.classList.remove('card-loading');
          front.style.background = 'linear-gradient(135deg,#5b2a4f,#2a0f24)';
          front.style.display = 'flex';
          front.style.alignItems = 'center';
          front.style.justifyContent = 'center';
          front.innerHTML = '<div style="color:rgba(255,231,241,.7);font-size:13px;letter-spacing:2px;">未配置图片</div>';
        }
        continue;
      }
      // 计算并应用尺寸
      const size = calcCardSize(r.w, r.h);
      const itemEl = tlItemEls[job.index];
      itemEl.style.width  = size.w + 'px';
      itemEl.style.height = size.h + 'px';
      // 重新居中（用 translate(-50%,-50%) 在 CSS 中已处理）
      const title = job.txt.title || '';
      const cardEl = itemEl.querySelector('.card-3d');
      if(cardEl) applyImageToCard(cardEl, job.src, r.w, r.h, title);
      // 如果是当前项，立即填爱心
      const curIdx = window.carousel.getCurrentIndex();
      if(curIdx === job.index){
        fillHearts(cardEl);
        fitTextSize(cardEl);
      }
      // 布局可能需要重新算（半径基于最大宽度，已知）
      console.log(`[流式加载] ${job.src} ✓ (${r.w}×${r.h}) → 卡片 ${size.w}×${size.h} - app.js:824`);
    }
  }

  const workers = [];
  for(let i = 0; i < CONFIG.loadConcurrency; i++) workers.push(worker());
  await Promise.all(workers);

  // 重新布局（尺寸可能变了）
  window.carousel._layout();
  console.log('[流式加载完成] - app.js:834');
}

main();
