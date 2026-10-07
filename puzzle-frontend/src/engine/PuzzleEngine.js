// ============================================================
// Moteur d'une partie : application PIXI, rendu à la demande,
// grande room + mini-room de focus, curseurs, aide, et tout le
// dialogue temps réel avec le serveur. React ne fait qu'afficher le
// HUD et transmettre les réglages (setSettings, setPrefs...).
// Monté une seule fois par partie : jamais reconstruit pour un
// simple changement de réglage.
// ============================================================
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { RenderLoop } from './renderLoop';
import { BoardScene, easeInOutCubic } from './BoardScene';
import { RemoteCursors } from './RemoteCursors';
import { bakeAtlas, loadSourceImage, makeGhostTexture, QUALITY_PRESETS, resolveQuality } from './atlas';
import { createSoundFx } from './sfx';
import { getCursorShape } from '../cursorShapes';

const CENTER = 2500;
const LOCKED = 'LOCKED';
const HUD_MARGINS = { top: 124, bottom: 92, left: 16, right: 16 };
const BARE_MARGINS = { top: 16, bottom: 16, left: 16, right: 16 };

// Zone de l'écran non couverte par le HUD : c'est elle que la grande
// table doit remplir à l'arrivée (son ratio est envoyé à la création).
// HUD masqué (mode clair) : presque tout l'écran.
export function safeAreaFor(width, height, hudHidden = false) {
  const m = hudHidden ? BARE_MARGINS : HUD_MARGINS;
  return {
    x: m.left,
    y: m.top,
    w: Math.max(200, width - m.left - m.right),
    h: Math.max(200, height - m.top - m.bottom),
  };
}

export class PuzzleEngine {
  constructor({ container, socket, room, prefs, profile, players, members, callbacks }) {
    this.container = container;
    this.socket = socket;
    this.room = room;
    this.roomId = room.roomId;
    this.settings = { ...room.settings };
    this.prefs = { ...prefs };
    this.profile = { ...profile };
    this.players = players || room.players || [];
    this.members = members || room.members || {};
    this.myMemberId = room.myMemberId;
    this.cb = callbacks || {};
    this.destroyed = false;
    this.abort = new AbortController();
    this.quality = resolveQuality(prefs.quality);
    this.placedBy = new Map();
    this.hint = { status: 'idle' };
    this.edges = { status: 'idle' };
    this.focus = null;
    this.focusStarting = false;
    this.zones = new Map((room.focuses || []).map((f) => [f.memberId, f]));
    this.inputFrozen = false;
    this.listeners = [];
    this.lastMouseEmit = 0;
    this.lastDragEmit = 0;
    this.pendingDrag = null;
    this.lastCountsKey = '';
    this.lastHintKey = '';
    this.followSocketId = null;
    this.cursorToken = 0;
    this.hudHidden = false;
    this.sfx = createSoundFx(() => (this.prefs.sfxMuted ? 0 : (this.prefs.sfxVolume ?? 0.8)));
    // Accès console / tests automatisés, en développement uniquement.
    if (import.meta.env.DEV) window.__puzzleEngine = this;

    // pw × ph : une case de la grille (une pièce classique en occupe une,
    // une pièce magique plusieurs) ; unit / big : taille typique d'une pièce.
    const pw = room.imgWidth / room.cols;
    const ph = room.imgHeight / room.rows;
    const scale = Math.sqrt((room.cols * room.rows) / Math.max(1, Object.keys(room.pieces).length));
    this.metrics = { pw, ph, ts: Math.min(pw, ph) * 0.25, unit: Math.min(pw, ph) * scale, big: Math.max(pw, ph) * scale };
    this.cellIndex = new Map(Object.entries(room.pieces).map(([id, p]) => [`${p.c},${p.r}`, id]));
    this.frame = { x: CENTER - room.imgWidth / 2, y: CENTER - room.imgHeight / 2, w: room.imgWidth, h: room.imgHeight };
    this.table = room.table || { x: this.frame.x - this.frame.w, y: this.frame.y - this.frame.h, w: this.frame.w * 3, h: this.frame.h * 3 };
    for (const [id, p] of Object.entries(room.pieces)) if (p.placedBy) this.placedBy.set(id, p.placedBy);
  }

  // ============================================================
  // Géométrie d'une pièce (données de la partie)
  // ============================================================
  // Cadre, en cases : [colonne, ligne, largeur, hauteur].
  pieceBox(p) {
    return p.box || [p.c, p.r, 1, 1];
  }

  pieceSize(p) {
    const b = this.pieceBox(p);
    return { w: b[2] * this.metrics.pw, h: b[3] * this.metrics.ph };
  }

