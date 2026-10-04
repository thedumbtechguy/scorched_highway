// Pickup and weapon icons, drawn with canvas paths so they stay sharp at any size.
// Used for the floating badges over pickups, the crate panels and the HUD weapon panel.
// Each glyph is drawn in a 100-unit box centred on the origin, then scaled to `s` pixels.

const TAU = Math.PI * 2;
type Ctx = CanvasRenderingContext2D;
/** Rounded rectangle path (CanvasRenderingContext2D.roundRect is missing in older Safari). */
export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Draw `type`'s glyph in an `s`-pixel square at the context's origin, in `color`; `cut` is the colour of inner details. */
export function drawGlyph(ctx: Ctx, type: string, s: number, color: string, cut = 'rgba(30,19,34,.9)') {
  ctx.save(); ctx.translate(s / 2, s / 2); ctx.scale(s / 100, s / 100);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const poly = (pts: number[], fill = color) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const circle = (x: number, y: number, r: number, fill = color) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); };
  switch (type) {
    case 'missile': { // a finned missile climbing to the upper right, with its exhaust
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, -44); ctx.bezierCurveTo(12, -34, 12, -22, 12, -12); ctx.lineTo(12, 22); ctx.lineTo(-12, 22); ctx.lineTo(-12, -12); ctx.bezierCurveTo(-12, -22, -12, -34, 0, -44); ctx.fill();
      poly([12, 6, 26, 24, 26, 32, 12, 24]); poly([-12, 6, -26, 24, -26, 32, -12, 24]);
      poly([-8, -16, 8, -16, 8, -10, -8, -10], cut); // nose band
      ctx.globalAlpha = 0.75; poly([-8, 26, 0, 46, 8, 26]); break;
    }
    case 'rockets': { // a pod of three rockets
      for (const [x, y] of [[-22, 6], [0, -6], [22, 6]]) {
        ctx.beginPath(); ctx.moveTo(x, y - 36); ctx.quadraticCurveTo(x + 9, y - 28, x + 9, y - 18); ctx.lineTo(x + 9, y + 18); ctx.lineTo(x - 9, y + 18); ctx.lineTo(x - 9, y - 18); ctx.quadraticCurveTo(x - 9, y - 28, x, y - 36); ctx.fillStyle = color; ctx.fill();
        poly([x - 6, y - 14, x + 6, y - 14, x + 6, y - 10, x - 6, y - 10], cut);
      }
      rrect(ctx, -38, 20, 76, 18, 5); ctx.fillStyle = color; ctx.fill(); // the pod
      for (const x of [-22, 0, 22]) circle(x, 29, 4.5, cut);
      break;
    }
    case 'mortar': { // a shell on its arc
      ctx.lineWidth = 7; ctx.setLineDash([9, 9]);
      ctx.beginPath(); ctx.moveTo(-42, 40); ctx.quadraticCurveTo(-34, -30, 4, -14); ctx.stroke(); ctx.setLineDash([]);
      ctx.translate(18, 8); ctx.rotate(0.55);
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.bezierCurveTo(16, -24, 16, -8, 16, 4); ctx.lineTo(16, 22); ctx.lineTo(-16, 22); ctx.lineTo(-16, 4); ctx.bezierCurveTo(-16, -8, -16, -24, 0, -30); ctx.fill();
      poly([-16, 8, 16, 8, 16, 13, -16, 13], cut); poly([-10, 22, 10, 22, 7, 32, -7, 32]);
      break;
    }
    case 'mines': { // a landmine with its trigger and spikes
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.save(); ctx.rotate(a); poly([-6, -30, 6, -30, 0, -44]); ctx.restore(); }
      circle(0, 0, 32); circle(0, 0, 22, cut); circle(0, 0, 15); circle(0, 0, 6, cut);
      break;
    }
    case 'flame': { // a flame with a hot core
      ctx.beginPath(); ctx.moveTo(2, -46); ctx.bezierCurveTo(34, -14, 36, 16, 24, 32); ctx.bezierCurveTo(14, 46, -14, 46, -24, 32); ctx.bezierCurveTo(-34, 16, -30, -6, -14, -20); ctx.bezierCurveTo(-12, -6, -6, 0, 0, 2); ctx.bezierCurveTo(-4, -14, -6, -30, 2, -46); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, -6); ctx.bezierCurveTo(18, 8, 18, 22, 12, 30); ctx.bezierCurveTo(6, 38, -8, 38, -13, 30); ctx.bezierCurveTo(-18, 20, -12, 10, -4, 4); ctx.bezierCurveTo(-2, 10, 2, 12, 4, 12); ctx.bezierCurveTo(2, 4, 0, 0, 2, -6); ctx.fillStyle = cut; ctx.fill();
      break;
    }
    case 'repair': { // a spanner
      ctx.rotate(-Math.PI / 4);
      rrect(ctx, -8, -18, 16, 56, 7); ctx.fill();
      circle(0, -26, 20); poly([-7, -50, 7, -50, 7, -26, -7, -26], cut); circle(0, -26, 7, cut);
      circle(0, 30, 4, cut);
      break;
    }
    case 'special': { // a star burst
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 19 : 44; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 8 : 18; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = cut; ctx.fill();
      break;
    }
    case 'mg': { // two cartridges
      for (const x of [-15, 15]) {
        ctx.beginPath(); ctx.moveTo(x, -40); ctx.quadraticCurveTo(x + 11, -30, x + 11, -14); ctx.lineTo(x + 11, 36); ctx.lineTo(x - 11, 36); ctx.lineTo(x - 11, -14); ctx.quadraticCurveTo(x - 11, -30, x, -40); ctx.fillStyle = color; ctx.fill();
        poly([x - 11, -12, x + 11, -12, x + 11, -6, x - 11, -6], cut);
      }
      break;
    }
  }
  ctx.restore();
}
