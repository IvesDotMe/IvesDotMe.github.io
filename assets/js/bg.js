// Three.js background: a coral -> cyan particle wave field.
// Reacts to the pointer, and fires a shockwave + glitch when the card glitches (window event "card:glitch").
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.createElement('canvas');
canvas.id = 'bg-canvas';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);

let renderer;
try {
	renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
	canvas.remove(); // no WebGL: the CSS gradient stays as the background
	throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
const lookTarget = new THREE.Vector3(0, -2, -20);

// ---- Particle grid -------------------------------------------------------
const SIZE = 220;
const SEG = window.innerWidth < 700 ? 120 : 190;
const count = SEG * SEG;
const positions = new Float32Array(count * 3);
const rands = new Float32Array(count);
let i = 0;
for (let z = 0; z < SEG; z++) {
	for (let x = 0; x < SEG; x++) {
		positions[i * 3] = (x / (SEG - 1) - 0.5) * SIZE;
		positions[i * 3 + 1] = 0;
		positions[i * 3 + 2] = (z / (SEG - 1) - 0.5) * SIZE;
		rands[i] = Math.random();
		i++;
	}
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));

const uniforms = {
	uTime: { value: 0 },
	uMouse: { value: new THREE.Vector2(9999, 9999) },
	uMouseStrength: { value: 0 },
	uPulseTime: { value: -1000 },
	uPulseOrigin: { value: new THREE.Vector2(0, -10) },
	uGlitch: { value: 0 },
	uPixelRatio: { value: renderer.getPixelRatio() },
	uCoral: { value: new THREE.Color('#e68c7d') },
	uCyan: { value: new THREE.Color('#00b7d4') },
	uPink: { value: new THREE.Color('#ff7496') },
	uSpeed: { value: 0 },
	uHold: { value: 0 },
	uPulseAmp: { value: 1 },
	uDrops: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -1000, 0)) },
};
const DROPS = uniforms.uDrops.value.length;

const material = new THREE.ShaderMaterial({
	uniforms,
	transparent: true,
	depthWrite: false,
	vertexShader: /* glsl */ `
		uniform float uTime;
		uniform vec2 uMouse;
		uniform float uMouseStrength;
		uniform float uPulseTime;
		uniform vec2 uPulseOrigin;
		uniform float uGlitch;
		uniform float uPixelRatio;
		uniform float uSpeed;
		uniform float uHold;
		uniform float uPulseAmp;
		uniform vec4 uDrops[16];
		attribute float aRand;
		varying float vGlow;
		varying float vMix;
		varying float vHeight;
		varying float vAlpha;
		varying float vRand;

		float hash(float n) { return fract(sin(n) * 43758.5453123); }

		void main() {
			vec3 p = position;
			float t = uTime;

			// layered swell
			float h = sin(p.x * 0.16 + t * 0.55) * 1.3
			        + cos(p.z * 0.21 + t * 0.42) * 1.1
			        + sin((p.x + p.z) * 0.07 + t * 0.28) * 2.0
			        + sin(length(p.xz) * 0.12 - t * 0.7) * 0.8;

			// pointer: gravity well — particles swirl + part around the cursor
			vec2 rel = p.xz - uMouse;
			float dm = length(rel);
			float infl = exp(-dm * dm / 260.0) * uMouseStrength;
			float core = exp(-dm * dm / 50.0) * uMouseStrength;
			float twist = infl * (1.1 + uSpeed * 0.6 + uHold * 2.5) * sin(t * (0.8 + uHold * 2.0) + 1.2);
			float cs = cos(twist), sn = sin(twist);
			rel = mat2(cs, -sn, sn, cs) * rel;
			rel += normalize(rel + 0.0001) * core * (3.5 + uHold * 5.0); // lens: push particles outward
			p.xz = uMouse + rel;
			dm = length(rel);

			h += core * (4.5 + uSpeed * 3.0 + uHold * 7.0);
			// long-press charge: the well trembles
			h += infl * uHold * sin(t * 30.0 + aRand * 40.0) * 0.8;
			// continuous rings radiating from the cursor
			float emit = sin(dm * 0.85 - t * 5.5) * exp(-dm * 0.06) * uMouseStrength;
			h += emit * 1.4;
			float glow = core * (1.2 + uHold * 1.5) + max(emit, 0.0) * 0.5;
			// twinkle near the cursor
			glow += pow(0.5 + 0.5 * sin(t * 7.0 + aRand * 80.0), 12.0) * infl * 2.0;

			// wake: ripples dropped along the pointer path
			for (int k = 0; k < 16; k++) {
				vec4 dr = uDrops[k];
				float da = t - dr.z;
				if (da < 0.0 || da > 4.0) continue;
				float dd = length(p.xz - dr.xy);
				float wr = exp(-pow(dd - da * 17.0, 2.0) / 22.0) * exp(-da * 1.3) * dr.w;
				h += wr * 3.2 * sin(dd * 0.75 - da * 9.0);
				glow += wr * 0.9;
			}

			// shockwave
			float age = t - uPulseTime;
			float d = length(p.xz - uPulseOrigin);
			float front = age * 26.0;
			float ring = exp(-pow(d - front, 2.0) / (40.0 * uPulseAmp)) * exp(-age * 0.55) * uPulseAmp;
			h += ring * 6.0 * sin(d * 0.6 - age * 12.0);

			// glitch: horizontal bands tear sideways
			float band = floor(p.z * 0.35);
			float r = hash(band + floor(t * 24.0));
			p.x += step(0.72, r) * (r - 0.86) * 28.0 * uGlitch;
			h += step(0.9, hash(band * 3.1 + floor(t * 30.0))) * 3.0 * uGlitch;

			p.y = h;

			vec4 mv = modelViewMatrix * vec4(p, 1.0);
			gl_Position = projectionMatrix * mv;
			gl_PointSize = (2.2 + aRand * 2.4 + ring * 3.0 + glow * 3.5) * uPixelRatio * (38.0 / -mv.z);
			vGlow = clamp(glow + ring * 0.5, 0.0, 1.6);

			vMix = smoothstep(-90.0, 90.0, p.x - p.z * 0.4);
			vHeight = h + ring * 4.0;
			vAlpha = smoothstep(190.0, 30.0, -mv.z) * smoothstep(2.0, 12.0, -mv.z);
			vRand = aRand;
		}
	`,
	fragmentShader: /* glsl */ `
		uniform vec3 uCoral;
		uniform vec3 uCyan;
		uniform vec3 uPink;
		uniform float uGlitch;
		uniform float uTime;
		varying float vMix;
		varying float vHeight;
		varying float vAlpha;
		varying float vRand;
		varying float vGlow;

		void main() {
			vec2 c = gl_PointCoord - 0.5;
			float d = length(c);
			if (d > 0.5) discard;
			float soft = smoothstep(0.5, 0.15, d);

			vec3 col = mix(uCoral, uCyan, vMix);
			col = mix(col, uPink, smoothstep(2.5, 6.0, vHeight) * 0.85);

			// glitch: some particles flip to the opposite colour
			float flip = step(0.82, fract(vRand * 91.7 + floor(uTime * 20.0) * 0.37)) * uGlitch;
			col = mix(col, mix(uCyan, uCoral, vMix), flip);

			// hover heat: pink -> white-hot core
			col = mix(col, uPink, smoothstep(0.1, 0.6, vGlow) * 0.6);
			col = mix(col, vec3(1.0, 0.96, 0.92), smoothstep(0.6, 1.4, vGlow) * 0.75);

			gl_FragColor = vec4(col, soft * vAlpha * min(1.0, 0.55 + vRand * 0.4 + vGlow * 0.5));
		}
	`,
});

