import * as THREE from 'three';

const canvas = document.getElementById('bgCanvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const geometry = new THREE.TorusKnotGeometry(1.2, 0.35, 200, 32);
const material = new THREE.MeshPhysicalMaterial({
    color: 0x8B5CF6,
    metalness: 0.9,
    roughness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    emissive: 0x7C3AED,
    emissiveIntensity: 0.3
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const light1 = new THREE.PointLight(0x8B5CF6, 150);
light1.position.set(5, 5, 5);
scene.add(light1);
const light2 = new THREE.PointLight(0x06B6D4, 100);
light2.position.set(-5, -5, 5);
scene.add(light2);

camera.position.z = 4;

let mx = 0, my = 0;
document.addEventListener('mousemove', e => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
});

function animate() {
    requestAnimationFrame(animate);
    mesh.rotation.x += 0.003;
    mesh.rotation.y += 0.004;
    camera.position.x += (mx * 2 - camera.position.x) * 0.05;
    camera.position.y += (-my * 2 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});