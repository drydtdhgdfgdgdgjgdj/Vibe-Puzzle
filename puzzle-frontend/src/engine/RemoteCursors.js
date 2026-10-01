// ============================================================
// Curseurs des autres joueurs et "pings".
// Dessinés dans un calque À L'ÉCRAN, au-dessus de tout (y compris d'un
// focus ouvert) : on voit toujours bouger le curseur de son ami, à sa
// position dans la grande room. Taille constante quel que soit le zoom,
// mouvement interpolé entre deux messages réseau (plus de saccades).
// ============================================================
import * as PIXI from 'pixi.js';
import { getCursorShape } from '../cursorShapes';

const CURSOR_PX = 32;

function colorOf(css) {
  return typeof css === 'string' && /^#[0-9a-f]{6}$/i.test(css) ? parseInt(css.slice(1), 16) : 0x5b8cff;
}

function styleKey(pl) {
  const img = pl.cursorImage ? `${pl.cursorImage.length}:${pl.cursorImage.slice(-32)}` : '';
  return `${pl.color}|${pl.cursorShape}|${img}|${pl.pseudo}`;
}

export class RemoteCursors {
  constructor(engine, layer, viewport) {
    this.engine = engine;
    this.layer = layer;
    this.viewport = viewport;
    this.cursors = new Map();
    this.players = new Map();
    this.pings = new Set();
    this.scale = 1;
  }

  // Taille d'affichage de tous les curseurs (préférence perso).
  setScale(scale) {
    this.scale = scale;
    for (const c of this.cursors.values()) c.container.scale.set(scale);
    for (const p of this.pings) p.g.scale.set(scale);
    this.engine.markDirty();
  }

  setPlayers(players, mySocketId) {
    this.players = new Map(players.filter((p) => p.socketId !== mySocketId).map((p) => [p.socketId, p]));
    for (const [sid, c] of [...this.cursors]) {
      const pl = this.players.get(sid);
      if (!pl) { this.remove(sid); continue; }
      if (c.key !== styleKey(pl)) this.rebuild(sid, pl);
      if (pl.inFocus) c.container.visible = false;
    }
    this.engine.markDirty();
  }

  build(pl) {
    const container = new PIXI.Container();
    let labelPos = { x: 16, y: -4 };
    if (pl.cursorShape === 'image' && pl.cursorImage) {
      const tex = PIXI.Texture.from(pl.cursorImage);
      const sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5);
      const fit = () => {
        sprite.scale.set(CURSOR_PX / Math.max(1, tex.width, tex.height));
        this.engine.markDirty();
      };
      if (tex.baseTexture.valid) fit();
      else tex.baseTexture.once('loaded', fit);
      container.addChild(sprite);
      labelPos = { x: 19, y: -24 };
    } else {
      const g = new PIXI.Graphics();
      getCursorShape(pl.cursorShape).draw(g, colorOf(pl.color));
      container.addChild(g);
    }
    const label = new PIXI.Text(pl.pseudo || 'Ami', {
      fontFamily: 'Manrope, sans-serif', fontSize: 13, fontWeight: '700',
      fill: 0xffffff, stroke: 0x0e0f12, strokeThickness: 3,
    });
    label.resolution = 3;
    label.position.set(labelPos.x, labelPos.y);
    container.addChild(label);
    container.scale.set(this.scale);
    return container;
  }

  rebuild(sid, pl) {
    const c = this.cursors.get(sid);
    const container = this.build(pl);
    container.position.copyFrom(c.container.position);
    container.visible = c.container.visible;
    c.container.destroy({ children: true });
    this.layer.addChild(container);
    c.container = container;
    c.key = styleKey(pl);
  }

  move(sid, x, y) {
    const pl = this.players.get(sid);
    if (pl?.inFocus) return;
    let c = this.cursors.get(sid);
    if (!c) {
      const style = pl || { pseudo: 'Ami', color: '#5b8cff', cursorShape: 'dot' };
      const container = this.build(style);
      this.layer.addChild(container);
      c = { container, key: pl ? styleKey(pl) : '', wx: x, wy: y, tx: x, ty: y };
      this.cursors.set(sid, c);
      this.project(c);
    }
    c.tx = x;
    c.ty = y;
    c.container.visible = true;
    this.engine.markDirty();
  }

  hide(sid) {
    const c = this.cursors.get(sid);
    if (c) { c.container.visible = false; this.engine.markDirty(); }
  }

  remove(sid) {
    const c = this.cursors.get(sid);
    if (!c) return;
    c.container.destroy({ children: true });
    this.cursors.delete(sid);
    this.engine.markDirty();
  }

  // Position (monde de la grande room) du curseur d'un joueur.
  positionOf(sid) {
    const c = this.cursors.get(sid);
    return c && c.container.visible ? { x: c.wx, y: c.wy } : null;
  }

  // Pendant un focus, les curseurs (qui sont dans la grande room) sont
  // un peu atténués pour ne pas se confondre avec la mini-room.
  setDimmed(dimmed) {
    this.layer.alpha = dimmed ? 0.7 : 1;
    this.engine.markDirty();
  }

  ping(x, y, color) {
    const g = new PIXI.Graphics();
    g.scale.set(this.scale);
    this.layer.addChild(g);
    const ping = { g, t: 0, color: colorOf(color), wx: x, wy: y };
    this.project(ping);
    this.pings.add(ping);
    this.engine.markDirty();
  }

  project(obj) {
    const s = this.viewport.toScreen(obj.wx, obj.wy);
    (obj.container || obj.g).position.set(s.x, s.y);
  }

  update(dt) {
    let active = false;
    const f = 1 - Math.exp(-dt / 55);
    for (const c of this.cursors.values()) {
      const dx = c.tx - c.wx;
      const dy = c.ty - c.wy;
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        c.wx += dx * f;
        c.wy += dy * f;
        active = true;
      }
      // Reprojeté à chaque image : suit aussi les mouvements de caméra.
      this.project(c);
    }
    for (const p of this.pings) {
      p.t += dt;
      const k = p.t / 1400;
      p.g.clear();
      for (let i = 0; i < 3; i++) {
        const kk = k * 1.4 - i * 0.2;
        if (kk <= 0 || kk >= 1) continue;
        p.g.lineStyle(3.5 * (1 - kk), p.color, 1 - kk);
        p.g.drawCircle(0, 0, 10 + 64 * (1 - (1 - kk) ** 3));
      }
      p.g.beginFill(p.color, Math.max(0, 1 - k));
      p.g.drawCircle(0, 0, 6);
      p.g.endFill();
      this.project(p);
      if (k >= 1) { p.g.destroy(); this.pings.delete(p); } else active = true;
    }
    return active;
  }

  destroy() {
    for (const c of this.cursors.values()) c.container.destroy({ children: true });
    for (const p of this.pings) p.g.destroy();
    this.cursors.clear();
    this.pings.clear();
  }
}
