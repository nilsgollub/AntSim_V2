// Screen-space atmosphere: day/night lighting, rain, fireflies, god rays,
// vignette, and the directional entity shadows.
import { PerformanceManager, QualityLevel } from '../../PerformanceManager';
import type { World } from '../../simulation/World';
import type { Renderer } from '../Renderer';

export function drawGodRays(r: Renderer) {
    const ctx = r.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.15;

    // Moving rays

    // Moving rays
    const time = Date.now() * 0.0005;
    for (let i = 0; i < 3; i++) {
        const offset = Math.sin(time + i) * 100;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.moveTo(r.width * 0.5 + offset, 0);
        ctx.lineTo(r.width * 0.6 + offset, 0);
        ctx.lineTo(r.width * 0.4 + offset - 200, r.height);
        ctx.lineTo(r.width * 0.3 + offset - 200, r.height);
        ctx.fill();
    }

    ctx.restore();
}

export function drawVignette(r: Renderer) {
    const ctx = r.ctx;
    const grad = ctx.createRadialGradient(r.width / 2, r.height / 2, r.width * 0.3, r.width / 2, r.height / 2, r.width * 0.8);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)'); // Much lighter vignette

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, r.width, r.height);
}

export function drawRain(r: Renderer, world: World) {
    if (!world.raining) return;
    const ctx = r.ctx;
    const lowFx = PerformanceManager.level === QualityLevel.ULTRA_LOW;
    ctx.save();
    // Overcast wet darkening.
    ctx.fillStyle = 'rgba(40, 50, 70, 0.20)';
    ctx.fillRect(0, 0, r.width, r.height);

    // Two depth layers of wind-slanted streaks (far = faint/short, near = bright/long).
    const slant = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(170, 190, 225, 0.16)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
        const x = Math.random() * r.width, y = Math.random() * r.height, len = 6 + Math.random() * 6;
        ctx.moveTo(x, y); ctx.lineTo(x - slant * 0.6, y + len);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(198, 214, 242, 0.4)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * r.width, y = Math.random() * r.height, len = 12 + Math.random() * 12;
        ctx.moveTo(x, y); ctx.lineTo(x - slant, y + len);
    }
    ctx.stroke();

    // Droplet impact rings: spawn a few each frame, expand + fade (flattened = on-ground).
    if (!lowFx) {
        for (let s = 0; s < 2; s++) r.rainRipples.push({ x: Math.random() * r.width, y: Math.random() * r.height, age: 0 });
        ctx.strokeStyle = 'rgba(205, 222, 246, 1)'; ctx.lineWidth = 0.8;
        for (let i = r.rainRipples.length - 1; i >= 0; i--) {
            const rip = r.rainRipples[i]; rip.age++;
            const t = rip.age / 16;
            if (t >= 1) { r.rainRipples.splice(i, 1); continue; }
            ctx.globalAlpha = (1 - t) * 0.5;
            const rad = 1 + t * 5;
            ctx.beginPath(); ctx.ellipse(rip.x, rip.y, rad, rad * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

export function drawLighting(r: Renderer, world: World) {
    if (!r.dayNight) return;
    const ctx = r.ctx;
    const time = world.timeOfDay; // 0-1
    const k = r.dayNightIntensity; // overall strength (toned down by default)

    // Night/dawn/dusk darkness (0 during the day).
    let alpha = 0;
    if (time < 0.2) alpha = 0.7 * (1 - time / 0.2);        // dawn fading out
    else if (time < 0.7) alpha = 0;                         // day
    else if (time < 0.8) alpha = 0.7 * ((time - 0.7) / 0.1); // dusk fading in
    else alpha = 0.7;                                       // night
    alpha *= k;

    ctx.save();
    if (alpha > 0.001) {
        ctx.fillStyle = `rgba(0, 10, 30, ${alpha})`;
        ctx.fillRect(0, 0, r.width, r.height);
    }

    // Sun/Moon glow (also scaled by intensity).
    if (time > 0.8 || time < 0.2) {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(100, 150, 255, ${0.1 * k})`;
        ctx.fillRect(0, 0, r.width, r.height);
    } else if (time > 0.2 && time < 0.3) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(255, 200, 100, ${0.2 * k})`;
        ctx.fillRect(0, 0, r.width, r.height);
    } else if (time > 0.6 && time < 0.7) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(255, 100, 50, ${0.2 * k})`;
        ctx.fillRect(0, 0, r.width, r.height);
    }

    ctx.restore();
}

// How dark the sky is right now: 0 in full day, 1 at deep night (scaled by intensity).
export function darknessFactor(r: Renderer, world: World): number {
    const t = world.timeOfDay;
    let d = 0;
    if (t < 0.2) d = 1 - t / 0.2;
    else if (t < 0.7) d = 0;
    else if (t < 0.8) d = (t - 0.7) / 0.1;
    else d = 1;
    return d * r.dayNightIntensity;
}

export function drawFireflies(r: Renderer, world: World) {
    if (!r.dayNight) return;
    const dark = darknessFactor(r, world);
    if (dark < 0.06) return; // none in daylight
    const ctx = r.ctx;
    if (r.fireflies.length === 0) {
        for (let i = 0; i < 18; i++) r.fireflies.push({
            x: Math.random() * r.width, y: Math.random() * r.height,
            vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
            ph: Math.random() * Math.PI * 2,
        });
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const f of r.fireflies) {
        f.x += f.vx; f.y += f.vy; f.ph += 0.045;
        if (f.x < 0 || f.x > r.width) f.vx *= -1;
        if (f.y < 0 || f.y > r.height) f.vy *= -1;
        if (Math.random() < 0.01) { f.vx = (Math.random() - 0.5) * 0.45; f.vy = (Math.random() - 0.5) * 0.45; }
        const a = (0.45 + 0.55 * Math.sin(f.ph)) * dark; // flicker, faded by darkness
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(190,255,110,${0.22 * a})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 6, 0, Math.PI * 2); ctx.fill();   // halo
        ctx.fillStyle = `rgba(225,255,165,${0.9 * a})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 1.6, 0, Math.PI * 2); ctx.fill(); // core
    }
    ctx.restore();
}

export function drawShadows(r: Renderer, world: World) {
    const ctx = r.ctx;
    const time = world.timeOfDay;

    // No shadows at night
    if (time > 0.8 || time < 0.1) return;

    // Calculate Sun Position (Moves from Left to Right)
    // 0.1 (Dawn) -> Left
    // 0.45 (Noon) -> Center
    // 0.8 (Dusk) -> Right

    // Shadow Offset (Opposite to sun)
    // Dawn: Sun Left -> Shadow Right (+x)
    // Dusk: Sun Right -> Shadow Left (-x)

    let sunX = ((time - 0.1) / 0.7) * r.width; // 0 to Width
    let shadowLen = 1.0;

    // Shadow Length depends on time (Long at dawn/dusk, short at noon)
    const noonDist = Math.abs(time - 0.45);
    shadowLen = 0.5 + noonDist * 2; // Reduced max length

    const shadowOffsetX = (r.width / 2 - sunX) / (r.width / 2) * 2 * shadowLen; // Much closer
    const shadowOffsetY = 1 * shadowLen; // Very close

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';

    // Draw Shadows for Ants (every colony)
    for (const c of world.colonies) {
        for (const ant of c.ants) {
            if (ant.location === 'WORLD') {
                ctx.beginPath();
                ctx.ellipse(ant.x + shadowOffsetX, ant.y + shadowOffsetY, 3, 3, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Draw Shadows for Insects
    for (const insect of world.insects) {
        ctx.beginPath();
        ctx.ellipse(insect.x + shadowOffsetX, insect.y + shadowOffsetY, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}
