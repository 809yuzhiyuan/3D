<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>后朋克之城 200</title>
    <style>
        body { margin: 0; overflow: hidden; background-color: #000; }
        canvas { display: block; }
    </style>
</head>
<body>
    <!-- 关键点：type="module" -->
    <script type="module">
        // 关键点：从 CDN 引入 three.js，而不是本地导入
        import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

        // ==========================================
        // 1. 配置 (Configuration)
        // ==========================================
        const CONFIG = {
            fov: 75,
            near: 0.1,
            far: 800, 
            bgColor: 0x050510, 
            fogColor: 0x050510,
            fogDensity: 0.015, 
            heightStand: 1.7,
            heightCrouch: 0.9,
            radius: 0.4,
            speedWalk: 10.0,
            speedRun: 25.0,
            speedCrouch: 2.0,
            jumpForce: 10.0,
            gravity: 30.0,
            sensitivity: 0.002, 
            count: 60, 
            gridCols: 12,
            gridRows: 6,
            spacing: 120,
            w: 80, h: 90, d: 60,
            floorH: 30,
            doorW: 20, doorH: 24,
            cWall: 0x888888,
            cDoor: 0xFF0055,
            cStair: 0xAA8844,
            cGround: 0x111111
        };

        // ==========================================
        // 2. 全局变量
        // ==========================================
        let camera, scene, renderer;
        let worldGroup;
        let crosshair;
        let uiContainer;
        let clock = new THREE.Clock();
        let textures = {};

        const player = {
            pos: new THREE.Vector3(0, 2, 0),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: 0,
            pitch: 0,
            grounded: true,
            crouching: false
        };

        const keys = { w: false, a: false, s: false, d: false, space: false, shift: false, ctrl: false };
        let keyLocks = { e: false };

        const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INV: 3 };
        let currentState = STATE.MENU;
        let isLocked = false;

        const houses = [];

        // ==========================================
        // 3. 工具：纹理生成
        // ==========================================
        function createSimpleTexture(colorBase) {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = colorBase;
            ctx.fillRect(0, 0, size, size);
            
            for (let i = 0; i < 300; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const alpha = Math.random() * 0.15;
                ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                ctx.fillRect(x, y, 2, 2);
            }
            
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.minFilter = THREE.LinearFilter;
            return tex;
        }

        function initTextures() {
            textures.wall = createSimpleTexture('#666666');
            textures.stair = createSimpleTexture('#776655');
        }

        // ==========================================
        // 4. 初始化
        // ==========================================
        init();
        animate();

        function init() {
            try {
                scene = new THREE.Scene();
                scene.background = new THREE.Color(CONFIG.bgColor);
                scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

                camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, CONFIG.near, CONFIG.far);
                camera.position.copy(player.pos);

                renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                renderer.setSize(window.innerWidth, window.innerHeight);
                
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                renderer.toneMapping = THREE.LinearToneMapping;
                renderer.toneMappingExposure = 1.2; 
                
                document.body.appendChild(renderer.domElement);

                initTextures();
                createLights();
                createWorld();
                createCrosshair();
                createUI();

                window.addEventListener('resize', onResize);
                document.addEventListener('keydown', onKeyDown);
                document.addEventListener('keyup', onKeyUp);
                document.addEventListener('mousemove', onMouseMove);
                
                document.addEventListener('click', () => {
                    if (currentState === STATE.PLAYING && !isLocked) {
                        renderer.domElement.requestPointerLock().catch(err => console.log(err));
                    }
                });

                document.addEventListener('pointerlockchange', () => {
                    isLocked = (document.pointerLockElement === renderer.domElement);
                });

                renderer.render(scene, camera);
            } catch (error) {
                console.error("Init Error:", error);
                alert("初始化失败：" + error.message);
            }
        }

        // ==========================================
        // 5. 光照系统
        // ==========================================
        function createLights() {
            const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0xaaccff, 0.8);
            dirLight.position.set(100, 200, 100);
            dirLight.castShadow = true;
            
            dirLight.shadow.mapSize.width = 1024;
            dirLight.shadow.mapSize.height = 1024;
            dirLight.shadow.camera.near = 0.5;
            dirLight.shadow.camera.far = 600;
            dirLight.shadow.camera.left = -300;
            dirLight.shadow.camera.right = 300;
            dirLight.shadow.camera.top = 300;
            dirLight.shadow.camera.bottom = -300;
            dirLight.shadow.bias = -0.0005;
            
            scene.add(dirLight);
        }

        // ==========================================
        // 6. 世界构建
        // ==========================================
        function createWorld() {
            worldGroup = new THREE.Group();
            scene.add(worldGroup);

            const groundGeo = new THREE.PlaneGeometry(20000, 20000);
            const groundMat = new THREE.MeshStandardMaterial({ 
                color: CONFIG.cGround, 
                roughness: 0.8,
                metalness: 0.2
            });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            scene.add(ground);

            const cols = CONFIG.gridCols;
            const rows = CONFIG.gridRows;
            const startX = -((cols * CONFIG.spacing) / 2) + CONFIG.spacing/2;
            const startZ = -((rows * CONFIG.spacing) / 2) + CONFIG.spacing/2;

            const wallGeo = new THREE.BoxGeometry(CONFIG.w, CONFIG.h, CONFIG.d);
            const doorGeo = new THREE.BoxGeometry(CONFIG.doorW, CONFIG.doorH, 2);

            const wallMat = new THREE.MeshStandardMaterial({ 
                map: textures.wall,
                color: 0xffffff,
                roughness: 0.9,
                metalness: 0.1,
                emissive: 0x111122,
                emissiveIntensity: 0.2
            });
            if(textures.wall) textures.wall.repeat.set(2, 2);

            const stairMat = new THREE.MeshStandardMaterial({
                map: textures.stair,
                color: 0xffffff,
                roughness: 0.7,
                metalness: 0.6,
                emissive: 0x221100,
                emissiveIntensity: 0.1
            });

            for (let i = 0; i < CONFIG.count; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                
                const x = startX + col * CONFIG.spacing;
                const z = startZ + row * CONFIG.spacing;
                
                if (Math.abs(x) < 60 && Math.abs(z) < 60) continue;

                const house = {
                    x, z,
                    minX: x - CONFIG.w/2, maxX: x + CONFIG.w/2,
                    minZ: z - CONFIG.d/2, maxZ: z + CONFIG.d/2,
                    mesh: null, doorMesh: null, light: null
                };

                const mesh = new THREE.Mesh(wallGeo, wallMat);
                mesh.position.set(x, CONFIG.h/2, z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                worldGroup.add(mesh);
                house.mesh = mesh;

                const doorMat = new THREE.MeshStandardMaterial({
                    color: 0x000000,
                    emissive: CONFIG.cDoor,
                    emissiveIntensity: 2.5,
                    toneMapped: false
                });
                const doorMesh = new THREE.Mesh(doorGeo, doorMat);
                doorMesh.position.set(x, CONFIG.doorH/2, z + CONFIG.d/2 + 1);
                doorMesh.castShadow = true;
                worldGroup.add(doorMesh);
                house.doorMesh = doorMesh;

                const light = new THREE.PointLight(CONFIG.cDoor, 1.5, 80);
                light.position.set(x, CONFIG.doorH + 5, z + CONFIG.d/2 + 5);
                light.castShadow = true;
                light.shadow.bias = -0.001;
                worldGroup.add(light);
                house.light = light;

                createStairs(x, z, stairMat);

                houses.push(house);
            }
        }

        function createStairs(hx, hz, material) {
            const hw = CONFIG.w/2, hd = CONFIG.d/2;
            const sx = hx - hw + 10;
            const szStart = hz + hd - 5;
            
            const steps = 10;
            const stepH = CONFIG.floorH/steps;
            const stepD = 40/steps;
            const stepW = 12;
            
            let cx = sx, cz = szStart, cy = 0;
            let dir = -1;

            const stairGroup = new THREE.Group();

            for(let f=0; f<CONFIG.h/CONFIG.floorH - 1; f++) {
                for(let s=0; s<steps; s++) {
                    const stepGeo = new THREE.BoxGeometry(stepW, stepH, stepD);
                    const step = new THREE.Mesh(stepGeo, material);
                    const nextZ = cz + stepD*dir;
                    const nextY = cy + stepH/2;
                    
                    step.position.set(cx, nextY, nextZ);
                    step.castShadow = true;
                    step.receiveShadow = true;
                    stairGroup.add(step);
                    
                    cy += stepH;
                    cz = nextZ;
                }
                const pz = cz + 5*dir;
                const platGeo = new THREE.BoxGeometry(stepW, stepH, 10);
                const plat = new THREE.Mesh(platGeo, material);
                plat.position.set(cx, cy + stepH/2, pz);
                plat.castShadow = true;
                stairGroup.add(plat);
                
                dir *= -1;
                cz = pz + 5*dir;
            }
            worldGroup.add(stairGroup);
        }

        function createCrosshair() {
            const cvs = document.createElement('canvas');
            cvs.width=32; cvs.height=32;
            const ctx = cvs.getContext('2d');
            ctx.strokeStyle='#FFF'; ctx.lineWidth=2;
            ctx.beginPath();
            ctx.moveTo(16,8); ctx.lineTo(16,12);
            ctx.moveTo(16,20); ctx.lineTo(16,24);
            ctx.moveTo(8,16); ctx.lineTo(12,16);
            ctx.moveTo(20,16); ctx.lineTo(24,16);
            ctx.stroke();
            const tex = new THREE.CanvasTexture(cvs);
            const mat = new THREE.SpriteMaterial({map:tex, depthTest:false, depthWrite:false, renderOrder:9999});
            crosshair = new THREE.Sprite(mat);
            crosshair.scale.set(0.3,0.3,1);
            scene.add(crosshair);
        }

        // ==========================================
        // 7. 物理与碰撞
        // ==========================================
        function updatePhysics() {
            const dt = Math.min(clock.getDelta(), 0.1);

            if (keys.ctrl && !player.crouching) {
                player.crouching = true;
                player.pos.y = Math.max(player.pos.y, CONFIG.heightCrouch);
                player.vel.y = 0;
            } else if (!keys.ctrl && player.crouching) {
                player.crouching = false;
                player.pos.y = Math.max(player.pos.y, CONFIG.heightStand);
            }

            const spd = player.crouching ? CONFIG.speedCrouch : (keys.shift ? CONFIG.speedRun : CONFIG.speedWalk);
            const sinY = Math.sin(player.yaw);
            const cosY = Math.cos(player.yaw);
            
            const fwd = new THREE.Vector3(-sinY, 0, -cosY); 
            const right = new THREE.Vector3(-cosY, 0, sinY);
            const move = new THREE.Vector3(0,0,0);

            if (keys.w) move.add(fwd);
            if (keys.s) move.sub(fwd);
            if (keys.a) move.add(right);
            if (keys.d) move.sub(right);

            const len = move.length();
            if (len > 0) {
                move.normalize().multiplyScalar(spd * dt);
                const nextX = player.pos.clone(); nextX.x += move.x;
                if (!checkCollision(nextX)) player.pos.x = nextX.x;
                const nextZ = player.pos.clone(); nextZ.z += move.z;
                if (!checkCollision(nextZ)) player.pos.z = nextZ.z;
            }

            if (keys.space && player.grounded && !player.crouching) {
                player.vel.y = CONFIG.jumpForce;
                player.grounded = false;
            }

            player.vel.y -= CONFIG.gravity * dt;
            player.pos.y += player.vel.y * dt;

            checkGroundAndStairs();
            camera.position.copy(player.pos);
        }

        function checkCollision(pos) {
            const r = CONFIG.radius;
            for (const h of houses) {
                if (Math.abs(pos.x - h.x) > CONFIG.w/2 + r + 10 || Math.abs(pos.z - h.z) > CONFIG.d/2 + r + 10) continue;
                const minX = h.minX, maxX = h.maxX, minZ = h.minZ, maxZ = h.maxZ;
                if (pos.y < 0 || pos.y > CONFIG.h) continue;
                const frontZ = maxZ;
                const dw = CONFIG.doorW/2, dh = CONFIG.doorH;
                if (Math.abs(pos.z - frontZ) < r) {
                    if (pos.y < dh && pos.x > h.x - dw - r && pos.x < h.x + dw + r) continue;
                    if (pos.x >= minX - r && pos.x <= maxX + r) return true;
                }
                const inX = pos.x > minX - r && pos.x < maxX + r;
                const inZ = pos.z > minZ - r && pos.z < maxZ + r;
                if (inX && inZ) {
                    if (pos.x <= minX + r || pos.x >= maxX - r) return true;
                    if (pos.z <= minZ + r || pos.z >= maxZ - r) return true;
                }
            }
            return false;
        }

        function checkGroundAndStairs() {
            let supportY = 0;
            let onStair = false;
            let stairY = 0;

            for (const h of houses) {
                if (Math.abs(player.pos.x - h.x) > CONFIG.w/2 + 10 || Math.abs(player.pos.z - h.z) > CONFIG.d/2 + 10) continue;
                if (player.pos.x > h.minX && player.pos.x < h.maxX && player.pos.z > h.minZ && player.pos.z < h.maxZ) {
                    const calculatedStairY = getStairHeightRobust(player.pos.x, player.pos.z, h.x, h.z);
                    if (calculatedStairY !== null) {
                        onStair = true;
                        stairY = calculatedStairY;
                        if (stairY > supportY) supportY = stairY;
                    }
                    for(let i=1; i<CONFIG.h; i+=CONFIG.floorH) {
                        if (player.pos.y > i - 2 && player.pos.y < i + 2) {
                            if (i > supportY) supportY = i;
                        }
                    }
                }
            }

            const targetH = player.crouching ? CONFIG.heightCrouch : CONFIG.heightStand;
            const standY = supportY + targetH;

            if (onStair) {
                if (Math.abs(player.pos.y - (stairY + targetH)) < 1.5 && player.vel.y <= 0) {
                    player.pos.y = stairY + targetH;
                    player.vel.y = 0;
                    player.grounded = true;
                    return;
                }
            }

            if (player.pos.y <= standY + 0.5 && player.vel.y <= 0) {
                player.pos.y = standY;
                player.vel.y = 0;
                player.grounded = true;
            } else {
                if (player.pos.y > supportY + targetH + 1.0) player.grounded = false;
            }
        }

        function getStairHeightRobust(x, z, hx, hz) {
            const hw = CONFIG.w/2, hd = CONFIG.d/2;
            const sx = hx - hw + 10;
            const szStart = hz + hd - 5;
            const stairWidth = 14;
            if (x < sx - stairWidth/2 || x > sx + stairWidth/2) return null;
            const distZ = szStart - z;
            if (distZ > -5 && distZ < 85) {
                let h = (distZ / 80) * CONFIG.h;
                if (h < 0) h = 0;
                if (h > CONFIG.h) h = CONFIG.h;
                return h;
            }
            return null;
        }

        // ==========================================
        // 8. 渲染管理
        // ==========================================
        function updateVisibility() {
            const renderDist = 300;
            houses.forEach(h => {
                const dist = Math.sqrt((player.pos.x - h.x)**2 + (player.pos.z - h.z)**2);
                const visible = dist < renderDist;
                if (h.mesh) h.mesh.visible = visible;
                if (h.doorMesh) h.doorMesh.visible = visible;
                if (h.light) h.light.visible = visible;
                if (visible && h.light) h.light.intensity = Math.max(0.5, 1.5 - dist/renderDist);
            });
        }

        function animate() {
            requestAnimationFrame(animate);
            
            if (currentState === STATE.PLAYING) {
                updatePhysics();
                const euler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
                camera.quaternion.setFromEuler(euler);
            }
            
            if (crosshair) {
                crosshair.position.copy(camera.position);
                const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
                crosshair.position.add(dir.multiplyScalar(1));
            }

            updateVisibility();
            
            try {
                renderer.render(scene, camera);
            } catch (e) {
                console.error("Render Error:", e);
            }
        }

        // ==========================================
        // 9. 输入与 UI
        // ==========================================
        function onKeyDown(e) {
            const code = e.code;
            if (code === 'KeyW') keys.w = true;
            if (code === 'KeyS') keys.s = true;
            if (code === 'KeyA') keys.a = true;
            if (code === 'KeyD') keys.d = true;
            if (code === 'Space') keys.space = true;
            if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
            if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = true;
            if (code === 'KeyE' && !keyLocks.e) {
                if (currentState === STATE.PLAYING) toggleInventory();
                keyLocks.e = true;
            }
            if (code === 'Escape') {
                if (currentState === STATE.INV) toggleInventory();
                else if (currentState === STATE.PLAYING) { currentState = STATE.PAUSED; document.exitPointerLock(); updateUI(); }
                else if (currentState === STATE.PAUSED) { currentState = STATE.MENU; updateUI(); }
            }
        }

        function onKeyUp(e) {
            const code = e.code;
            if (code === 'KeyW') keys.w = false;
            if (code === 'KeyS') keys.s = false;
            if (code === 'KeyA') keys.a = false;
            if (code === 'KeyD') keys.d = false;
            if (code === 'Space') keys.space = false;
            if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
            if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = false;
            if (code === 'KeyE') keyLocks.e = false;
        }

        function onMouseMove(e) {
            if (currentState !== STATE.PLAYING || !isLocked) return;
            player.yaw -= e.movementX * CONFIG.sensitivity;
            player.pitch -= e.movementY * CONFIG.sensitivity;
            player.pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, player.pitch));
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.render(scene, camera);
        }

        function createUI() {
            uiContainer = document.createElement('div');
            Object.assign(uiContainer.style, {
                position:'absolute', top:0, left:0, width:'100%', height:'100%',
                pointerEvents:'none', fontFamily:'"Microsoft YaHei", sans-serif', color:'#FFF', userSelect:'none',
                zIndex: 1000
            });
            document.body.appendChild(uiContainer);
            updateUI();
        }

        function updateUI() {
            uiContainer.innerHTML = '';
            uiContainer.style.pointerEvents = (currentState === STATE.MENU || currentState === STATE.PAUSED || currentState === STATE.INV) ? 'auto' : 'none';

            if (currentState === STATE.PLAYING || currentState === STATE.INV) {
                let dirStr = "静止";
                if (keys.w) dirStr = "前进 ↑";
                if (keys.s) dirStr = "后退 ↓";
                if (keys.a) dirStr = "向左 ←";
                if (keys.d) dirStr = "向右 →";
                
                const info = document.createElement('div');
                Object.assign(info.style, { position:'absolute', top:'10px', left:'10px', fontSize:'14px', color:'#0F0', textShadow:'1px 1px 0 #000' });
                const floor = Math.floor(player.pos.y / CONFIG.floorH) + 1;
                info.innerHTML = `
                    坐标：${player.pos.x.toFixed(0)} ${player.pos.y.toFixed(0)} ${player.pos.z.toFixed(0)}<br>
                    楼层：<strong>${floor}</strong><br>
                    方向：<strong>${dirStr}</strong><br>
                    状态：<strong>${isLocked ? '鼠标已锁定' : '点击画面锁定'}</strong>
                `;
                uiContainer.appendChild(info);
            }

            if (currentState === STATE.MENU) {
                uiContainer.style.background = '#000';
                drawOverlay("后朋克之城 200 (明亮版)", [
                    {txt:"开始游戏", act:startGame},
                    {txt:"退出", act:()=>window.close()}
                ]);
            } else if (currentState === STATE.PAUSED) {
                uiContainer.style.background = 'rgba(0,0,0,0.8)';
                drawOverlay("已暂停", [
                    {txt:"继续", act:resumeGame},
                    {txt:"返回菜单", act:goToMenu}
                ]);
            } else if (currentState === STATE.INV) {
                uiContainer.style.background = 'rgba(0,0,0,0.85)';
                drawInventory();
            }
        }

        function drawOverlay(title, btns) {
            const t = document.createElement('h1');
            t.innerText = title;
            Object.assign(t.style, { textAlign:'center', marginTop:'15vh', fontSize:'60px', color:'#FFD700', margin:0, textShadow:'2px 2px #000' });
            uiContainer.appendChild(t);
            btns.forEach(b => {
                const el = document.createElement('div');
                el.innerText = b.txt;
                Object.assign(el.style, {
                    display:'block', width:'240px', margin:'20px auto', padding:'15px',
                    border:'2px solid #FFF', color:'#DDD', textAlign:'center', cursor:'pointer',
                    background:'#111', fontSize:'24px', transition:'0.2s'
                });
                el.onmouseenter = () => { el.style.background='#FFF'; el.style.color='#000'; };
                el.onmouseleave = () => { el.style.background='#111'; el.style.color='#DDD'; };
                el.onclick = b.act;
                uiContainer.appendChild(el);
            });
        }

        function drawInventory() {
            const box = document.createElement('div');
            Object.assign(box.style, {
                position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
                width:'600px', minHeight:'400px', border:'2px solid #FFD700', background:'rgba(20,20,20,0.9)',
                padding:'20px', display:'flex', flexWrap:'wrap'
            });
            box.innerHTML = `<div style="width:100%;color:#FFD700;font-size:24px;margin-bottom:20px">背包 (按 E 关闭)</div>`;
            const items = ["撬棍", "胶带", "钥匙", "地图", "照片", "打火机", "纸条", "收音机", "空位"];
            items.forEach((n, i) => {
                const s = document.createElement('div');
                const sel = (i===0);
                Object.assign(s.style, {
                    width:'70px', height:'70px', margin:'10px', border: sel?'3px solid #FFF':'1px solid #555',
                    background: sel?'#333':'#111', color: sel?'#FFF':'#888',
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                    cursor:'pointer', fontSize:'14px'
                });
                s.innerHTML = `<div>${n}</div><div style='font-size:10px; margin-top:5px'>[${i+1}]</div>`;
                box.appendChild(s);
            });
            uiContainer.appendChild(box);
            uiContainer.onclick = (e) => { if(e.target===uiContainer) toggleInventory(); };
        }

        function startGame() {
            currentState = STATE.PLAYING;
            player.pos.set(0, 2, 0);
            player.vel.set(0,0,0);
            player.yaw = 0;
            updateUI();
            setTimeout(() => {
                renderer.domElement.requestPointerLock().catch(e => console.log("Lock failed", e));
            }, 100);
        }

        function resumeGame() {
            currentState = STATE.PLAYING;
            updateUI();
            setTimeout(() => {
                renderer.domElement.requestPointerLock().catch(e => console.log("Lock failed", e));
            }, 100);
        }

        function goToMenu() {
            currentState = STATE.MENU;
            document.exitPointerLock();
            updateUI();
        }

        function toggleInventory() {
            if (currentState === STATE.PLAYING) {
                currentState = STATE.INV;
                document.exitPointerLock();
            } else if (currentState === STATE.INV) {
                currentState = STATE.PLAYING;
                setTimeout(() => {
                    renderer.domElement.requestPointerLock().catch(e => console.log("Lock failed", e));
                }, 100);
            }
            updateUI();
        }
    </script>
</body>
</html>
