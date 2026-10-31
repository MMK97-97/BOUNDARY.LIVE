import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { graphicSvg as drawGraphic } from '../../web/score-graphic.mjs';
export { xml } from '../../web/score-graphic.mjs';
const brandLogo = 'data:image/png;base64,' + readFileSync(new URL('../../web/assets/mk97.png', import.meta.url)).toString('base64');
export const graphicSvg = (score, event = null, showScore = true, dimensions) => drawGraphic(score, event, showScore, brandLogo, dimensions);
export class GraphicRenderer {
  constructor(font, dimensions) { this.dimensions = dimensions; this.font = font; this.cache = new Map(); }
  frame(score, event, showScore) {
    const compact = score ? { ...score, fetchedAt: 0, error: null } : null;
    const drawing = event ? { type: event.type, title: event.title, milestone: event.milestone, over: event.over, cards: event.cards } : null;
    const key = JSON.stringify([compact, drawing, showScore]);
    if (this.cache.has(key)) return this.cache.get(key);
    const png = new Resvg(graphicSvg(score, event, showScore, this.dimensions), { font: { fontFiles: [this.font], loadSystemFonts: false, defaultFontFamily: this.font.includes('DejaVu') ? 'DejaVu Sans' : 'Arial' } }).render().asPng();
    if (this.cache.size >= 16) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, png); return png;
  }
}
