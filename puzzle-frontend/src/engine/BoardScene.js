// ============================================================
// Une "table" de puzzle dans une caméra (viewport) : la grande room,
// ou la mini-room d'un focus (deux instances de la même classe).
//
// Calques, du bas vers le haut :
//   cadre / filigrane · zones de focus · pièces fixées · ombres ·
//   pièces libres · effets · aide · groupe soulevé
// (les curseurs des autres joueurs vivent dans un calque à l'écran,
// au-dessus de tout : voir RemoteCursors)
//
// Modèle d'une pièce : position "monde" (x, y), taille de son cadre (w, h),
// pièces qui la touchent dans le puzzle fini (adj), groupe, cible (tx, ty)
// et position affichée (dispX, dispY) qui peut être en cours
// d'animation. Un groupe tenu en main (par moi ou un autre joueur) est
// déplacé d'un bloc via un conteneur : un seul calcul par image,
// même pour un bloc de 500 pièces.
// ============================================================
import * as PIXI from 'pixi.js';
import { tracePiecePath } from '../pieceGeometry';
import { computeSnap, snapThresholds, clampIntoBounds, expandRect } from './snapping';
import { pieceHitArea } from './atlas';

const SHADOW_ALPHA = 0.3;
const ACCENT = 0x5b8cff;

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hexColor(css, fallback = ACCENT) {
  if (typeof css !== 'string' || !/^#[0-9a-f]{6}$/i.test(css)) return fallback;
  return parseInt(css.slice(1), 16);
}

// Groupe soulevé : ses sprites passent dans un conteneur qu'on déplace
// (et qu'on agrandit un peu autour du point de prise) d'un seul bloc.
class LiftGroup {
  constructor(scene, pieces, { pivot = null, scale = 1 } = {}) {
    this.scene = scene;
    this.pieces = pieces;
    this.pivot = pivot || { x: 0, y: 0 };
    this.offset = { x: 0, y: 0 };
    this.container = new PIXI.Container();
    this.shadows = new PIXI.Container();
    for (const c of [this.container, this.shadows]) {
      c.pivot.set(this.pivot.x, this.pivot.y);
      c.position.set(this.pivot.x, this.pivot.y);
      c.scale.set(scale);
    }
    scene.liftShadowLayer.addChild(this.shadows);
    scene.liftLayer.addChild(this.container);
    for (const p of pieces) {
      p.lifted = true;
      this.container.addChild(p.sprite);
      this.shadows.addChild(p.shadow);
      p.shadow.visible = scene.shadowsEnabled && !p.hidden;
      scene.updateSpritePos(p);
    }
  }

  setOffset(x, y) {
    this.offset.x = x;
    this.offset.y = y;
    this.container.position.set(this.pivot.x + x, this.pivot.y + y);
    this.shadows.position.set(this.pivot.x + x, this.pivot.y + y);
  }

  // Position affichée actuelle d'une pièce du groupe (coordonnées monde).
  visualPos(p) {
    const s = this.container.scale.x;
    return {
      x: this.pivot.x + (p.dispX - this.pivot.x) * s + this.offset.x,
      y: this.pivot.y + (p.dispY - this.pivot.y) * s + this.offset.y,
    };
  }

  release() {
    for (const p of this.pieces) p.lifted = false;
    for (const p of this.pieces) {
      this.scene.placeInLayer(p);
      this.scene.updateSpritePos(p);
    }
    this.container.destroy({ children: false });
    this.shadows.destroy({ children: false });
  }
}

export class BoardScene {
  constructor(engine, { viewport, kind, frame, table, lockedGroupId, metrics, atlas, shadows }) {
    this.engine = engine;
    this.viewport = viewport;
    this.kind = kind;
    this.frame = frame;
    this.table = table;
    this.lockedGroupId = lockedGroupId;
    this.metrics = metrics;
    this.atlas = atlas;
    this.shadowsEnabled = shadows;
    this.interactive = true;
    this.edgeMarks = [];
    this.edgeMarksLeft = 0;
    this.frameVisible = true;
    this.thresholds = snapThresholds(metrics.unit);
    this.shadowRest = metrics.big * 0.035;
    this.shadowLift = metrics.big * 0.1;

    this.pieces = new Map();
    this.groups = new Map();
    this.remoteLifts = new Map();
    this.drag = null;
    this.tweens = new Set();
    this.effects = new Set();
    this.hint = { candidates: [], shape: null, ring: null, line: null, pieceId: null, anchorPieceId: null, t: 0 };

    this.root = new PIXI.Container();
    this.frameLayer = new PIXI.Container();
    this.zoneLayer = new PIXI.Container();
    this.lockedLayer = new PIXI.Container();
    this.shadowLayer = new PIXI.Container();
    this.looseLayer = new PIXI.Container();
    this.fxLayer = new PIXI.Container();
    this.hintLayer = new PIXI.Container();
    this.liftShadowLayer = new PIXI.Container();
    this.liftLayer = new PIXI.Container();
    this.root.addChild(
      this.frameLayer, this.zoneLayer, this.lockedLayer, this.shadowLayer, this.looseLayer,
      this.fxLayer, this.hintLayer, this.liftShadowLayer, this.liftLayer,
    );
    viewport.addChild(this.root);

    this.ghost = new PIXI.Sprite(PIXI.Texture.EMPTY);
    this.ghost.visible = false;
    this.ghost.alpha = 0.14;
    this.frameGfx = new PIXI.Graphics();
    this.frameLayer.addChild(this.ghost, this.frameGfx);
    this.drawFrame();
  }

  // ============================================================
  // Construction
  // ============================================================
  addPiece({
    id, c, r, shape, x, y, groupId, tx, ty, box = null,
    w = this.metrics.pw, h = this.metrics.ph, adj = [], isEdge = false, hidden = false, context = false,
  }) {
    const tex = this.atlas.textures.get(id);
    const sprite = new PIXI.Sprite(tex);
    const shadow = new PIXI.Sprite(tex);
    sprite.scale.set(1 / this.atlas.k);
    shadow.scale.set(1 / this.atlas.k);
    shadow.tint = 0x000000;
    shadow.alpha = SHADOW_ALPHA;
    sprite.hitArea = pieceHitArea(shape, this.metrics, this.atlas);
    sprite.cursor = 'pointer';
    const piece = {
      id, c, r, shape, x, y, w, h, box, adj, groupId, tx, ty, isEdge, hidden, context,
      sprite, shadow, heldBy: null, lifted: false, dispX: x, dispY: y, tween: null,
    };
    sprite.on('pointerdown', (e) => this.onPiecePointerDown(piece, e));
    this.pieces.set(id, piece);
    this.addToGroup(piece);
    this.placeInLayer(piece);
    this.updateSpritePos(piece);
    this.refreshInteractivity(piece);
    return piece;
  }

  setCulling(enabled) {
    for (const p of this.pieces.values()) {
      p.sprite.cullable = enabled;
      p.shadow.cullable = enabled;
    }
  }

  destroy() {
    this.cancelLocalDrag();
    this.edgeMarks = [];
    for (const fx of this.effects) fx.destroy();
    this.effects.clear();
    this.tweens.clear();
    this.root.destroy({ children: true });
  }

  // ============================================================
  // Groupes et calques
  // ============================================================
  addToGroup(p) {
    let set = this.groups.get(p.groupId);
    if (!set) { set = new Set(); this.groups.set(p.groupId, set); }
    set.add(p);
  }

  removeFromGroup(p) {
    const set = this.groups.get(p.groupId);
    if (!set) return;
    set.delete(p);
    if (!set.size) this.groups.delete(p.groupId);
  }

  setGroup(p, groupId) {
    if (p.groupId === groupId) return;
    this.removeFromGroup(p);
    p.groupId = groupId;
    this.addToGroup(p);
  }

  groupPieces(groupId) {
    return [...(this.groups.get(groupId) || [])];
  }

  groupSize(groupId) {
    return this.groups.get(groupId)?.size || 0;
  }

  isLocked(p) {
    return p.context || (!!this.lockedGroupId && p.groupId === this.lockedGroupId);
  }

  setLockedGroupId(groupId) {
    if (this.lockedGroupId === groupId) return;
    this.cancelLocalDrag();
    this.lockedGroupId = groupId;
    for (const p of this.pieces.values()) {
      this.placeInLayer(p);
      this.refreshInteractivity(p);
    }
    this.engine.markDirty();
  }

  placeInLayer(p) {
    if (p.lifted) return;
    const locked = this.isLocked(p);
    const layer = locked ? this.lockedLayer : this.looseLayer;
    if (p.sprite.parent !== layer) layer.addChild(p.sprite);
    if (p.shadow.parent !== this.shadowLayer) this.shadowLayer.addChild(p.shadow);
    p.sprite.visible = !p.hidden;
    p.shadow.visible = !p.hidden && !locked && this.shadowsEnabled;
  }

  bringToFront(pieces) {
    for (const p of pieces) {
      if (p.lifted || this.isLocked(p)) continue;
      this.looseLayer.addChild(p.sprite);
      this.shadowLayer.addChild(p.shadow);
    }
  }

  updateSpritePos(p) {
    const pad = this.atlas.pad;
    p.sprite.position.set(p.dispX - pad, p.dispY - pad);
    const so = p.lifted ? this.shadowLift : this.shadowRest;
    p.shadow.position.set(p.dispX - pad + so * 0.7, p.dispY - pad + so);
  }

  refreshInteractivity(p) {
    const locked = this.isLocked(p);
    p.sprite.alpha = 1;
    p.shadow.alpha = SHADOW_ALPHA;
    p.sprite.eventMode = this.interactive && !locked && !p.hidden && !p.heldBy ? 'static' : 'none';
  }

  refreshAll() {
    for (const p of this.pieces.values()) {
      this.placeInLayer(p);
      this.refreshInteractivity(p);
    }
    this.engine.markDirty();
  }

  setInteractive(on) {
    this.interactive = on;
    if (!on) this.cancelLocalDrag();
    for (const p of this.pieces.values()) this.refreshInteractivity(p);
  }

  setShadows(on) {
    this.shadowsEnabled = on;
    for (const p of this.pieces.values()) {
      if (p.lifted) p.shadow.visible = on && !p.hidden;
      else this.placeInLayer(p);
    }
    this.engine.markDirty();
  }

  setTextures(atlas) {
    this.atlas = atlas;
    for (const p of this.pieces.values()) {
      const tex = atlas.textures.get(p.id);
      p.sprite.texture = tex;
      p.shadow.texture = tex;
      p.sprite.scale.set(1 / atlas.k);
      p.shadow.scale.set(1 / atlas.k);
      p.sprite.hitArea = pieceHitArea(p.shape, this.metrics, atlas);
      this.updateSpritePos(p);
    }
    this.engine.markDirty();
  }

  // ============================================================
  // Cadre, filigrane, zones de focus des autres
  // ============================================================
  setFrameVisible(on) {
    this.frameVisible = on;
    this.drawFrame();
  }

  drawFrame() {
    const g = this.frameGfx;
    const { unit } = this.metrics;
    g.clear();
    if (this.kind === 'focus') {
      // Mini-table : une "fenêtre" presque opaque posée sur la grande room,
      // qui reste visible tout autour.
      const t = this.table;
      g.lineStyle(Math.max(2, unit * 0.035), 0x5b8cff, 0.35);
      g.beginFill(0x10131a, 0.86);
      g.drawRoundedRect(t.x, t.y, t.w, t.h, unit * 0.6);
      g.endFill();
    }
    if (this.frameVisible || this.kind === 'focus') {
      g.lineStyle(Math.max(2, unit * 0.035), 0xffffff, 0.26);
      g.drawRect(this.frame.x, this.frame.y, this.frame.w, this.frame.h);
    }
    this.engine.markDirty();
  }

  setGhost(texture, visible) {
    if (texture) {
      this.ghost.texture = texture;
      this.ghost.position.set(this.frame.x, this.frame.y);
      this.ghost.width = this.frame.w;
      this.ghost.height = this.frame.h;
    }
    this.ghost.visible = !!visible && !!texture;
    this.engine.markDirty();
  }

  setZones(zones) {
    for (const child of this.zoneLayer.removeChildren()) child.destroy({ children: true });
    const { pw, ph, unit } = this.metrics;
    for (const z of zones) {
      const color = hexColor(z.color);
      const x = this.frame.x + z.rect.c0 * pw;
      const y = this.frame.y + z.rect.r0 * ph;
      const w = (z.rect.c1 - z.rect.c0 + 1) * pw;
      const h = (z.rect.r1 - z.rect.r0 + 1) * ph;
      const box = new PIXI.Container();
      const g = new PIXI.Graphics();
      g.lineStyle(Math.max(2, unit * 0.04), color, 0.7);
      g.beginFill(color, 0.13);
      g.drawRoundedRect(x, y, w, h, unit * 0.12);
      g.endFill();
      const label = new PIXI.Text(`${z.pseudo} — focus`, {
        fontFamily: 'Manrope, sans-serif', fontSize: Math.max(14, unit * 0.32), fontWeight: '700',
        fill: 0xffffff, stroke: 0x0e0f12, strokeThickness: Math.max(3, unit * 0.06),
      });
      label.resolution = 2;
      label.position.set(x + unit * 0.15, y + unit * 0.1);
      box.addChild(g, label);
      this.zoneLayer.addChild(box);
    }
    this.engine.markDirty();
  }

  setHidden(ids, hidden) {
    for (const id of ids) {
      const p = this.pieces.get(id);
      if (!p || p.hidden === hidden) continue;
      if (hidden && this.drag?.group.includes(p)) this.cancelLocalDrag();
      p.hidden = hidden;
      this.placeInLayer(p);
      this.refreshInteractivity(p);
    }
    this.engine.markDirty();
  }

  // ============================================================
  // Glisser-déposer local
  // ============================================================
  onPiecePointerDown(p, e) {
    if (!this.interactive || this.drag || e.button !== 0 || this.engine.inputFrozen) return;
    const group = this.groupPieces(p.groupId);
    if (group.some((q) => q.heldBy || q.hidden || this.isLocked(q))) return;
    e.stopPropagation();
    for (const q of group) this.finishTween(q);
    const world = this.viewport.toWorld(e.global);
    const lift = new LiftGroup(this, group, { pivot: world, scale: 1.03 });
    this.drag = { group, lift, start: world, dx: 0, dy: 0, lastScreen: { x: e.global.x, y: e.global.y }, pointerId: e.pointerId };
    this.engine.onLocalGrab(this, group);
    this.engine.markDirty();
  }

  onGlobalPointerMove(e) {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.drag.lastScreen = { x: e.global.x, y: e.global.y };
    this.updateDrag();
  }

  updateDrag() {
    const d = this.drag;
    const w = this.viewport.toWorld(d.lastScreen.x, d.lastScreen.y);
    d.dx = w.x - d.start.x;
    d.dy = w.y - d.start.y;
    d.lift.setOffset(d.dx, d.dy);
    this.engine.onLocalDragMove(this, d.dx, d.dy);
    this.engine.markDirty();
  }

  onPointerUp(e) {
    if (this.drag && (e == null || e.pointerId === this.drag.pointerId)) this.dropDrag();
  }

  // Caméra qui suit quand on traîne un bloc contre le bord de l'écran.
  edgePan(dt) {
    const d = this.drag;
    const { x, y } = d.lastScreen;
    const w = this.viewport.screenWidth;
    const h = this.viewport.screenHeight;
    const M = 56;
    let px = 0;
    let py = 0;
    if (x < M) px = -(1 - x / M);
    else if (x > w - M) px = (x - (w - M)) / M;
    if (y < M) py = -(1 - y / M);
    else if (y > h - M) py = (y - (h - M)) / M;
    if (!px && !py) return false;
    const step = (700 / this.viewport.scale.x) * (dt / 1000);
    this.viewport.moveCenter(this.viewport.center.x + px * step, this.viewport.center.y + py * step);
    this.updateDrag();
    return true;
  }

  dropDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const { group, lift } = d;
    const moving = group.map((p) => ({ p, x: p.x + d.dx, y: p.y + d.dy }));
    const corr = clampIntoBounds(moving, expandRect(this.table, 0.15));
    for (const m of moving) { m.x += corr.dx; m.y += corr.dy; }

    const movingGroupId = group[0].groupId;
    const snap = computeSnap({
      moving,
      movingGroupId,
      lockedGroupId: this.lockedGroupId,
      neighborsOf: (q) => this.neighborsOf(q),
      isAvailable: (q) => !q.hidden && !q.heldBy && !q.context,
      groupAvailable: (gid) => this.groupPieces(gid).every((q) => !q.hidden && !q.heldBy && !q.lifted),
      thresholds: this.thresholds,
    });

    const visual = new Map(group.map((p) => [p, lift.visualPos(p)]));
    lift.release();

    const targetGroupId = snap ? snap.groupId : movingGroupId;
    const updates = [];
    let cx = 0;
    let cy = 0;
    for (const m of moving) {
      const nx = m.x + (snap ? snap.dx : 0);
      const ny = m.y + (snap ? snap.dy : 0);
      m.p.x = nx;
      m.p.y = ny;
      this.setGroup(m.p, targetGroupId);
      const v = visual.get(m.p);
      m.p.dispX = v.x;
      m.p.dispY = v.y;
      this.tweenTo(m.p, nx, ny, snap ? 110 : 80);
      updates.push({ id: m.p.id, x: nx, y: ny, groupId: targetGroupId });
      cx += nx + m.p.w / 2;
      cy += ny + m.p.h / 2;
    }
    if (snap) {
      for (const merge of snap.merges) {
        for (const q of this.groupPieces(merge.groupId)) {
          q.x += merge.dx;
          q.y += merge.dy;
          this.setGroup(q, targetGroupId);
          this.tweenTo(q, q.x, q.y, 110);
          updates.push({ id: q.id, x: q.x, y: q.y, groupId: targetGroupId });
        }
      }
    }
    for (const u of updates) this.placeInLayer(this.pieces.get(u.id));
    this.bringToFront(group);
    this.engine.onLocalDrop(this, updates, {
      snapped: !!snap,
      locked: !!snap?.locked,
      at: { x: cx / moving.length, y: cy / moving.length },
      groupId: targetGroupId,
    });
    this.engine.markDirty();
  }

  // Annule le glissé en cours (prise refusée, changement de mode...) :
  // le bloc revient en douceur à sa place d'avant.
  cancelLocalDrag() {
    const d = this.drag;
    if (!d) return false;
    this.drag = null;
    const visual = new Map(d.group.map((p) => [p, d.lift.visualPos(p)]));
    d.lift.release();
    for (const p of d.group) {
      const v = visual.get(p);
      p.dispX = v.x;
      p.dispY = v.y;
      this.tweenTo(p, p.x, p.y, 220);
    }
    this.engine.markDirty();
    return true;
  }

  // ============================================================
  // Mouvements des autres joueurs
  // ============================================================
  applyHeld({ pieceIds, held, socketId, positions }) {
    if (held) {
      this.releaseRemoteLift(socketId, null);
      const pieces = pieceIds.map((id) => this.pieces.get(id)).filter((p) => p && !p.hidden);
      if (!pieces.length) return;
      if (this.drag && pieces.some((p) => this.drag.group.includes(p))) this.cancelLocalDrag();
      for (const p of pieces) {
        this.finishTween(p);
        p.heldBy = socketId;
        this.refreshInteractivity(p);
      }
      const lift = new LiftGroup(this, pieces, { scale: 1.02 });
      this.remoteLifts.set(socketId, { lift, pieces, target: { x: 0, y: 0 }, cur: { x: 0, y: 0 } });
    } else {
      const handled = this.releaseRemoteLift(socketId, positions || null);
      for (const id of pieceIds) {
        const p = this.pieces.get(id);
        if (!p || handled.has(id)) continue;
        p.heldBy = null;
        this.refreshInteractivity(p);
      }
    }
    this.engine.markDirty();
  }

  applyRemoteDrag({ socketId, dx, dy }) {
    const rl = this.remoteLifts.get(socketId);
    if (!rl) return;
    rl.target = { x: dx, y: dy };
    this.engine.markDirty();
  }

  // Repose le groupe tenu par un autre joueur, à ses positions finales si
  // on les connaît, sinon à sa position d'avant + dernier déplacement reçu.
  releaseRemoteLift(socketId, updates) {
    const handled = new Set();
    const rl = this.remoteLifts.get(socketId);
    if (!rl) return handled;
    this.remoteLifts.delete(socketId);
    const visual = new Map(rl.pieces.map((p) => [p, rl.lift.visualPos(p)]));
    rl.lift.release();
    const byId = new Map((updates || []).map((u) => [u.id, u]));
    for (const p of rl.pieces) {
      p.heldBy = null;
      const u = byId.get(p.id);
      if (u) {
        p.x = u.x;
        p.y = u.y;
        if (u.groupId) this.setGroup(p, u.groupId);
      } else {
        p.x += rl.target.x;
        p.y += rl.target.y;
      }
      const v = visual.get(p);
      p.dispX = v.x;
      p.dispY = v.y;
      this.tweenTo(p, p.x, p.y, 140);
      this.placeInLayer(p);
      this.refreshInteractivity(p);
      handled.add(p.id);
    }
    this.bringToFront(rl.pieces);
    return handled;
  }

  releaseAllRemoteLifts() {
    for (const socketId of [...this.remoteLifts.keys()]) this.releaseRemoteLift(socketId, null);
  }

  applyRemoteMove({ updates, socketId }) {
    const handled = this.releaseRemoteLift(socketId, updates);
    const moved = [];
    for (const u of updates) {
      const p = this.pieces.get(u.id);
      if (!p || handled.has(u.id)) continue;
      if (this.drag?.group.includes(p)) this.cancelLocalDrag();
      p.x = u.x;
      p.y = u.y;
      this.setGroup(p, u.groupId);
      this.tweenTo(p, u.x, u.y, 160);
      this.placeInLayer(p);
      this.refreshInteractivity(p);
      moved.push(p);
    }
    this.bringToFront(moved);
    this.engine.markDirty();
  }

  // État imposé par le serveur (changement de mode, rangement, fin de focus...).
  applySync(pieces, { animate = false } = {}) {
    for (const [id, s] of Object.entries(pieces)) {
      const p = this.pieces.get(id);
      if (!p) continue;
      if (this.drag?.group.includes(p)) this.cancelLocalDrag();
      const wasHidden = p.hidden;
      const hidden = !!s.focus;
      p.x = s.x;
      p.y = s.y;
      this.setGroup(p, s.groupId);
      p.hidden = hidden;
      if (wasHidden && !hidden) {
        p.dispX = s.x;
        p.dispY = s.y - this.metrics.big * 0.4;
        this.tweenTo(p, s.x, s.y, 420, { delay: Math.random() * 160, fade: true });
      } else if (animate && !hidden) {
        this.tweenTo(p, s.x, s.y, 650, { delay: Math.random() * 140, ease: easeInOutCubic });
      } else {
        this.tweenTo(p, s.x, s.y, 0);
      }
      this.placeInLayer(p);
      this.refreshInteractivity(p);
    }
    this.engine.markDirty();
  }

  // ============================================================
  // Animations
  // ============================================================
  tweenTo(p, x, y, dur, { delay = 0, ease = easeOutCubic, fade = false } = {}) {
    const wasFading = !!p.tween?.fade;
    if (dur <= 0) {
      p.tween = null;
      this.tweens.delete(p);
      p.dispX = x;
      p.dispY = y;
      if (wasFading) this.refreshInteractivity(p);
      this.updateSpritePos(p);
      this.engine.markDirty();
      return;
    }
    p.tween = { fromX: p.dispX, fromY: p.dispY, toX: x, toY: y, t: -delay, dur, ease, fade };
    if (fade) p.sprite.alpha = 0;
    else if (wasFading) this.refreshInteractivity(p);
    this.tweens.add(p);
    this.engine.markDirty();
  }

  finishTween(p) {
    if (!p.tween) return;
    p.dispX = p.tween.toX;
    p.dispY = p.tween.toY;
    if (p.tween.fade) this.refreshInteractivity(p);
    p.tween = null;
    this.tweens.delete(p);
    this.updateSpritePos(p);
  }

  flashAt(x, y, color = 0xffffff) {
    const g = new PIXI.Graphics();
    this.fxLayer.addChild(g);
    const maxR = this.metrics.big * 0.95;
    let t = 0;
    this.effects.add({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / 340);
        g.clear();
        g.lineStyle(Math.max(2, maxR * 0.07) * (1 - k), color, 0.85 * (1 - k));
        g.drawCircle(x, y, maxR * (0.35 + 0.65 * easeOutCubic(k)));
        return k < 1;
      },
      destroy: () => g.destroy(),
    });
    this.engine.markDirty();
  }

  // Petite explosion de particules (fin de focus, fin de partie).
  burstAt(x, y, { color = 0xffd84a, count = 36, spread = 1 } = {}) {
    const g = new PIXI.Graphics();
    this.fxLayer.addChild(g);
    const unit = this.metrics.big;
    const parts = Array.from({ length: count }, () => {
      const a = Math.random() * Math.PI * 2;
      const v = unit * (1.5 + Math.random() * 3.5) * spread;
      return { a, v, r: unit * (0.04 + Math.random() * 0.06), c: Math.random() < 0.5 ? color : 0xffffff };
    });
    let t = 0;
    this.effects.add({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / 900);
        const e = easeOutCubic(k);
        g.clear();
        for (const p of parts) {
          g.beginFill(p.c, 1 - k);
          g.drawCircle(x + Math.cos(p.a) * p.v * e, y + Math.sin(p.a) * p.v * e + unit * 0.8 * k * k, p.r * (1 - 0.5 * k));
          g.endFill();
        }
        return k < 1;
      },
      destroy: () => g.destroy(),
    });
    this.engine.markDirty();
  }

  update(dt) {
    let active = false;
    for (const p of this.tweens) {
      const tw = p.tween;
      tw.t += dt;
      active = true;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      const e = tw.ease(k);
      p.dispX = tw.fromX + (tw.toX - tw.fromX) * e;
      p.dispY = tw.fromY + (tw.toY - tw.fromY) * e;
      if (tw.fade) p.sprite.alpha = k;
      this.updateSpritePos(p);
      if (k >= 1) {
        p.tween = null;
        this.tweens.delete(p);
        if (tw.fade) this.refreshInteractivity(p);
      }
    }
    for (const rl of this.remoteLifts.values()) {
      const f = 1 - Math.exp(-dt / 45);
      const nx = rl.cur.x + (rl.target.x - rl.cur.x) * f;
      const ny = rl.cur.y + (rl.target.y - rl.cur.y) * f;
      if (Math.abs(nx - rl.cur.x) > 0.01 || Math.abs(ny - rl.cur.y) > 0.01) {
        rl.cur = { x: nx, y: ny };
        rl.lift.setOffset(nx, ny);
        active = true;
      }
    }
    if (this.drag && this.edgePan(dt)) active = true;
    if (this.edgeMarks.length && this.updateEdgeHighlights(dt)) active = true;
    if (this.hint.candidates.length || this.hint.shape || this.hint.ring) {
      this.updateHintAnchors();
      if (this.hint.ring) {
        this.hint.t += dt;
        const s = this.hint.t / 1000;
        this.hint.ring.alpha = 0.55 + Math.sin(s * 5) * 0.35;
        this.hint.ring.scale.set(1 + Math.sin(s * 2.6) * 0.08);
        active = true;
      }
    }
    for (const fx of this.effects) {
      if (fx.update(dt)) active = true;
      else { fx.destroy(); this.effects.delete(fx); }
    }
    return active;
  }

  // ============================================================
  // Aide
  // ============================================================
  // Mode accroché : cases du cadre voisines de la zone déjà posée (sinon
  // 28 au hasard). Mode libre : toutes les voisines manquantes des blocs
  // d'au moins 2 pièces, dans toutes les directions.
  computeHintCandidates() {
    if (this.lockedGroupId) {
      let pool = [...this.pieces.values()].filter((p) => !this.isLocked(p) && !p.hidden);
      const adjacent = pool.filter((p) => this.neighborsOf(p).some((q) => this.isLocked(q)));
      if (adjacent.length) pool = adjacent;
      if (pool.length > 28) pool = shuffle(pool).slice(0, 28);
      return pool.map((p) => ({ pieceId: p.id, anchorPieceId: null }));
    }
    const best = new Map();
    for (const [gid, set] of this.groups) {
      if (set.size < 2) continue;
      const members = [...set];
      if (members.some((p) => p.hidden)) continue;
      for (const p of members) {
        for (const q of this.neighborsOf(p)) {
          if (q.groupId === gid || q.hidden) continue;
          const prev = best.get(q.id);
          if (!prev || prev.size < set.size) best.set(q.id, { pieceId: q.id, anchorPieceId: members[0].id, size: set.size });
        }
      }
    }
    return [...best.values()].map(({ pieceId, anchorPieceId }) => ({ pieceId, anchorPieceId }));
  }

  // Case où va la pièce : dans le cadre (mode accroché) ou à côté de son
  // bloc d'appui, où qu'il soit sur la table (mode libre).
  slotPosition(pieceId, anchorPieceId) {
    const q = this.pieces.get(pieceId);
    if (!q) return null;
    if (!anchorPieceId) return { x: q.tx, y: q.ty };
    const a = this.pieces.get(anchorPieceId);
    if (!a) return null;
    let ax = a.dispX;
    let ay = a.dispY;
    if (a.lifted) {
      const lift = this.drag?.group.includes(a) ? this.drag.lift : [...this.remoteLifts.values()].find((rl) => rl.pieces.includes(a))?.lift;
      if (lift) ({ x: ax, y: ay } = lift.visualPos(a));
    }
    return { x: q.tx + (ax - a.tx), y: q.ty + (ay - a.ty) };
  }

  isHintFulfilled(pieceId, anchorPieceId) {
    const q = this.pieces.get(pieceId);
    if (!q) return true;
    if (!anchorPieceId) return this.isLocked(q);
    const a = this.pieces.get(anchorPieceId);
    return !!a && a.groupId === q.groupId;
  }

  showHintCandidates(candidates, onPick) {
    this.clearHintOverlays();
    const { pw, ph, unit } = this.metrics;
    for (const cand of candidates) {
      const q = this.pieces.get(cand.pieceId);
      const g = new PIXI.Graphics();
      g.lineStyle(Math.max(1.5, unit * 0.035), ACCENT, 0.9);
      g.beginFill(ACCENT, 0.14);
      // Toujours un simple rectangle d'une case : ni la forme ni la taille
      // de la pièce ne se devinent (c'est le niveau 1 de l'aide qui les
      // montre). Pièce magique : posé sur sa première case, qui lui
      // appartient forcément (le rectangle part du coin de son cadre).
      const inset = unit * 0.06;
      const ox = q?.box ? (q.c - q.box[0]) * pw : 0;
      const oy = q?.box ? (q.r - q.box[1]) * ph : 0;
      g.drawRoundedRect(ox + inset, oy + inset, pw - 2 * inset, ph - 2 * inset, unit * 0.14);
      g.endFill();
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.alpha = 0.78;
      g.on('pointerover', () => { g.alpha = 1; this.engine.markDirty(); });
      g.on('pointerout', () => { g.alpha = 0.78; this.engine.markDirty(); });
      g.on('pointerdown', (e) => e.stopPropagation());
      g.on('pointertap', (e) => { e.stopPropagation(); onPick(cand); });
      this.hintLayer.addChild(g);
      this.hint.candidates.push({ g, ...cand });
    }
    this.updateHintAnchors();
    this.engine.markDirty();
  }

  showHintShape(pieceId, anchorPieceId) {
    this.removeHintShape();
    const q = this.pieces.get(pieceId);
    if (!q) return;
    const { unit } = this.metrics;
    const g = new PIXI.Graphics();
    g.lineStyle(Math.max(2, unit * 0.05), ACCENT, 0.95);
    g.beginFill(ACCENT, 0.22);
    tracePiecePath(g, q.shape, this.metrics.pw, this.metrics.ph, this.metrics.ts);
    g.closePath();
    g.endFill();
    this.hintLayer.addChild(g);
    this.hint.shape = g;
    this.hint.pieceId = pieceId;
    this.hint.anchorPieceId = anchorPieceId;
    this.updateHintAnchors();
    this.engine.markDirty();
  }

  showHintRing(pieceId, anchorPieceId) {
    this.removeHintRing();
    const q = this.pieces.get(pieceId);
    if (!q) return;
    const ring = new PIXI.Graphics();
    ring.lineStyle(Math.max(3, this.metrics.unit * 0.07), 0xffd84a, 1);
    ring.drawCircle(0, 0, Math.max(q.w, q.h) * 0.85);
    const line = new PIXI.Graphics();
    this.hintLayer.addChild(line, ring);
    this.hint.ring = ring;
    this.hint.line = line;
    this.hint.t = 0;
    this.hint.pieceId = pieceId;
    this.hint.anchorPieceId = anchorPieceId;
    this.hint.lineKey = '';
    this.updateHintAnchors();
    this.engine.markDirty();
  }

  updateHintAnchors() {
    for (const c of this.hint.candidates) {
      const pos = this.slotPosition(c.pieceId, c.anchorPieceId);
      if (pos && (c.g.x !== pos.x || c.g.y !== pos.y)) { c.g.position.set(pos.x, pos.y); this.engine.markDirty(); }
    }
    const slot = this.hint.pieceId ? this.slotPosition(this.hint.pieceId, this.hint.anchorPieceId) : null;
    if (this.hint.shape && slot && (this.hint.shape.x !== slot.x || this.hint.shape.y !== slot.y)) {
      this.hint.shape.position.set(slot.x, slot.y);
      this.engine.markDirty();
    }
    if (this.hint.ring && slot) {
      const q = this.pieces.get(this.hint.pieceId);
      const cx = q.dispX + q.w / 2;
      const cy = q.dispY + q.h / 2;
      this.hint.ring.position.set(cx, cy);
      const sx = slot.x + q.w / 2;
      const sy = slot.y + q.h / 2;
      const key = `${Math.round(cx)},${Math.round(cy)},${Math.round(sx)},${Math.round(sy)}`;
      if (key !== this.hint.lineKey) {
        this.hint.lineKey = key;
        const g = this.hint.line;
        const { unit } = this.metrics;
        g.clear();
        g.lineStyle(Math.max(2, unit * 0.04), 0xffd84a, 0.85);
        const len = Math.hypot(sx - cx, sy - cy);
        const dash = unit * 0.25;
        const steps = Math.floor(len / (dash * 2));
        for (let i = 0; i < steps; i++) {
          const t0 = (i * 2 * dash) / len;
          const t1 = Math.min(1, ((i * 2 + 1) * dash) / len);
          g.moveTo(cx + (sx - cx) * t0, cy + (sy - cy) * t0);
          g.lineTo(cx + (sx - cx) * t1, cy + (sy - cy) * t1);
        }
      }
    }
  }

  removeHintShape() {
    if (this.hint.shape) { this.hint.shape.destroy(); this.hint.shape = null; }
  }

  removeHintRing() {
    if (this.hint.ring) { this.hint.ring.destroy(); this.hint.ring = null; }
    if (this.hint.line) { this.hint.line.destroy(); this.hint.line = null; }
  }

  clearHintCandidates() {
    for (const c of this.hint.candidates) c.g.destroy();
    this.hint.candidates = [];
    this.engine.markDirty();
  }

  clearHintOverlays() {
    this.clearHintCandidates();
    this.removeHintShape();
    this.removeHintRing();
    this.hint.pieceId = null;
    this.hint.anchorPieceId = null;
    this.engine.markDirty();
  }

  pieceCenter(pieceId) {
    const p = this.pieces.get(pieceId);
    if (!p) return null;
    return { x: p.dispX + p.w / 2, y: p.dispY + p.h / 2 };
  }

  // Pièces de cette scène qui touchent `p` dans le puzzle fini.
  neighborsOf(p) {
    const out = [];
    for (const id of p.adj) {
      const q = this.pieces.get(id);
      if (q) out.push(q);
    }
    return out;
  }

  // ---------- Pièces de bord accordées : contour doré pulsant ----------
  showEdgeHighlights(ids, durationMs) {
    this.clearEdgeHighlights();
    const { pw, ph, ts, unit } = this.metrics;
    for (const id of ids) {
      const p = this.pieces.get(id);
      if (!p) continue;
      const g = new PIXI.Graphics();
      g.lineStyle(Math.max(3, unit * 0.07), 0xffd84a, 1);
      tracePiecePath(g, p.shape, pw, ph, ts);
      g.closePath();
      this.hintLayer.addChild(g);
      this.edgeMarks.push({ g, p });
    }
    this.edgeMarksLeft = durationMs;
    this.edgeT = 0;
    this.engine.markDirty();
    return this.edgeMarks.map((m) => this.pieceCenter(m.p.id));
  }

  clearEdgeHighlights() {
    for (const m of this.edgeMarks) m.g.destroy();
    this.edgeMarks = [];
    this.edgeMarksLeft = 0;
    this.engine.markDirty();
  }

  // Suit les pièces (même tenues), s'efface quand une pièce est placée ou
  // assemblée, ou au bout du temps imparti. Renvoie true tant qu'il y en a.
  updateEdgeHighlights(dt) {
    this.edgeMarksLeft -= dt;
    this.edgeT += dt;
    const keep = [];
    for (const m of this.edgeMarks) {
      const p = m.p;
      const done = p.hidden || this.isLocked(p) || this.groupSize(p.groupId) > 1;
      if (done || this.edgeMarksLeft <= 0) { m.g.destroy(); continue; }
      let pos = { x: p.dispX, y: p.dispY };
      if (p.lifted) {
        const lift = this.drag?.group.includes(p) ? this.drag.lift : [...this.remoteLifts.values()].find((rl) => rl.pieces.includes(p))?.lift;
        if (lift) pos = lift.visualPos(p);
      }
      m.g.position.set(pos.x, pos.y);
      m.g.alpha = 0.6 + Math.sin(this.edgeT / 160) * 0.4;
      keep.push(m);
    }
    this.edgeMarks = keep;
    if (!keep.length) this.engine.onEdgeHighlightsDone?.(this);
    return keep.length > 0;
  }

  // ============================================================
  // Caméra
  // ============================================================
  // Vue d'arrivée : toute la table dans la zone utile de l'écran (hors
  // HUD), cadre au centre. Si les pièces seraient trop petites (très
  // grands puzzles), on zoome au minimum lisible.
  fitTable({ animate = false, safe }) {
    const vp = this.viewport;
    const scaleFit = Math.min(safe.w / this.table.w, safe.h / this.table.h);
    const readable = 22 / this.metrics.unit;
    const scale = Math.min(4, Math.max(scaleFit, Math.min(readable, 1.5)));
    const minScale = Math.max(0.02, Math.min(scale, scaleFit) * 0.6);
    vp.plugins.remove('follow');
    vp.clampZoom({ minScale, maxScale: Math.max(4, scale * 2) });
    const fc = { x: this.frame.x + this.frame.w / 2, y: this.frame.y + this.frame.h / 2 };
    const center = {
      x: fc.x + (vp.screenWidth / 2 - (safe.x + safe.w / 2)) / scale,
      y: fc.y + (vp.screenHeight / 2 - (safe.y + safe.h / 2)) / scale,
    };
    if (animate) {
      vp.animate({ position: center, scale, time: 450, ease: 'easeInOutSine', removeOnInterrupt: true });
    } else {
      vp.setZoom(scale, true);
      vp.moveCenter(center.x, center.y);
    }
    this.engine.markDirty();
  }

  lookAt(x, y, { time = 650, scale = null } = {}) {
    const opts = { position: { x, y }, time, ease: 'easeInOutSine', removeOnInterrupt: true };
    if (scale) opts.scale = scale;
    this.viewport.animate(opts);
    this.engine.markDirty();
  }

  // Si aucun des points n'est bien visible à l'écran, la caméra va
  // montrer le plus proche (cases d'aide hors champ, par exemple).
  ensureVisible(points) {
    if (!points.length) return;
    const b = this.viewport.getVisibleBounds();
    const mx = b.width * 0.1;
    const my = b.height * 0.1;
    const visible = points.some((p) => p.x > b.x + mx && p.x < b.x + b.width - mx && p.y > b.y + my && p.y < b.y + b.height - my);
    if (visible) return;
    const c = this.viewport.center;
    let best = points[0];
    let bestD = Infinity;
    for (const p of points) {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    this.lookAt(best.x, best.y, { time: 500 });
  }
}
