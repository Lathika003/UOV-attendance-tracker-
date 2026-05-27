/**
 * UOV FAS Attendance Tracker - Three.js 3D Background Engine
 * Renders an interactive 3D particle system that dynamically reacts to user navigation,
 * index searches, and student status changes via fluid GSAP animations.
 */

class AttendanceThreeScene {
    constructor() {
        this.canvas = document.getElementById('three-bg-canvas');
        if (!this.canvas) return;

        this.particleCount = 1200;
        this.particleSystem = null;
        this.geometry = null;
        this.material = null;
        
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetMouseX = 0;
        this.targetMouseY = 0;

        this.currentState = 'idle'; // 'idle', 'search-success'
        this.currentStatusColor = '#0088ff';
        
        this.init();
    }

    init() {
        // 1. Setup Three.js scene, camera, and renderer
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x060814, 0.015);

        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.z = 30;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // 2. Generate custom particle system geometry
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.particleCount * 3);
        this.colors = new Float32Array(this.particleCount * 3);
        this.initialPositions = new Float32Array(this.particleCount * 3); // For search resetting

        const colorObj = new THREE.Color(0x0088ff);

        for (let i = 0; i < this.particleCount; i++) {
            // Distribute randomly in a spherical-box shell
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const radius = 20 + Math.random() * 25;

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = (Math.random() * 2 - 1) * 30;

            this.positions[i * 3] = x;
            this.positions[i * 3 + 1] = y;
            this.positions[i * 3 + 2] = z;

            this.initialPositions[i * 3] = x;
            this.initialPositions[i * 3 + 1] = y;
            this.initialPositions[i * 3 + 2] = z;

            // Warm gradient color setup (between neon cyan and deep blue)
            const ratio = Math.random();
            colorObj.setHSL(0.55 + ratio * 0.1, 1.0, 0.5); // Cyan-blue spectrum
            
            this.colors[i * 3] = colorObj.r;
            this.colors[i * 3 + 1] = colorObj.g;
            this.colors[i * 3 + 2] = colorObj.b;
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        // 3. Create radial custom shader particle texture
        const particleTexture = this.generateParticleTexture();

        this.material = new THREE.PointsMaterial({
            size: 0.55,
            vertexColors: true,
            map: particleTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.8
        });

        this.particleSystem = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.particleSystem);

        // 4. Connect Window Event Listeners
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('touchmove', (e) => this.onTouchMove(e));

        // 5. Start Render Animation Loop
        this.animate(0);
    }

    generateParticleTexture() {
        // High performance procedural canvas radial gradient texture
        const size = 16;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove(event) {
        // Drift coordinates centered
        this.targetMouseX = (event.clientX - window.innerWidth / 2) * 0.015;
        this.targetMouseY = (event.clientY - window.innerHeight / 2) * 0.015;
    }

    onTouchMove(event) {
        if (event.touches.length > 0) {
            this.targetMouseX = (event.touches[0].clientX - window.innerWidth / 2) * 0.015;
            this.targetMouseY = (event.touches[0].clientY - window.innerHeight / 2) * 0.015;
        }
    }

    /**
     * Camera transition triggered upon Search Result
     * @param {string} eligibility: 'Eligible', 'Warning', 'Barred'
     */
    triggerSearchFocus(eligibility) {
        this.currentState = 'search-success';
        
        // Define color matching the status
        let targetHex = 0x0088ff; // Default Blue
        if (eligibility === 'Eligible') targetHex = 0x00f5a0;
        else if (eligibility === 'Warning') targetHex = 0xffaa00;
        else if (eligibility === 'Barred') targetHex = 0xff3366;

        const targetColor = new THREE.Color(targetHex);
        const positionAttr = this.geometry.attributes.position;
        const colorAttr = this.geometry.attributes.color;

        // Perform GSAP tween on global camera zoom
        gsap.to(this.camera.position, {
            z: 35,
            duration: 1.8,
            ease: "power2.inOut"
        });

        // Tween particles towards a concentrated central glowing orbit
        for (let i = 0; i < this.particleCount; i++) {
            // Determine ring layout coordinates in 3D
            const angle = (i / this.particleCount) * Math.PI * 2 * 6; // Spiral-like coordinates
            // Push particles to the far edges to avoid blocking the UI
            const radius = 35 + Math.sin(angle * 3) * 5;
            
            const targetX = radius * Math.cos(angle);
            const targetY = radius * Math.sin(angle);
            const targetZ = (Math.random() - 0.5) * 8 - 15;

            // Animate position using GSAP
            gsap.to(positionAttr.array, {
                [i * 3]: targetX,
                [i * 3 + 1]: targetY,
                [i * 3 + 2]: targetZ,
                duration: 1.5 + Math.random() * 0.6,
                ease: "power3.out",
                onUpdate: () => { positionAttr.needsUpdate = true; }
            });

            // Transition colors to reflect student eligibility status
            gsap.to(colorAttr.array, {
                [i * 3]: targetColor.r,
                [i * 3 + 1]: targetColor.g,
                [i * 3 + 2]: targetColor.b,
                duration: 1.0 + Math.random() * 0.5,
                onUpdate: () => { colorAttr.needsUpdate = true; }
            });
        }
        
        // Boost size slightly for glowing effect
        gsap.to(this.material, {
            size: 0.60,
            duration: 1.2
        });
    }

    /**
     * Resets the 3D particles back to their floating, ambient deep-space shell
     */
    resetScene() {
        this.currentState = 'idle';
        const defaultColor = new THREE.Color(0x0088ff);
        
        const positionAttr = this.geometry.attributes.position;
        const colorAttr = this.geometry.attributes.color;

        // Return camera to wide zoom position
        gsap.to(this.camera.position, {
            z: 30,
            duration: 2.0,
            ease: "power1.inOut"
        });

        // Scatter particles back to original locations
        for (let i = 0; i < this.particleCount; i++) {
            const origX = this.initialPositions[i * 3];
            const origY = this.initialPositions[i * 3 + 1];
            const origZ = this.initialPositions[i * 3 + 2];

            const ratio = Math.random();
            const cellColor = new THREE.Color();
            cellColor.setHSL(0.55 + ratio * 0.1, 1.0, 0.5);

            gsap.to(positionAttr.array, {
                [i * 3]: origX,
                [i * 3 + 1]: origY,
                [i * 3 + 2]: origZ,
                duration: 1.8 + Math.random() * 0.8,
                ease: "power2.inOut",
                onUpdate: () => { positionAttr.needsUpdate = true; }
            });

            gsap.to(colorAttr.array, {
                [i * 3]: cellColor.r,
                [i * 3 + 1]: cellColor.g,
                [i * 3 + 2]: cellColor.b,
                duration: 1.5,
                onUpdate: () => { colorAttr.needsUpdate = true; }
            });
        }

        // Return material scale
        gsap.to(this.material, {
            size: 0.55,
            duration: 1.5
        });
    }

    /**
     * Subtle transitions based on Tab selection changes
     * @param {string} tabName
     */
    onTabTransition(tabName) {
        if (this.currentState === 'search-success') {
            this.resetScene();
        }

        let targetZ = 30;
        let rotSpeedCoeff = 1.0;

        if (tabName === 'dashboard') {
            targetZ = 30;
            rotSpeedCoeff = 0.6;
        } else if (tabName === 'logger') {
            targetZ = 38; // Push back for clearer text contrast
            rotSpeedCoeff = 0.3;
        } else if (tabName === 'student-portal') {
            targetZ = 28;
            rotSpeedCoeff = 0.8;
        }

        gsap.to(this.camera.position, {
            z: targetZ,
            duration: 1.5,
            ease: "power1.inOut"
        });
    }

    animate(time) {
        requestAnimationFrame((t) => this.animate(t));

        // Smooth mouse hover tracking with camera dampening
        this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
        this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

        this.camera.position.x = this.mouseX;
        this.camera.position.y = -this.mouseY;
        this.camera.lookAt(this.scene.position);

        const timeSeconds = time * 0.0005;

        // Base continuous particle movement rotations
        if (this.particleSystem) {
            if (this.currentState === 'idle') {
                this.particleSystem.rotation.y = timeSeconds * 0.06;
                this.particleSystem.rotation.x = Math.sin(timeSeconds * 0.04) * 0.08;
            } else {
                // Energetic quick rotation in search-focused mode
                this.particleSystem.rotation.y = timeSeconds * 0.18;
                this.particleSystem.rotation.x = timeSeconds * 0.08;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Instantiate background controller on load
let bg3DSystem;
document.addEventListener("DOMContentLoaded", () => {
    try {
        bg3DSystem = new AttendanceThreeScene();
    } catch (e) {
        console.error("Three.js initiation failed, executing HTML/CSS gracefall.", e);
    }
});
