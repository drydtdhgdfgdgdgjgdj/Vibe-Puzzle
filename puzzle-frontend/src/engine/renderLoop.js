// ============================================================
// Rendu "à la demande" : on ne redessine que si quelque chose a
// bougé (caméra, pièce, curseur, animation). Une table au repos ne
// coûte donc plus rien au GPU, contre 60 images/s auparavant.
// Branché sur le ticker partagé, celui où pixi-viewport fait déjà
// ses mises à jour (priorité basse = juste après elles).
// ============================================================
import * as PIXI from 'pixi.js';

export class RenderLoop {
  constructor(app) {
    this.app = app;
    this.dirty = true;
    this.viewports = new Set();
    this.updaters = new Set();
    this.renderedPerSecond = 0;
    this.frames = 0;
    this.elapsed = 0;
    this.tick = this.tick.bind(this);
    PIXI.Ticker.shared.add(this.tick, null, PIXI.UPDATE_PRIORITY.LOW);
  }

  addViewport(vp) { this.viewports.add(vp); this.dirty = true; }
  removeViewport(vp) { this.viewports.delete(vp); this.dirty = true; }
  addUpdater(fn) { this.updaters.add(fn); }
  removeUpdater(fn) { this.updaters.delete(fn); }
  markDirty() { this.dirty = true; }

  setFpsCap(fps) {
    PIXI.Ticker.shared.maxFPS = fps || 0;
  }

  tick() {
    const ticker = PIXI.Ticker.shared;
    const dt = Math.min(100, ticker.deltaMS);
    let animating = false;
    for (const fn of this.updaters) if (fn(dt)) animating = true;
    for (const vp of this.viewports) {
      if (vp.dirty) { animating = true; vp.dirty = false; }
    }
    if (this.dirty || animating) {
      this.dirty = false;
      this.app.renderer.render(this.app.stage);
      this.frames++;
    }
    this.elapsed += ticker.deltaMS;
    if (this.elapsed >= 1000) {
      this.renderedPerSecond = Math.round((this.frames * 1000) / this.elapsed);
      this.frames = 0;
      this.elapsed = 0;
    }
  }

  destroy() {
    PIXI.Ticker.shared.remove(this.tick, null);
    PIXI.Ticker.shared.maxFPS = 0;
    this.updaters.clear();
    this.viewports.clear();
  }
}
