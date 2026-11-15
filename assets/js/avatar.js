// Three.js avatar: the photo is drawn on a shader disc with a liquid lens that follows the pointer,
// RGB split + band tearing when the card/name glitches, and a tilted ring of particles orbiting
// in 3D (passing behind and in front of the photo). Click the photo for a ripple + burst.
// Falls back to the plain <img> if WebGL is unavailable or the user prefers reduced motion.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const holder = document.querySelector('#main .avatar');
const img = holder && holder.querySelector('img');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (holder && img && !reduceMotion) init();

function init() {
	const VIEW = 320;            // canvas size in CSS px (1 world unit = 1 px)
	const HALF = VIEW / 2;
	const PHOTO_R = img.width / 2; // 65
	const RING_R = PHOTO_R + 24;   // matches the 1.5em white box-shadow ring

	const canvas = document.createElement('canvas');
	canvas.className = 'avatar-canvas';
	canvas.setAttribute('aria-hidden', 'true');

	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	} catch (e) {
		return; // keep the plain image
	}
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(VIEW, VIEW, false);
	renderer.setClearColor(0x000000, 0);
	holder.appendChild(canvas);

	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, -500, 500);
	camera.position.z = 100;

	const uniforms = {
		uTex: { value: null },
		uTime: { value: 0 },
		uMouse: { value: new THREE.Vector2(999, 999) },
		uHover: { value: 0 },
		uGlitch: { value: 0 },
		uClickTime: { value: -100 },
		uClickPos: { value: new THREE.Vector2() },
		uPhotoR: { value: PHOTO_R },
		uRingR: { value: RING_R },
	};

	// ---- Photo disc --------------------------------------------------------
	const disc = new THREE.Mesh(
		new THREE.PlaneGeometry(RING_R * 2 + 4, RING_R * 2 + 4),
		new THREE.ShaderMaterial({
			uniforms,
			transparent: true,
			vertexShader: /* glsl */ `
				varying vec2 vP;
				void main() {
					vP = position.xy;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: /* glsl */ `
				uniform sampler2D uTex;
				uniform float uTime, uHover, uGlitch, uClickTime, uPhotoR, uRingR;
				uniform vec2 uMouse, uClickPos;
				varying vec2 vP;

				float hash(float n) { return fract(sin(n) * 43758.5453123); }

				vec3 photo(vec2 q, vec2 shift) {
					vec2 uv = q / (2.0 * uPhotoR) + 0.5;
					float r = texture2D(uTex, (q + shift) / (2.0 * uPhotoR) + 0.5).r;
					float g = texture2D(uTex, uv).g;
					float b = texture2D(uTex, (q - shift) / (2.0 * uPhotoR) + 0.5).b;
					return vec3(r, g, b);
				}

				void main() {
					vec2 p = vP;
					float rad = length(p);
					float outer = 1.0 - smoothstep(uRingR - 1.0, uRingR, rad);
					if (outer <= 0.0) discard;

					vec2 q = p;
					float t = uTime;

					// idle breathing ripple
					q += normalize(p + 1e-4) * sin(rad * 0.11 - t * 1.6) * 0.9;

					// liquid lens under the pointer
					vec2 d = q - uMouse;
					float dl = length(d);
					q -= d * exp(-dl * dl / 1100.0) * 0.38 * uHover;
					q += normalize(d + 1e-4) * sin(dl * 0.28 - t * 7.0) * 1.6 * uHover * exp(-dl / 35.0);

					// click ripple
					float age = t - uClickTime;
					vec2 cd = p - uClickPos;
					float cl = length(cd);
					float wave = exp(-pow(cl - age * 140.0, 2.0) / 120.0) * exp(-age * 2.5);
					q += normalize(cd + 1e-4) * wave * 7.0;

					// glitch: horizontal bands tear sideways
					float band = floor(p.y / 5.0);
					float h = hash(band + floor(t * 26.0));
					q.x += step(0.7, h) * (h - 0.85) * 60.0 * uGlitch;

					vec2 shift = vec2(0.6 + uHover * 2.0 + wave * 4.0 + uGlitch * 7.0, 0.0);
					vec3 col = photo(q, shift);

					// glitch scanlines + a cyan/pink tint on torn bands
					col *= 1.0 - uGlitch * 0.18 * step(0.5, fract(p.y * 0.5));
					col = mix(col, mix(vec3(0.0, 0.8, 0.9), vec3(1.0, 0.45, 0.59), step(0.85, h)), step(0.92, h) * uGlitch * 0.6);

					// rotating coral -> cyan rim
					float ang = atan(p.y, p.x);
					float sweep = 0.5 + 0.5 * sin(ang * 1.0 - t * 1.4);
					vec3 rimCol = mix(vec3(0.902, 0.549, 0.490), vec3(0.0, 0.718, 0.831), sweep);
					float rimW = 2.0 + uHover * 1.5;
					float inPhoto = 1.0 - smoothstep(uPhotoR - 0.75, uPhotoR + 0.75, rad);
					float rim = smoothstep(uPhotoR - 0.75, uPhotoR, rad) * (1.0 - smoothstep(uPhotoR + rimW - 0.75, uPhotoR + rimW, rad));

					vec3 outCol = mix(vec3(1.0), col, inPhoto);
					outCol = mix(outCol, rimCol, rim);
					gl_FragColor = vec4(outCol, outer);
				}
			`,
		})
	);
	scene.add(disc);

	// ---- Orbiting particles ------------------------------------------------
	const N = 170;
	const angles = new Float32Array(N), radii = new Float32Array(N), rands = new Float32Array(N);
	for (let i = 0; i < N; i++) {
		angles[i] = Math.random() * Math.PI * 2;
		radii[i] = RING_R + 6 + Math.random() * 20;
		rands[i] = Math.random();
	}
	const pGeo = new THREE.BufferGeometry();
	pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // computed in shader
	pGeo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
	pGeo.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
	pGeo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));

	const pUniforms = {
		uTime: uniforms.uTime,
		uBurst: { value: 0 },
		uHover: uniforms.uHover,
		uPixelRatio: { value: renderer.getPixelRatio() },
	};
	const particles = new THREE.Points(pGeo, new THREE.ShaderMaterial({
		uniforms: pUniforms,
		transparent: true,
		depthWrite: false,
		vertexShader: /* glsl */ `
			uniform float uTime, uBurst, uHover, uPixelRatio;
			attribute float aAngle, aRadius, aRand;
			varying float vRand, vDepth;
			void main() {
				float a = aAngle + uTime * (0.35 + aRand * 0.25) * (1.0 + uHover * 1.5);
				float r = aRadius * (1.0 + uBurst * (0.15 + aRand * 0.2));
				vec3 p = vec3(cos(a) * r, sin(a * 3.0 + aRand * 6.28) * 3.0, sin(a) * r);
				// tilt the ring towards the viewer, then wobble it
				float tilt = 0.32 + sin(uTime * 0.4) * 0.08;
				p = vec3(p.x, p.y * cos(tilt) - p.z * sin(tilt), p.y * sin(tilt) + p.z * cos(tilt));
				float roll = sin(uTime * 0.3) * 0.25 - 0.2;
				p.xy = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * p.xy;
				vDepth = p.z / aRadius;           // -1 back .. 1 front
				vRand = aRand;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
				gl_PointSize = (2.0 + aRand * 2.5 + uBurst * 2.0) * (1.0 + vDepth * 0.35) * uPixelRatio;
			}
		`,
		fragmentShader: /* glsl */ `
			varying float vRand, vDepth;
			void main() {
				float d = length(gl_PointCoord - 0.5);
				if (d > 0.5) discard;
				vec3 coral = vec3(0.902, 0.549, 0.490);
				vec3 cyan = vec3(0.0, 0.718, 0.831);
				vec3 pink = vec3(1.0, 0.455, 0.588);
				vec3 col = vRand < 0.45 ? coral : (vRand < 0.85 ? cyan : pink);
				gl_FragColor = vec4(col, smoothstep(0.5, 0.2, d) * (0.45 + 0.5 * (vDepth * 0.5 + 0.5)));
			}
		`,
	}));
	particles.frustumCulled = false;
	scene.add(particles);
	// The disc writes depth at z=0, so particles with z<0 are hidden behind the photo.
	disc.renderOrder = 0;
	particles.renderOrder = 1;

	// ---- Interaction -------------------------------------------------------
	let hoverTarget = 0;
	let burst = 0;
	let glitchUntil = 0;
	const clock = new THREE.Clock();

	function local(e) {
		const r = canvas.getBoundingClientRect();
		const s = VIEW / r.width; // the card can be scaled/rotated during the flip-in
		return new THREE.Vector2((e.clientX - r.left) * s - HALF, HALF - (e.clientY - r.top) * s);
	}

	window.addEventListener('pointermove', (e) => {
		const p = local(e);
		const over = p.length() < RING_R;
		hoverTarget = over ? 1 : 0;
		holder.style.cursor = over ? 'pointer' : '';
		uniforms.uMouse.value.lerp(p, over ? 1 : 0);
	}, { passive: true });
	document.documentElement.addEventListener('pointerleave', () => { hoverTarget = 0; });

	holder.addEventListener('pointerdown', (e) => {
		const p = local(e);
		if (p.length() > RING_R) return;
		uniforms.uClickTime.value = clock.getElapsedTime();
		uniforms.uClickPos.value.copy(p);
		burst = 1;
	});

	const glitch = (s) => { glitchUntil = clock.getElapsedTime() + s; burst = Math.max(burst, 0.6); };
	window.addEventListener('card:glitch', () => glitch(0.7));
	window.addEventListener('name:glitch', () => { glitchUntil = clock.getElapsedTime() + 0.25; });

	// ---- Loop --------------------------------------------------------------
	function frame() {
		const t = clock.getElapsedTime();
		uniforms.uTime.value = t;
		uniforms.uHover.value += (hoverTarget - uniforms.uHover.value) * 0.08;
		uniforms.uGlitch.value = t < glitchUntil ? 1 : uniforms.uGlitch.value * 0.82;
		burst *= 0.94;
		pUniforms.uBurst.value = burst;
		renderer.render(scene, camera);
	}

	new THREE.TextureLoader().load(img.currentSrc || img.src, (tex) => {
		tex.minFilter = THREE.LinearFilter;
		tex.generateMipmaps = false;
		uniforms.uTex.value = tex;
		frame();
		holder.classList.add('is-3d');
		renderer.setAnimationLoop(frame);
	}, undefined, () => canvas.remove());
}