const points = new THREE.Points(geometry, material);
points.position.y = -14;
scene.add(points);

// ---- Pointer -------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 14);
const hit = new THREE.Vector3();
const parallax = new THREE.Vector2();
let mouseTarget = 0;
const mouseGoal = new THREE.Vector2(9999, 9999);
const lastDrop = new THREE.Vector2(9999, 9999);
let lastDropTime = 0, dropIndex = 0, speedTarget = 0, lastMoveTime = 0;

function pointerToGround(clientX, clientY) {
	ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
	raycaster.setFromCamera(ndc, camera);
	return raycaster.ray.intersectPlane(groundPlane, hit);
}

function trackPointer(clientX, clientY) {
	parallax.set(clientX / window.innerWidth - 0.5, clientY / window.innerHeight - 0.5);
	if (pointerToGround(clientX, clientY)) {
		const now = clock.getElapsedTime();
		if (mouseTarget === 0 || mouseGoal.x > 9000) uniforms.uMouse.value.set(hit.x, hit.z);
		const dt = Math.max(now - lastMoveTime, 1 / 120);
		const v = Math.hypot(hit.x - mouseGoal.x, hit.z - mouseGoal.y) / dt;
		if (mouseGoal.x < 9000) speedTarget = Math.min(1, v / 120);
		mouseGoal.set(hit.x, hit.z);
		lastMoveTime = now;
		mouseTarget = 1;
		// drop a wake ripple every few units travelled
		if (now - lastDropTime > 0.05 && lastDrop.distanceTo(mouseGoal) > 4) {
			uniforms.uDrops.value[dropIndex].set(hit.x, hit.z, now, 0.35 + speedTarget * 0.9);
			dropIndex = (dropIndex + 1) % DROPS;
			lastDrop.copy(mouseGoal);
			lastDropTime = now;
		}
	}
}

// Mouse / pen
window.addEventListener('pointermove', (e) => {
	if (e.pointerType !== 'touch') trackPointer(e.clientX, e.clientY);
}, { passive: true });
document.documentElement.addEventListener('pointerleave', (e) => {
	if (e.pointerType !== 'touch') mouseTarget = 0;
});

