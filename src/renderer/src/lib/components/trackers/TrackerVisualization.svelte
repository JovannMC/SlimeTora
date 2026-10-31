<!-- based off code on pre-v2 SlimeTora by BracketProto -->
<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { error } from "#lib/log/index";
	import * as THREE from "three";
	import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
	import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
	import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
	import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
	import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
	import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";

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
		object.traverse((child: THREE.Object3D) => {
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
		scene = new THREE.Scene();

		const width = container.clientWidth;
		const height = 200;
		camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
		camera.position.z = 5;

		renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
		renderer.setSize(width, height);
		container.appendChild(renderer.domElement);

		const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
		directionalLight.position.set(0, 1, 1);
		scene.add(directionalLight);

		const ambientLight = new THREE.AmbientLight(0x404040, 2);
		scene.add(ambientLight);

		const axesHelper = new THREE.AxesHelper(2);
		scene.add(axesHelper);

		const fbxLoader = new FBXLoader();
		fbxLoader.load(
			"/tracker.fbx",
			(object: THREE.Object3D) => {
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
					(texture: THREE.Texture) => {
						if (destroyed) {
							texture.dispose();
							return;
						}
						object.traverse((child: THREE.Object3D) => {
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
					(err: unknown) => {
						if (!destroyed) error(["trackers", "visualization"], "Error loading tracker texture:", err);
					},
				);

				createGravityLine(new THREE.Vector3(acceleration[0], acceleration[1], acceleration[2]));
			},
			undefined,
			(err: unknown) => {
				if (!destroyed) error(["trackers", "visualization"], "Error loading tracker model:", err);
			},
		);

		composer = new EffectComposer(renderer);

		const renderPass = new RenderPass(scene, camera);
		composer.addPass(renderPass);

		const outlinePass = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
		outlinePass.edgeStrength = 10;
		outlinePass.edgeGlow = 0;
		outlinePass.edgeThickness = 0.5;
		outlinePass.visibleEdgeColor.set("#ffffff");
		outlinePass.hiddenEdgeColor.set("#ffffff");
		composer.addPass(outlinePass);

		const fxaaPass = new ShaderPass(FXAAShader);
		fxaaPass.material.uniforms["resolution"]?.value?.set(1 / width, 1 / height);
		composer.addPass(fxaaPass);

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

		const position = gravityLine.geometry.attributes.position;
		if (!position) return;

		const positions = position.array;
		positions[3] = endPoint.x;
		positions[4] = endPoint.y;
		positions[5] = endPoint.z;
		position.needsUpdate = true;
	}

	function animate(currentTime = 0) {
		if (destroyed) return;
		animationFrameId = requestAnimationFrame(animate);

		if (currentTime - lastFrameTime < frameInterval) {
			return;
		}

		lastFrameTime = currentTime;

		if (trackerModel) {
			const quaternion = new THREE.Quaternion();
			quaternion.setFromEuler(
				new THREE.Euler(
					THREE.MathUtils.degToRad(rotation[0] ?? 0),
					THREE.MathUtils.degToRad(rotation[1] ?? 0),
					THREE.MathUtils.degToRad(rotation[2] ?? 0),
					"XYZ",
				),
			);

			trackerModel.quaternion.copy(quaternion);

			if (gravityLine) {
				const gravity = new THREE.Vector3(acceleration[0], acceleration[1], acceleration[2]);
				updateGravityLineLength(gravity, quaternion);
			}

			const outlinePass = composer.passes.find((pass): pass is OutlinePass => pass instanceof OutlinePass);
			if (outlinePass) outlinePass.selectedObjects = [trackerModel];
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

		const fxaaPass = composer.passes.find((pass): pass is ShaderPass => pass instanceof ShaderPass);
		if (fxaaPass) fxaaPass.material.uniforms["resolution"]?.value?.set(1 / width, 1 / height);
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
