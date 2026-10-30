<!-- based off code on pre-v2 SlimeTora by BracketProto -->
<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { error } from "#lib/log/index";
	import * as THREE from "three";
	import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
	import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
	import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass";
	import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
	import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
	import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader";

	type Props = {
		rotation: number[];
		acceleration: number[];
		fps: number;
	};

	let { rotation, acceleration, fps }: Props = $props();

	let container: HTMLElement;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let composer: EffectComposer;
	let trackerModel: THREE.Object3D;
	let gravityLine: THREE.Line;
	let animationFrameId: number;
	let lastFrameTime = 0;
	let destroyed = false;

	const frameInterval = $derived(1000 / fps);

	function disposeObject(object: THREE.Object3D) {
		object.traverse((child) => {
			if (!(child as THREE.Mesh).isMesh) return;
			const mesh = child as THREE.Mesh;
			const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
			for (const material of materials) {
				if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
				material.dispose();
			}
			mesh.geometry?.dispose();
		});
	}

	function initThreeJS() {
		// Scene setup
		scene = new THREE.Scene();

		// Camera setup - adjusted for card dimensions
		const width = container.clientWidth;
		const height = 200; // Fixed height for visualization area
		camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
		camera.position.z = 5;

		// Renderer setup
		renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
		renderer.setSize(width, height);
		container.appendChild(renderer.domElement);

		// Add lighting
		const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
		directionalLight.position.set(0, 1, 1);
		scene.add(directionalLight);

		const ambientLight = new THREE.AmbientLight(0x404040, 2);
		scene.add(ambientLight);

		// Axes helper (small size for reference)
		const axesHelper = new THREE.AxesHelper(2);
		scene.add(axesHelper);

		// Load the tracker model
		const fbxLoader = new FBXLoader();
		fbxLoader.load(
			"/tracker.fbx",
			(object) => {
				if (destroyed) {
					disposeObject(object);
					return;
				}
				object.scale.set(0.01, 0.01, 0.01);
				trackerModel = object;
				scene.add(object);

				const textureLoader = new THREE.TextureLoader();
				textureLoader.load(
					"/tracker-texture.png",
					(texture) => {
						if (destroyed) {
							texture.dispose();
							return;
						}
						object.traverse((child) => {
							if ((child as THREE.Mesh).isMesh) {
								const material = new THREE.MeshStandardMaterial({
									map: texture,
									roughness: 0.5,
									metalness: 0,
								});
								(child as THREE.Mesh).material = material;
							}
						});
					},
					undefined,
					(err) => {
						if (!destroyed) error(["trackers", "visualization"], "Error loading tracker texture:", err);
					},
				);

				// Create initial gravity line
				createGravityLine(new THREE.Vector3(acceleration[0], acceleration[1], acceleration[2]));
			},
			undefined,
			(err) => {
				if (!destroyed) error(["trackers", "visualization"], "Error loading tracker model:", err);
			},
		);

		// Post-processing setup
		composer = new EffectComposer(renderer);

		// Render Pass
		const renderPass = new RenderPass(scene, camera);
		composer.addPass(renderPass);

		// Outline Pass
		const outlinePass = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
		outlinePass.edgeStrength = 10;
		outlinePass.edgeGlow = 0;
		outlinePass.edgeThickness = 0.5;
		outlinePass.visibleEdgeColor.set("#ffffff");
		outlinePass.hiddenEdgeColor.set("#ffffff");
		composer.addPass(outlinePass);

		// FXAA Pass for anti-aliasing
		const fxaaPass = new ShaderPass(FXAAShader);
		fxaaPass.material.uniforms["resolution"].value.set(1 / width, 1 / height);
		composer.addPass(fxaaPass);

		// Start animation
		animate();
	}

	function createGravityLine(gravity: THREE.Vector3) {
		const lineGeometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(0, 0, 0),
			gravity.clone().normalize().multiplyScalar(3),
		]);

		const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
		gravityLine = new THREE.Line(lineGeometry, lineMaterial);
		scene.add(gravityLine);
	}

	function updateGravityLineLength(gravity: THREE.Vector3, rot: THREE.Quaternion) {
		if (!gravityLine) return;

		const normalizedGravity = gravity.clone().normalize().multiplyScalar(3);
		const endPoint = normalizedGravity.clone().applyQuaternion(rot);

		const positions = gravityLine.geometry.attributes.position.array;
		positions[3] = endPoint.x;
		positions[4] = endPoint.y;
		positions[5] = endPoint.z;
		gravityLine.geometry.attributes.position.needsUpdate = true;
	}

	function animate(currentTime = 0) {
		if (destroyed) return;
		animationFrameId = requestAnimationFrame(animate);

		if (currentTime - lastFrameTime < frameInterval) {
			return;
		}

		lastFrameTime = currentTime;

		if (trackerModel) {
			// Convert Euler angles to quaternion
			const quaternion = new THREE.Quaternion();
			quaternion.setFromEuler(
				new THREE.Euler(
					THREE.MathUtils.degToRad(rotation[0]),
					THREE.MathUtils.degToRad(rotation[1]),
					THREE.MathUtils.degToRad(rotation[2]),
					"XYZ",
				),
			);

			trackerModel.quaternion.copy(quaternion);

			// Update gravity line
			if (gravityLine) {
				const gravity = new THREE.Vector3(acceleration[0], acceleration[1], acceleration[2]);
				updateGravityLineLength(gravity, quaternion);
			}

			// Add to outline pass selected objects
			const outlinePass = composer.passes.find((pass) => pass instanceof OutlinePass) as OutlinePass;
			if (outlinePass) {
				outlinePass.selectedObjects = [trackerModel];
			}
		}

		composer.render();
	}

	function handleResize() {
		if (!container || !camera || !renderer || !composer) return;

		const width = container.clientWidth;
		const height = 200;

		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		renderer.setSize(width, height);
		composer.setSize(width, height);

		// Update FXAA pass
		const fxaaPass = composer.passes.find((pass) => pass instanceof ShaderPass) as ShaderPass;
		if (fxaaPass) {
			fxaaPass.material.uniforms["resolution"].value.set(1 / width, 1 / height);
		}
	}

	onMount(() => {
		if (container) {
			initThreeJS();
			window.addEventListener("resize", handleResize);
		}
	});

	onDestroy(() => {
		destroyed = true;
		window.removeEventListener("resize", handleResize);
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		// Clean up Three.js resources
		if (renderer) {
			composer?.dispose();
			renderer.dispose();
		}

		if (trackerModel) {
			scene.remove(trackerModel);
			disposeObject(trackerModel);
		}

		if (gravityLine) {
			scene.remove(gravityLine);
			gravityLine.geometry.dispose();
			(gravityLine.material as THREE.Material).dispose();
		}
	});
</script>

<div class="visualization-container" bind:this={container}></div>

<style>
	.visualization-container {
		width: 100%;
		height: 200px;
		border-radius: 0.5rem;
		overflow: hidden;
		background-color: transparent;
	}
</style>