// Click on empty space -> shockwave from that point
window.addEventListener('pointerdown', (e) => {
	if (e.pointerType === 'touch' || e.target.closest('#main, a, button')) return;
	if (pointerToGround(e.clientX, e.clientY)) pulse(hit.x, hit.z, 0.35);
});

// Touch: the well follows your finger (even while scrolling), extra fingers splash ripples,
// tap = shockwave, press and hold = charge up, release = big shockwave.
let holdStart = -1, holdMoved = 0, touchStartX = 0, touchStartY = 0;
const interactive = (el) => el.closest && el.closest('a, button, .redacted, input, textarea');

function splash(touch, amp) {
	if (!pointerToGround(touch.clientX, touch.clientY)) return;
	uniforms.uDrops.value[dropIndex].set(hit.x, hit.z, clock.getElapsedTime(), amp);
	dropIndex = (dropIndex + 1) % DROPS;
}

window.addEventListener('touchstart', (e) => {
	const t0 = e.touches[0];
	if (e.touches.length === 1) {
		mouseGoal.set(9999, 9999); // snap the well to the finger
		trackPointer(t0.clientX, t0.clientY);
		touchStartX = t0.clientX; touchStartY = t0.clientY; holdMoved = 0;
		holdStart = interactive(e.target) ? -1 : clock.getElapsedTime();
	} else {
		for (const t of e.changedTouches) splash(t, 1.2);
		holdStart = -1;
	}
}, { passive: true });

window.addEventListener('touchmove', (e) => {
	const t0 = e.touches[0];
	trackPointer(t0.clientX, t0.clientY);
	holdMoved = Math.max(holdMoved, Math.hypot(t0.clientX - touchStartX, t0.clientY - touchStartY));
	if (holdMoved > 12) holdStart = -1; // it's a drag/scroll, not a press
	for (let k = 1; k < e.touches.length; k++) if (Math.random() < 0.3) splash(e.touches[k], 0.6);
}, { passive: true });

function touchEnd(e) {
	if (e.touches.length) return;
	if (holdStart >= 0 && e.type === 'touchend') {
		const held = clock.getElapsedTime() - holdStart;
		const charge = Math.min(1, held / 1.5);
		const g = uniforms.uMouse.value;
		pulse(g.x, g.y, 0.25 + charge * 0.6, 1 + charge * 1.6);
		if (charge > 0.3 && navigator.vibrate) navigator.vibrate(20 + charge * 40);
	}
	holdStart = -1;
	mouseTarget = 0;
}
window.addEventListener('touchend', touchEnd, { passive: true });
window.addEventListener('touchcancel', touchEnd, { passive: true });

// ---- Pulse / glitch ------------------------------------------------------
let glitchUntil = 0;
const clock = new THREE.Clock();

function pulse(x, z, glitchSeconds, amp = 1) {
	uniforms.uPulseAmp.value = amp;
	uniforms.uPulseTime.value = clock.getElapsedTime();
	uniforms.uPulseOrigin.value.set(x, z);
	glitchUntil = clock.getElapsedTime() + glitchSeconds;
}

window.addEventListener('card:glitch', () => pulse(0, -10, 0.7));

// ---- Resize / loop -------------------------------------------------------
function resize() {
	const w = window.innerWidth, h = window.innerHeight;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function frame() {
	const t = clock.getElapsedTime();
	uniforms.uTime.value = t;
	uniforms.uMouseStrength.value += (mouseTarget - uniforms.uMouseStrength.value) * 0.05;
	if (mouseGoal.x < 9000) uniforms.uMouse.value.lerp(mouseGoal, 0.18);
	if (t - lastMoveTime > 0.08) speedTarget *= 0.9;
	uniforms.uSpeed.value += (speedTarget - uniforms.uSpeed.value) * 0.08;
	const holdTarget = holdStart >= 0 ? Math.min(1, (t - holdStart - 0.2) / 1.3) : 0;
	uniforms.uHold.value += (Math.max(0, holdTarget) - uniforms.uHold.value) * (holdStart >= 0 ? 0.1 : 0.25);
	uniforms.uGlitch.value = t < glitchUntil ? 1 : uniforms.uGlitch.value * 0.85;

	camera.position.x += (parallax.x * 14 + Math.sin(t * 0.1) * 6 - camera.position.x) * 0.03;
	camera.position.y += (16 - parallax.y * 6 - camera.position.y) * 0.03;
	camera.position.z = 62;
	camera.lookAt(lookTarget);

	renderer.render(scene, camera);
}

if (reduceMotion) {
	camera.position.set(0, 16, 62);
	frame();
	window.addEventListener('resize', frame);
} else {
	renderer.setAnimationLoop(frame);
}

requestAnimationFrame(() => canvas.classList.add('is-ready'));