  // Pièces qui la touchent dans le puzzle fini : liste de la découpe
  // magique, ou les quatre cases autour d'une pièce classique.
  neighborIds(p) {
    if (p.adj) return p.adj;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dc, dr]) => this.cellIndex.get(`${p.c + dc},${p.r + dr}`))
      .filter(Boolean);
  }

  isEdgePiece(p) {
    const [bx, by, bw, bh] = this.pieceBox(p);
    return bx === 0 || by === 0 || bx + bw === this.room.cols || by + bh === this.room.rows;
  }

  // ============================================================
  // Démarrage / arrêt
  // ============================================================
  async init() {
    try {
      this.createApp();
      this.cb.onLoading?.({ phase: 'image', progress: 0 });
      const atlas = await this.buildAtlas({ silent: false });
      if (this.destroyed) { atlas.destroy(); return; }
      this.atlas = atlas;
      this.buildMainScene();
      this.bindSocket();
      this.bindInput();
      this.main.fitTable({ safe: this.safeArea() });
      this.updateOwnCursor();
      if (this.room.myFocus) this.openFocus(this.room.myFocus, this.room.pieces);
      this.emitCounts();
      this.updateHintAvailability();
      this.markDirty();
      this.cb.onReady?.();
      if (this.pendingResync) { const p = this.pendingResync; this.pendingResync = null; this.applyResync(p); }
    } catch (err) {
      if (this.destroyed || err?.name === 'AbortError') return;
      console.error(err);
      this.cb.onError?.(err);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (import.meta.env.DEV && window.__puzzleEngine === this) window.__puzzleEngine = null;
    this.abort.abort();
    for (const [event, handler] of this.listeners) this.socket.off(event, handler);
    this.listeners = [];
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    this.renderLoop?.destroy();
    if (this.focus) this.destroyFocus();
    this.main?.destroy();
    this.cursors?.destroy();
    this.atlas?.destroy();
    this.ghostTexture?.destroy(true);
    this.app?.destroy(true, { children: true, texture: false, baseTexture: false });
  }

  createApp() {
    const preset = QUALITY_PRESETS[this.quality];
    this.app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, preset.resolutionCap),
      autoDensity: true,
      antialias: preset.antialias,
      autoStart: false,
      powerPreference: 'high-performance',
    });
    this.app.view.style.display = 'block';
    this.container.appendChild(this.app.view);
    const gl = this.app.renderer.gl;
    this.maxTextureSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
    this.renderLoop = new RenderLoop(this.app);
    this.renderLoop.setFpsCap(preset.fpsCap);
    this.mainViewport = this.createViewport();
    // Les curseurs des autres sont dessinés à l'écran, au-dessus de tout
    // (même d'un focus ouvert).
    this.cursorLayer = new PIXI.Container();
    this.app.stage.addChild(this.mainViewport, this.cursorLayer);
    this.renderLoop.addViewport(this.mainViewport);
    this.renderLoop.addUpdater(this.update);
  }

  createViewport() {
    const vp = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: 5000,
      worldHeight: 5000,
      events: this.app.renderer.events,
      passiveWheel: false,
      disableOnContextMenu: true,
    });
    vp.drag().pinch().wheel({ smooth: 3 }).decelerate({ friction: 0.93 });
    return vp;
  }

  async buildAtlas({ silent }) {
    const url = this.room.originalImageUrl || this.room.imageUrl;
    const source = await loadSourceImage(url, this.abort.signal);
    if (this.destroyed) { source.close?.(); throw new DOMException('Annulé', 'AbortError'); }
    if (!silent) this.cb.onLoading?.({ phase: 'pieces', progress: 0 });
    const t0 = performance.now();
    const atlas = await bakeAtlas({
      source,
      cols: this.room.cols,
      rows: this.room.rows,
      worldW: this.room.imgWidth,
      worldH: this.room.imgHeight,
      pieces: Object.entries(this.room.pieces).map(([id, p]) => ({ id, c: p.c, r: p.r, box: p.box, shape: p.shape })),
      quality: this.quality,
      seams: this.settings.showSeams !== false,
      maxTextureSize: this.maxTextureSize,
      signal: this.abort.signal,
      onProgress: silent ? null : (progress) => this.cb.onLoading?.({ phase: 'pieces', progress }),
    });
    atlas.bakeMs = Math.round(performance.now() - t0);
    if (!this.ghostTexture) this.ghostTexture = makeGhostTexture(source);
    source.close?.();
    return atlas;
  }

  // Recuisson (traits de découpe ou qualité changés) sans recharger la partie.
  async rebake() {
    if (!this.atlas) return;
    if (this.rebaking) { this.rebakeQueued = true; return; }
    this.rebaking = true;
    this.cb.onBusy?.(true);
    try {
      const atlas = await this.buildAtlas({ silent: true });
      if (this.destroyed) { atlas.destroy(); return; }
      const old = this.atlas;
      this.atlas = atlas;
      this.main.setTextures(atlas);
      this.focus?.scene.setTextures(atlas);
      old.destroy();
      this.markDirty();
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
    } finally {
      this.rebaking = false;
      if (!this.destroyed) this.cb.onBusy?.(false);
      if (this.rebakeQueued && !this.destroyed) { this.rebakeQueued = false; this.rebake(); }
    }
  }

  buildMainScene() {
    this.main = new BoardScene(this, {
      viewport: this.mainViewport,
      kind: 'main',
      frame: this.frame,
      table: this.table,
      lockedGroupId: this.settings.lockMode === 'locked' ? LOCKED : null,
      metrics: this.metrics,
      atlas: this.atlas,
      shadows: this.shadowsEnabled(),
    });
    const { pw, ph } = this.metrics;
    for (const [id, p] of Object.entries(this.room.pieces)) {
      const [bx, by] = this.pieceBox(p);
      this.main.addPiece({
        id, c: p.c, r: p.r, shape: p.shape, x: p.x, y: p.y, groupId: p.groupId,
        tx: this.frame.x + bx * pw, ty: this.frame.y + by * ph, box: this.pieceBox(p),
        ...this.pieceSize(p), adj: this.neighborIds(p),
        isEdge: this.isEdgePiece(p),
        hidden: !!p.focus,
      });
    }
    if (this.main.pieces.size > 300) this.main.setCulling(true);
    this.main.setFrameVisible(this.settings.showFrame !== false);
    this.main.setGhost(this.ghostTexture, !!this.settings.ghostImage);
    this.main.setZones([...this.zones.values()]);
    this.cursors = new RemoteCursors(this, this.cursorLayer, this.mainViewport);
    this.cursors.setScale(this.cursorScale());
    this.cursors.setPlayers(this.players, this.socket.id);
    for (const h of this.room.held || []) this.main.applyHeld({ pieceIds: h.pieceIds, held: true, socketId: h.socketId });
  }

  // ============================================================
  // Boucle
  // ============================================================
  markDirty() {
    this.renderLoop?.markDirty();
  }

  safeArea() {
    return safeAreaFor(this.app.screen.width, this.app.screen.height, this.hudHidden);
  }

  // Mode clair : le HUD est masqué, « Recentrer » peut prendre tout l'écran.
  setHudHidden(hidden) {
    this.hudHidden = !!hidden;
  }

  // Le focus occupe le centre de l'écran : la grande room reste visible
  // sur les bords, derrière le voile.
  focusSafeArea() {
    const s = this.safeArea();
    const mx = s.w * 0.07;
    const my = s.h * 0.06;
    return { x: s.x + mx, y: s.y + my, w: s.w - 2 * mx, h: s.h - 2 * my };
  }

  shadowsEnabled() {
    return QUALITY_PRESETS[this.quality].shadows;
  }

  activeScene() {
    return this.focus && !this.focus.peek ? this.focus.scene : this.main;
  }

  update = (dt) => {
    let active = false;
    if (this.main?.update(dt)) active = true;
    if (this.focus?.scene.update(dt)) active = true;
    if (this.cursors?.update(dt)) active = true;
    if (this.pendingDrag && performance.now() - this.lastDragEmit >= 33) {
      const d = this.pendingDrag;
      this.pendingDrag = null;
      this.lastDragEmit = performance.now();
      this.socket.emit('drag', { roomId: this.roomId, dx: d.dx, dy: d.dy });
    }
    if (this.followSocketId) {
      const pos = this.cursors?.positionOf(this.followSocketId);
      const c = this.mainViewport.center;
      if (pos && (Math.abs(pos.x - c.x) > 0.5 || Math.abs(pos.y - c.y) > 0.5)) this.mainViewport.moveCenter(pos.x, pos.y);
    }
    return active;
  };

  getStats() {
    return {
      rendersPerSecond: this.renderLoop?.renderedPerSecond ?? 0,
      pieces: this.main?.pieces.size ?? 0,
      pages: this.atlas?.pages ?? 0,
      pageSize: this.atlas?.pageSize ?? 0,
      k: this.atlas ? Math.round(this.atlas.k * 100) / 100 : 0,
      bakeMs: this.atlas?.bakeMs ?? 0,
      quality: this.quality,
      resolution: this.app?.renderer.resolution ?? 1,
    };
  }

  // ============================================================
  // Entrées
  // ============================================================
  bindInput() {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('globalpointermove', this.onGlobalMove);
    stage.on('pointerup', this.onPointerUp);
    stage.on('pointerupoutside', this.onPointerUp);
    stage.on('pointerdowncapture', this.onPointerDownCapture);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    this.mainViewport.on('drag-start', () => this.stopFollow());
    this.mainViewport.on('pinch-start', () => this.stopFollow());
  }

  onGlobalMove = (e) => {
    this.activeScene().onGlobalPointerMove(e);
    if (this.focus) return;
    const now = performance.now();
    if (now - this.lastMouseEmit > 40) {
      this.lastMouseEmit = now;
      const w = this.mainViewport.toWorld(e.global.x, e.global.y);
      this.socket.emit('mouse_move', { roomId: this.roomId, x: w.x, y: w.y });
    }
  };

  onPointerUp = (e) => {
    this.main?.onPointerUp(e);
    this.focus?.scene.onPointerUp(e);
  };

  // Alt + clic : un "ping" visible par tout le monde à cet endroit.
  onPointerDownCapture = (e) => {
    if (!e.altKey || e.button !== 0 || this.focus) return;
    e.stopPropagation();
    const w = this.mainViewport.toWorld(e.global.x, e.global.y);
    this.socket.emit('map_ping', { roomId: this.roomId, x: w.x, y: w.y });
    this.cursors.ping(w.x, w.y, this.profile.color);
    this.sfx.ping();
  };

  onBlur = () => {
    this.main?.onPointerUp(null);
    this.focus?.scene.onPointerUp(null);
  };

  onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const center = this.mainViewport.center;
    this.app.renderer.resize(w, h);
    this.app.stage.hitArea = this.app.screen;
    this.mainViewport.resize(w, h);
    this.mainViewport.moveCenter(center.x, center.y);
    if (this.focus) {
      const fc = this.focus.viewport.center;
      this.focus.viewport.resize(w, h);
      this.focus.viewport.moveCenter(fc.x, fc.y);
      this.drawVeil();
    }
    this.markDirty();
  };

  freezeInput(frozen) {
    this.inputFrozen = frozen;
    if (frozen) {
      this.main?.cancelLocalDrag();
      this.focus?.scene.cancelLocalDrag();
    }
  }

  fitView() {
    if (this.focus && !this.focus.peek) this.focus.scene.fitTable({ animate: true, safe: this.focusSafeArea() });
    else this.main?.fitTable({ animate: true, safe: this.safeArea() });
  }

  // ============================================================
  // Réglages venant de React
  // ============================================================
  setSettings(next) {
    const prev = this.settings;
    this.settings = { ...next };
    if (!this.main) return;
    if (prev.lockMode !== next.lockMode) {
      this.main.setLockedGroupId(next.lockMode === 'locked' ? LOCKED : null);
      this.cancelHint({ silent: true });
    }
    if (prev.showFrame !== next.showFrame) this.main.setFrameVisible(next.showFrame !== false);
    if (prev.ghostImage !== next.ghostImage) {
      this.main.setGhost(this.ghostTexture, !!next.ghostImage);
      this.focus?.scene.setGhost(this.focus.ghost, !!next.ghostImage);
    }
    if (prev.showSeams !== next.showSeams) this.rebake();
    this.updateHintAvailability();
  }

  setPrefs(next) {
    const prev = this.prefs;
    this.prefs = { ...next };
    if (!this.app) return;
    const quality = resolveQuality(next.quality);
    if (quality !== this.quality) {
      this.quality = quality;
      const preset = QUALITY_PRESETS[quality];
      this.renderLoop.setFpsCap(preset.fpsCap);
      const resolution = Math.min(window.devicePixelRatio || 1, preset.resolutionCap);
      if (this.app.renderer.resolution !== resolution) {
        this.app.renderer.resolution = resolution;
        this.app.renderer.resize(window.innerWidth, window.innerHeight);
      }
      this.main?.setShadows(preset.shadows);
      this.focus?.scene.setShadows(preset.shadows);
      this.rebake();
    }
    if (prev.cursorScale !== next.cursorScale) {
      this.cursors?.setScale(this.cursorScale());
      this.updateOwnCursor();
    } else if (prev.showOwnCursor !== next.showOwnCursor) {
      this.updateOwnCursor();
    }
    this.markDirty();
  }

  // Taille des curseurs à l'écran (préférence perso, ×0,6 à ×2,5).
  cursorScale() {
    const s = Number(this.prefs.cursorScale);
    return Number.isFinite(s) ? Math.min(2.5, Math.max(0.6, s)) : 1;
  }

  setPlayers(players) {
    this.players = players;
    this.cursors?.setPlayers(players, this.socket.id);
    if (this.followSocketId) {
      const target = players.find((p) => p.socketId === this.followSocketId);
      if (!target || target.inFocus) this.stopFollow();
    }
  }

  setMembers(members) {
    this.members = members || {};
  }

  setProfile(profile) {
    const prev = this.profile;
    this.profile = { ...profile };
    if (prev.cursorShape !== profile.cursorShape || prev.cursorImage !== profile.cursorImage || prev.color !== profile.color) {
      this.updateOwnCursor();
    }
  }

  memberName(memberId) {
    return this.members?.[memberId]?.pseudo || null;
  }

  // Mon curseur perso visible pour moi aussi (même image que chez les autres).
  updateOwnCursor() {
    if (!this.app) return;
    const token = ++this.cursorToken;
    const apply = (css) => {
      if (token !== this.cursorToken || this.destroyed) return;
      const events = this.app.renderer.events;
      events.cursorStyles.default = css || 'crosshair';
      events.cursorStyles.pointer = css || 'pointer';
      this.app.view.style.cursor = css || 'crosshair';
    };
    if (this.prefs.showOwnCursor === false) { apply(null); return; }
    const p = this.profile;
    // Les navigateurs refusent les curseurs de plus de 128 px.
    const scale = this.cursorScale();
    const size = Math.max(16, Math.min(128, Math.round(32 * scale)));
    const half = Math.round(size / 2);
    if (p.cursorShape === 'image' && p.cursorImage) {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const s = Math.min(size / img.width, size / img.height);
        c.getContext('2d').drawImage(img, (size - img.width * s) / 2, (size - img.height * s) / 2, img.width * s, img.height * s);
        apply(`url(${c.toDataURL('image/png')}) ${half} ${half}, auto`);
      };
      img.onerror = () => apply(null);
      img.src = p.cursorImage;
      return;
    }
    try {
      const g = new PIXI.Graphics();
      const isArrow = p.cursorShape === 'arrow';
      const tip = Math.round(3 * (size / 32));
      getCursorShape(p.cursorShape).draw(g, parseInt((p.color || '#5b8cff').slice(1), 16));
      g.scale.set(size / 32);
      g.position.set(isArrow ? tip : half, isArrow ? tip : half);
      const rt = PIXI.RenderTexture.create({ width: size, height: size });
      this.app.renderer.render(g, { renderTexture: rt, clear: true });
      const url = this.app.renderer.extract.canvas(rt).toDataURL('image/png');
      rt.destroy(true);
      g.destroy();
      apply(`url(${url}) ${isArrow ? `${tip} ${tip}` : `${half} ${half}`}, auto`);
    } catch {
      apply(null);
    }
  }

  // ============================================================
  // Temps réel
  // ============================================================
  bindSocket() {
    const on = (event, handler) => {
      const wrapped = (payload) => {
        if (this.destroyed) return;
        try { handler(payload || {}); } catch (err) { console.error(`[${event}]`, err); }
      };
      this.socket.on(event, wrapped);
      this.listeners.push([event, wrapped]);
    };

    on('pieces_moved', (data) => {
      this.main.applyRemoteMove(data);
      const placed = data.updates.filter((u) => u.groupId === LOCKED).length;
      if (placed && this.settings.lockMode === 'locked') this.cb.onRemotePlacement?.({ memberId: data.memberId, count: placed });
      this.afterChange();
    });
    on('held_changed', (data) => { this.main.applyHeld(data); this.afterChange(); });
    on('group_dragged', (data) => this.main.applyRemoteDrag(data));
    on('holds_reset', () => {
      this.main.cancelLocalDrag();
      this.main.releaseAllRemoteLifts();
    });
    on('grab_denied', ({ by }) => {
      if (this.main.cancelLocalDrag()) {
        this.sfx.deny();
        this.cb.onToast?.({ text: `${this.memberName(by) || 'Quelqu’un'} tient déjà ce morceau.` });
      }
    });
    on('pieces_sync', (data) => this.onPiecesSync(data));
    on('credits_changed', ({ placedBy }) => {
      for (const [id, memberId] of Object.entries(placedBy || {})) this.placedBy.set(id, memberId);
      this.emitCounts();
    });
    on('other_mouse_moved', ({ userId, x, y }) => this.cursors.move(userId, x, y));
    on('cursor_hidden', ({ socketId }) => this.cursors.hide(socketId));
    on('player_left', ({ socketId }) => {
      this.cursors.remove(socketId);
      if (this.followSocketId === socketId) this.stopFollow();
    });
    on('map_ping', ({ x, y, color }) => {
      this.cursors.ping(x, y, color);
      this.sfx.ping();
    });
    on('focus_update', (data) => this.onFocusUpdate(data));
    on('focus_started', (data) => this.openFocus(data.focus, data.pieces));
    on('focus_ended', (data) => this.closeFocus(data));
    on('focus_error', ({ reason }) => {
      this.focusStarting = false;
      this.emitFocusState();
      this.cb.onToast?.({ text: reason === 'no_area' ? 'Plus aucune zone libre pour un focus : tout est déjà placé ou réservé.' : 'La partie est déjà terminée.' });
    });
    on('hint_response', (data) => this.onHintResponse(data));
    on('hint_cancelled', (data) => this.onHintCancelled(data));
    on('edges_response', (data) => this.onEdgesResponse(data));
    on('puzzle_completed', (data) => {
      this.sfx.win();
      this.main.burstAt(this.frame.x + this.frame.w / 2, this.frame.y + this.frame.h / 2, { count: 80, spread: 3 });
      this.cb.onCompleted?.(data);
    });
    on('room_resync', (payload) => this.applyResync(payload));
  }

  onPiecesSync({ pieces, animate, reason, by, byPseudo }) {
    this.main.applySync(pieces, { animate });
    for (const [id, s] of Object.entries(pieces)) if (s.placedBy) this.placedBy.set(id, s.placedBy);
    this.emitCounts();
    if (reason === 'tidy') this.cb.onToast?.({ text: `${byPseudo || this.memberName(by) || 'Quelqu’un'} a rangé la table.` });
    if (reason === 'focus_complete') {
      const ids = Object.keys(pieces);
      let x = 0;
      let y = 0;
      for (const id of ids) {
        const s = this.pieceSize(pieces[id]);
        x += pieces[id].x + s.w / 2;
        y += pieces[id].y + s.h / 2;
      }
      if (ids.length) this.main.burstAt(x / ids.length, y / ids.length);
      this.cb.onToast?.({ text: `${this.memberName(by) || 'Ton coéquipier'} a terminé sa zone de focus !` });
    }
    this.afterChange();
  }

  applyResync(payload) {
    if (!this.main) { this.pendingResync = payload; return; }
    this.main.cancelLocalDrag();
    this.main.releaseAllRemoteLifts();
    this.main.applySync(payload.pieces, { animate: false });
    this.placedBy.clear();
    for (const [id, p] of Object.entries(payload.pieces)) if (p.placedBy) this.placedBy.set(id, p.placedBy);
    for (const h of payload.held || []) this.main.applyHeld({ pieceIds: h.pieceIds, held: true, socketId: h.socketId });
    this.zones = new Map((payload.focuses || []).map((f) => [f.memberId, f]));
    this.main.setZones([...this.zones.values()]);
    if (payload.myFocus && !this.focus) this.openFocus(payload.myFocus, payload.pieces);
    else if (!payload.myFocus && this.focus) this.destroyFocus();
    this.emitCounts();
    this.afterChange();
  }

  afterChange() {
    this.checkHintFulfilled();
    this.updateHintAvailability();
    if (this.focus) this.emitFocusState();
  }

  emitCounts() {
    const counts = {};
    for (const memberId of this.placedBy.values()) counts[memberId] = (counts[memberId] || 0) + 1;
    const key = JSON.stringify(counts);
    if (key === this.lastCountsKey) return;
    this.lastCountsKey = key;
    this.cb.onCountsChange?.(counts);
  }

  // ============================================================
  // Pièces : actions locales relayées au serveur
  // ============================================================
  onLocalGrab(scene, pieces) {
    this.sfx.pickup();
    this.stopFollow();
    if (scene.kind === 'main') {
      this.pendingDrag = null;
      this.lastDragEmit = performance.now();
      this.socket.emit('grab', { roomId: this.roomId, pieceIds: pieces.map((p) => p.id) });
    }
  }

  onLocalDragMove(scene, dx, dy) {
    if (scene.kind !== 'main') return;
    const now = performance.now();
    if (now - this.lastDragEmit >= 33) {
      this.lastDragEmit = now;
      this.pendingDrag = null;
      this.socket.emit('drag', { roomId: this.roomId, dx, dy });
    } else {
      this.pendingDrag = { dx, dy };
    }
  }

  onLocalDrop(scene, updates, info) {
    if (scene.kind === 'main') {
      this.pendingDrag = null;
      this.socket.emit('drop', { roomId: this.roomId, updates });
    } else {
      const work = updates.filter((u) => !scene.pieces.get(u.id)?.context);
      this.socket.emit('focus_move', { roomId: this.roomId, updates: work });
    }
    if (info.locked) {
      this.sfx.lock();
      scene.flashAt(info.at.x, info.at.y, 0xffd84a);
    } else if (info.snapped) {
      this.sfx.snap();
      scene.flashAt(info.at.x, info.at.y);
    } else {
      this.sfx.drop();
    }
    this.afterChange();
  }

  tidyTable() {
    this.socket.emit('tidy_table', { roomId: this.roomId });
  }

  // ============================================================
  // Coop : aller voir / suivre un joueur
  // ============================================================
  goToPlayer(socketId) {
    const pos = this.cursors?.positionOf(socketId);
    if (!pos) {
      this.cb.onToast?.({ text: 'Son curseur n’est pas visible pour l’instant.' });
      return;
    }
    this.stopFollow();
    this.main.lookAt(pos.x, pos.y, { time: 500 });
  }

  followPlayer(socketId) {
    if (!this.cursors?.positionOf(socketId) || this.focus) {
      this.cb.onToast?.({ text: 'Impossible de suivre ce joueur pour l’instant.' });
      return;
    }
    this.followSocketId = socketId;
    this.cb.onFollowChange?.(socketId);
    this.markDirty();
  }

  stopFollow() {
    if (!this.followSocketId) return;
    this.followSocketId = null;
    this.cb.onFollowChange?.(null);
  }

  // ============================================================
  // Aide
  // ============================================================
  setHint(next) {
    this.hint = next;
    this.cb.onHintState?.({ status: next.status, level: next.level || 0, context: next.context || 'main' });
  }

  updateHintAvailability() {
    const scene = this.activeScene();
    if (!scene) return;
    let available = true;
    let reason = null;
    if (!scene.lockedGroupId && scene.computeHintCandidates().length === 0) {
      available = false;
      reason = 'Assemble au moins deux pièces pour pouvoir demander de l’aide.';
    }
    const key = `${available}|${reason}`;
    if (key === this.lastHintKey) return;
    this.lastHintKey = key;
    this.cb.onHintAvailability?.({ available, reason });
  }

  startHintPicking() {
    if (this.hint.status !== 'idle') return;
    const scene = this.activeScene();
    const candidates = scene.computeHintCandidates();
    if (!candidates.length) {
      this.cb.onToast?.({ text: scene.lockedGroupId ? 'Tout est déjà en place ici !' : 'Assemble au moins deux pièces pour pouvoir demander de l’aide.' });
      return;
    }
    scene.showHintCandidates(candidates, (cand) => this.pickHint(scene, cand));
    this.setHint({ status: 'picking', context: scene.kind });
    // Si aucune case proposée n'est à l'écran, la caméra va en montrer une.
    scene.ensureVisible(candidates
      .map((c) => {
        const slot = scene.slotPosition(c.pieceId, c.anchorPieceId);
        const p = scene.pieces.get(c.pieceId);
        return slot && p ? { x: slot.x + p.w / 2, y: slot.y + p.h / 2 } : null;
      })
      .filter(Boolean));
  }

  pickHint(scene, cand) {
    scene.clearHintCandidates();
    this.socket.emit('hint_request', { roomId: this.roomId, pieceId: cand.pieceId, level: 1, context: scene.kind === 'focus' ? 'focus' : 'main' });
    this.setHint({ status: 'pending', pieceId: cand.pieceId, anchorPieceId: cand.anchorPieceId, level: 0, context: scene.kind });
  }

  requestMoreHint() {
    const h = this.hint;
    if (h.status !== 'granted' || h.level >= 3) return;
    this.socket.emit('hint_request', { roomId: this.roomId, pieceId: h.pieceId, level: h.level + 1, context: h.context === 'focus' ? 'focus' : 'main' });
    this.setHint({ ...h, status: 'pending' });
  }

  cancelHint({ silent = false } = {}) {
    if (this.hint.status === 'idle') return;
    if (!silent) this.socket.emit('hint_cancel', { roomId: this.roomId });
    this.main?.clearHintOverlays();
    this.focus?.scene.clearHintOverlays();
    this.setHint({ status: 'idle' });
  }

  hintScene() {
    return this.hint.context === 'focus' ? this.focus?.scene : this.main;
  }

  checkHintFulfilled() {
    const h = this.hint;
    if (h.status !== 'granted' && h.status !== 'pending') return;
    const scene = this.hintScene();
    if (!scene || scene.isHintFulfilled(h.pieceId, h.anchorPieceId)) this.cancelHint();
  }

  onHintResponse({ pieceId, level, accepted, reason, by, auto }) {
    const h = this.hint;
    if (h.status !== 'pending' || h.pieceId !== pieceId) return;
    if (!accepted) {
      if (h.level > 0) this.setHint({ ...h, status: 'granted' });
      else this.cancelHint({ silent: true });
      this.cb.onToast?.({ text: reason === 'timeout' ? 'Pas de réponse de ton coéquipier pour l’instant.' : `${by || 'Ton coéquipier'} n’est pas disponible là tout de suite.` });
      return;
    }
    const scene = this.hintScene();
    if (!scene) return;
    this.setHint({ ...h, status: 'granted', level });
    scene.showHintShape(pieceId, h.anchorPieceId);
    const center = scene.pieceCenter(pieceId);
    if (level === 1) {
      const slot = scene.slotPosition(pieceId, h.anchorPieceId);
      const q = scene.pieces.get(pieceId);
      if (slot && q) scene.ensureVisible([{ x: slot.x + q.w / 2, y: slot.y + q.h / 2 }]);
    }
    if (level === 2 && center) {
      const angle = Math.random() * Math.PI * 2;
      const mag = (Math.min(scene.viewport.screenWidth, scene.viewport.screenHeight) / scene.viewport.scale.x) * 0.22;
      scene.lookAt(center.x + Math.cos(angle) * mag, center.y + Math.sin(angle) * mag);
    }
    if (level === 3 && center) {
      scene.showHintRing(pieceId, h.anchorPieceId);
      scene.lookAt(center.x, center.y);
    }
    if (auto && level === 1) this.cb.onToast?.({ text: 'Tu es seul : l’aide est accordée directement.' });
    this.sfx.hint();
  }

  onHintCancelled({ pieceId, reason }) {
    if (this.hint.pieceId !== pieceId) return;
    this.cancelHint({ silent: true });
    if (reason === 'focus') this.cb.onToast?.({ text: 'Cette pièce vient d’être réservée par un focus.' });
  }

  // ============================================================
  // Pièces de bord : on les demande à l'autre, qui en dévoile 3 au plus.
  // ============================================================
  setEdges(next) {
    this.edges = next;
    this.cb.onEdgesState?.({ status: next.status, count: next.count || 0 });
  }

  requestEdges() {
    if (this.edges.status === 'pending') return;
    const scene = this.activeScene();
    this.main?.clearEdgeHighlights();
    this.focus?.scene.clearEdgeHighlights();
    this.socket.emit('edges_request', { roomId: this.roomId, context: scene.kind === 'focus' ? 'focus' : 'main' });
    this.setEdges({ status: 'pending', context: scene.kind });
  }

  cancelEdges() {
    if (this.edges.status === 'idle') return;
    if (this.edges.status === 'pending') this.socket.emit('edges_cancel', { roomId: this.roomId });
    this.main?.clearEdgeHighlights();
    this.focus?.scene.clearEdgeHighlights();
    this.setEdges({ status: 'idle' });
  }

  onEdgesResponse({ accepted, pieceIds, reason, by, auto }) {
    if (this.edges.status !== 'pending') return;
    const scene = this.edges.context === 'focus' ? this.focus?.scene : this.main;
    if (!accepted || !scene) {
      this.setEdges({ status: 'idle' });
      if (reason === 'none') this.cb.onToast?.({ text: 'Plus aucune pièce de bord à trouver ici !' });
      else if (reason === 'timeout') this.cb.onToast?.({ text: 'Pas de réponse de ton coéquipier pour l’instant.' });
      else if (scene) this.cb.onToast?.({ text: `${by || 'Ton coéquipier'} préfère te laisser chercher les bords.` });
      return;
    }
    const centers = scene.showEdgeHighlights(pieceIds, 30000).filter(Boolean);
    scene.ensureVisible(centers);
    this.setEdges({ status: 'shown', context: this.edges.context, count: centers.length });
    if (auto) this.cb.onToast?.({ text: `Tu es seul : ${centers.length} pièce(s) de bord mise(s) en évidence.` });
    this.sfx.hint();
  }

  // Appelé par une scène quand ses mises en évidence ont toutes disparu.
  onEdgeHighlightsDone() {
    if (this.edges.status === 'shown') this.setEdges({ status: 'idle' });
  }

  // ============================================================
  // Focus
  // ============================================================
  startFocus(size) {
    if (this.focus || this.focusStarting) return;
    this.focusStarting = true;
    this.emitFocusState();
    const safe = this.focusSafeArea();
    this.socket.emit('focus_start', { roomId: this.roomId, size, aspect: safe.w / safe.h });
  }

  quitFocus() {
    if (this.focus) this.socket.emit('focus_end', { roomId: this.roomId });
  }

  setFocusPeek(peek) {
    if (!this.focus || this.focus.peek === peek) return;
    this.focus.peek = peek;
    this.focus.veil.visible = !peek;
    this.focus.viewport.visible = !peek;
    this.focus.scene.onPointerUp(null);
    this.emitFocusState();
    this.markDirty();
  }

  drawVeil() {
    const g = this.focus.veil;
    g.clear();
    g.beginFill(0x07080b, 0.5);
    g.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    g.endFill();
  }

  openFocus(focus, pieces) {
    if (this.focus) this.destroyFocus();
    this.focusStarting = false;
    if (this.hint.context === 'main') this.cancelHint();
    if (this.edges.status !== 'idle' && this.edges.context !== 'focus') this.cancelEdges();
    this.stopFollow();
    this.main.cancelLocalDrag();
    this.main.setHidden(focus.pieceIds, true);

    const viewport = this.createViewport();
    const veil = new PIXI.Graphics();
    veil.eventMode = 'static';
    // Ordre : grande room < voile < mini-room < curseurs des autres.
    const below = this.app.stage.getChildIndex(this.cursorLayer);
    this.app.stage.addChildAt(veil, below);
    this.app.stage.addChildAt(viewport, below + 1);
    this.cursors.setDimmed(true);
    this.renderLoop.addViewport(viewport);

    const { pw, ph } = this.metrics;
    const { cols, rows } = this.room;
    const lockedGroupId = this.settings.lockMode === 'locked' ? `F:${this.myMemberId}` : null;
    const scene = new BoardScene(this, {
      viewport,
      kind: 'focus',
      frame: focus.miniFrame,
      table: focus.table,
      lockedGroupId,
      metrics: this.metrics,
      atlas: this.atlas,
      shadows: this.shadowsEnabled(),
    });
    const { c0, r0, c1, r1 } = focus.rect;
    for (const id of focus.pieceIds) {
      const p = pieces[id];
      if (!p) continue;
      const [bx, by] = this.pieceBox(p);
      scene.addPiece({
        id, c: p.c, r: p.r, shape: p.shape,
        x: p.fx ?? 0, y: p.fy ?? 0, groupId: p.groupId,
        tx: (bx - c0) * pw, ty: (by - r0) * ph, box: this.pieceBox(p),
        ...this.pieceSize(p), adj: this.neighborIds(p), isEdge: this.isEdgePiece(p),
      });
    }
    for (const id of focus.contextIds || []) {
      const p = this.room.pieces[id] || pieces[id];
      const mp = this.main.pieces.get(id);
      if (!mp || !p) continue;
      const [bx, by] = this.pieceBox(p);
      const tx = (bx - c0) * pw;
      const ty = (by - r0) * ph;
      scene.addPiece({
        id, c: mp.c, r: mp.r, shape: mp.shape || p.shape, x: tx, y: ty, groupId: lockedGroupId || 'CONTEXT', tx, ty, box: this.pieceBox(p),
        ...this.pieceSize(p), adj: this.neighborIds(p), context: true,
      });
    }
    const gt = this.ghostTexture;
    const ghost = gt ? new PIXI.Texture(gt.baseTexture, new PIXI.Rectangle(
      (c0 / cols) * gt.width, (r0 / rows) * gt.height,
      ((c1 - c0 + 1) / cols) * gt.width, ((r1 - r0 + 1) / rows) * gt.height,
    )) : null;
    scene.setGhost(ghost, !!this.settings.ghostImage);

    this.focus = { scene, viewport, veil, data: focus, ghost, peek: false };
    this.drawVeil();
    this.mainViewport.pause = true;
    this.main.setInteractive(false);
    scene.fitTable({ safe: this.focusSafeArea() });
    this.socket.emit('cursor_hidden', { roomId: this.roomId });
    this.emitFocusState();
    this.updateHintAvailability();
    this.markDirty();
  }

  destroyFocus() {
    const f = this.focus;
    if (!f) return;
    if (this.hint.context === 'focus') this.cancelHint();
    if (this.edges.context === 'focus') this.cancelEdges();
    this.renderLoop.removeViewport(f.viewport);
    f.scene.destroy();
    f.viewport.destroy({ children: true });
    f.veil.destroy();
    f.ghost?.destroy(false);
    this.focus = null;
    this.cursors?.setDimmed(false);
    this.mainViewport.pause = false;
    this.main.setInteractive(true);
    this.emitFocusState();
    this.updateHintAvailability();
    this.markDirty();
  }

  // Fin du focus : les pièces "volent" de la mini-room vers leur place
  // dans la grande room (avec explosion de particules si la zone est finie).
  closeFocus({ reason, pieces }) {
    const f = this.focus;
    const starts = new Map();
    if (f && !f.peek) {
      for (const p of f.scene.pieces.values()) {
        if (p.context) continue;
        const s = f.viewport.toScreen(p.dispX, p.dispY);
        starts.set(p.id, this.mainViewport.toWorld(s.x, s.y));
      }
    }
    this.destroyFocus();
    const complete = reason === 'complete';
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const [id, s] of Object.entries(pieces || {})) {
      const p = this.main.pieces.get(id);
      if (!p) continue;
      p.hidden = false;
      p.x = s.x;
      p.y = s.y;
      this.main.setGroup(p, s.groupId);
      const start = starts.get(id);
      if (start) { p.dispX = start.x; p.dispY = start.y; }
      this.main.placeInLayer(p);
      this.main.refreshInteractivity(p);
      this.main.tweenTo(p, s.x, s.y, complete ? 950 : 650, { delay: Math.random() * 260, ease: easeInOutCubic });
      if (s.placedBy) this.placedBy.set(id, s.placedBy);
      cx += s.x + p.w / 2;
      cy += s.y + p.h / 2;
      n++;
    }
    if (complete) {
      this.sfx.boom();
      if (n) setTimeout(() => !this.destroyed && this.main.burstAt(cx / n, cy / n, { count: 60, spread: 2 }), 900);
      this.cb.onToast?.({ text: 'Zone terminée ! Elle rejoint la grande room.' });
    } else if (reason === 'mode_change') {
      this.cb.onToast?.({ text: 'Le mode d’assemblage a changé : ton focus a été rangé dans la grande room.' });
    } else if (reason === 'kicked' || reason === 'timeout') {
      this.cb.onToast?.({ text: 'Ton focus a été rangé dans la grande room.' });
    }
    this.emitCounts();
    this.afterChange();
  }

  onFocusUpdate(data) {
    if (data.memberId === this.myMemberId) return;
    if (data.active) {
      this.zones.set(data.memberId, data);
      this.main.setHidden(data.pieceIds || [], true);
      if (this.hint.status !== 'idle' && this.hint.context === 'main' && (data.pieceIds || []).includes(this.hint.pieceId)) this.cancelHint();
    } else {
      this.zones.delete(data.memberId);
    }
    this.main.setZones([...this.zones.values()]);
    this.afterChange();
  }

  emitFocusState() {
    if (!this.focus) {
      this.cb.onFocusState?.({ active: false, starting: this.focusStarting });
      return;
    }
    const scene = this.focus.scene;
    const work = [...scene.pieces.values()].filter((p) => !p.context);
    let placed = 0;
    if (scene.lockedGroupId) placed = work.filter((p) => p.groupId === scene.lockedGroupId).length;
    else {
      for (const set of scene.groups.values()) {
        const count = [...set].filter((p) => !p.context).length;
        if (count >= 2) placed = Math.max(placed, count);
      }
    }
    this.cb.onFocusState?.({ active: true, starting: false, placed, total: work.length, peek: this.focus.peek });
  }
}
