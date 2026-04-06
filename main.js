<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>赛博城市 - 3D 地图与记事本</title>
    <style>
        body { margin: 0; overflow: hidden; background: #000; font-family: 'Courier New', Courier, monospace; }
        canvas { display: block; }
        #mapCanvas { position: absolute; top: 20px; right: 20px; width: 200px; height: 200px; border: 2px solid #0ff; z-index: 100; }
        #notebook { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 400px; height: 500px; background: #f5f5dc; border: 2px solid #8b4513; padding: 20px; box-shadow: 0 0 20px rgba(0,0,0,0.8); z-index: 101; display: none; }
        #notebook textarea { width: 100%; height: calc(100% - 40px); font-family: 'Courier New', Courier, monospace; font-size: 16px; line-height: 24px; padding: 10px; resize: none; border: 1px solid #ccc; }
        #notebook button { margin-top: 10px; }
    </style>
</head>
<body>
    <canvas id="gameCanvas"></canvas>
    <canvas id="mapCanvas"></canvas>
    <div id="notebook">
        <textarea id="notebookContent">点击我输入笔记...</textarea>
        <button onclick="closeNotebook()">关闭</button>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script>
        // main.js
        // ==========================================
        // 1. 配置 (Configuration)
        // ==========================================
        const CONFIG = {
            fov: 75,
            near: 0.1,
            far: 2000,
            bgColor: 0x050505,
            fogColor: 0x050505,
            fogDensity: 0.0015,

            // 玩家
            heightStand: 1.7,
            heightCrouch: 0.9,
            radius: 0.4,
            speedWalk: 12.0,
            speedRun: 35.0,
            speedCrouch: 2.0,
            jumpForce: 12.0,
            gravity: 40.0,
            sensitivity: 0.002, 

            // 房子
            count: 200,
            gridCols: 20,
            gridRows: 10,
            spacing: 150,
            w: 100, h: 90, d: 80,
            floorH: 30,
            doorW: 20, doorH: 24,

            // 颜色
            cWall: 0xFFFFFF,
            cDoor: 0xFF0055,
            cGrid: 0x00FFFF,
            cStair: 0xFFAA00
        };

        // ==========================================
        // 2. 全局变量
        // ==========================================
        let camera, scene, renderer;
        let linesGroup;
        let crosshair;
        let uiContainer;

        // 地图元素
        let mapCanvas, mapCtx;
        let mapVisible = true;

        // 笔记本元素
        let notebookEl, notebookContentEl;
        let notebookOpen = false;

        const player = {
            pos: new THREE.Vector3(0, 2, 0),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: 0,
            pitch: 0,
            grounded: true,
            crouching: false
        };

        const keys = {
            w: false, a: false, s: false, d: false,
            space: false, shift: false, ctrl: false
        };
        let keyLocks = { e: false, o: false, b: false };

        const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INV: 3 };
        let currentState = STATE.PLAYING; // 直接进入游戏状态
        let isLocked = false;

        const houses = [];

        // ==========================================
        // 3. 初始化 (✅ 修复黑屏问题)
        // ==========================================
        init();
        animate();

        function init() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(CONFIG.bgColor);
            scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

            camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, CONFIG.near, CONFIG.far);
            camera.position.copy(player.pos);

            renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", canvas: document.getElementById('gameCanvas') });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.toneMapping = THREE.NoToneMapping;

            createWorld();
            createCrosshair();
            initUI(); // 初始化UI元素

            window.addEventListener('resize', onResize);
            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('keyup', onKeyUp);
            document.addEventListener('mousemove', onMouseMove);
            
            renderer.domElement.addEventListener('click', () => {
                if (currentState === STATE.PLAYING && !isLocked && !notebookOpen) {
                    renderer.domElement.requestPointerLock();
                }
            });

            document.addEventListener('pointerlockchange', () => {
                isLocked = (document.pointerLockElement === renderer.domElement);
            });

            // ✅ 关键修复：初始化后立即强制渲染一帧，防止黑屏
            renderer.render(scene, camera);
        }

        function initUI() {
            // 获取DOM元素
            mapCanvas = document.getElementById('mapCanvas');
            mapCtx = mapCanvas.getContext('2d');
            notebookEl = document.getElementById('notebook');
            notebookContentEl = document.getElementById('notebookContent');

            // 创建UI容器
            uiContainer = document.createElement('div');
            Object.assign(uiContainer.style, {
                position:'absolute', top:'10px', left:'10px', color:'#0F0', 
                fontFamily:'monospace', pointerEvents:'none', userSelect:'none',
                textShadow: '1px 1px 0 #000'
            });
            uiContainer.innerHTML = `
                WASD: 移动 | SPACE: 跳跃 | SHIFT: 加速<br>
                O: 开关地图 | B: 开关记事本<br>
                点击屏幕获取焦点
            `;
            document.body.appendChild(uiContainer);
        }

        // ==========================================
        // 4. 世界构建
        // ==========================================
        function createWorld() {
            linesGroup = new THREE.Group();
            scene.add(linesGroup);

            const gridSize = 10000;
            const gridDivs = 400;
            const geoGrid = new THREE.GridHelper(gridSize, gridDivs, CONFIG.cGrid, CONFIG.cGrid);
            geoGrid.position.y = 0;
            
            const matGlow = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending });
            const matBright = new THREE.LineBasicMaterial({ color: CONFIG.cGrid, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
            
            const gridGlow = new THREE.LineSegments(geoGrid.geometry, matGlow);
            const gridBright = new THREE.LineSegments(geoGrid.geometry, matBright);
            gridBright.position.y = 0.1;
            
            scene.add(gridGlow, gridBright);

            const cols = CONFIG.gridCols;
            const rows = CONFIG.gridRows;
            const startX = -((cols * CONFIG.spacing) / 2) + CONFIG.spacing/2;
            const startZ = -((rows * CONFIG.spacing) / 2) + CONFIG.spacing/2;

            // ✅ 移动到这里：先定义几何体，再创建世界
            const houseGeoCache = createHouseGeometry();
            const doorGeoCache = createDoorGeometry();

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
                    mesh: null, doorMesh: null
                };

                const mesh = new THREE.LineSegments(houseGeoCache, new THREE.LineBasicMaterial({ 
                    color: CONFIG.cWall, transparent: true, opacity: 1, depthWrite: false, toneMapped: false 
                }));
                mesh.position.set(x, CONFIG.h/2, z);
                mesh.visible = false;
                linesGroup.add(mesh);
                house.mesh = mesh;

                const doorMesh = new THREE.LineSegments(doorGeoCache, new THREE.LineBasicMaterial({ 
                    color: CONFIG.cDoor, depthWrite: false, toneMapped: false 
                }));
                doorMesh.position.set(x, 0, z);
                doorMesh.visible = false;
                linesGroup.add(doorMesh);
                house.doorMesh = doorMesh;

                houses.push(house);
            }
        }

        // 几何体创建函数移到 createWorld 之前或内部调用前
        function createHouseGeometry() {
            const hw = CONFIG.w/2, hd = CONFIG.d/2, hh = CONFIG.h/2;
            const points = [];
            const addLine = (x1,y1,z1, x2,y2,z2) => points.push(x1,y1,z1, x2,y2,z2);

            for(let i=0; i<=CONFIG.h; i+=CONFIG.floorH) {
                const y = i - hh;
                addLine(-hw, y, -hd, hw, y, -hd);
                addLine(hw, y, -hd, hw, y, hd);
                addLine(hw, y, hd, -hw, y, hd);
                addLine(-hw, y, hd, -hw, y, -hd);
            }
            
            const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
            corners.forEach(([cx, cz]) => addLine(cx, -hh, cz, cx, hh, cz));

            for(let i=1; i<CONFIG.h; i+=CONFIG.floorH) {
                const y = i - hh;
                for(let k=-hw; k<=hw; k+=20) addLine(k, y, -hd, k, y, hd);
                for(let k=-hd; k<=hd; k+=20) addLine(-hw, y, k, hw, y, k);
            }

            const sx = -hw + 10, sz = hd - 5;
            let cx = sx, cz = sz, cy = -hh;
            let dir = -1;
            const steps = 10;
            const stepH = CONFIG.floorH/steps;
            const stepD = 40/steps;
            
            for(let f=0; f<CONFIG.h/CONFIG.floorH - 1; f++) {
                for(let s=0; s<steps; s++) {
                    const ny = cy + stepH;
                    const nz = cz + stepD*dir;
                    points.push(cx-6, ny, nz, cx+6, ny, nz);
                    points.push(cx, cy, nz, cx, ny, nz);
                    cy = ny; cz = nz;
                }
                const pz = cz + 5*dir;
                addLine(cx-6, cy, cz, cx+6, cy, cz);
                addLine(cx-6, cy, pz, cx+6, cy, pz);
                addLine(cx-6, cy, cz, cx-6, cy, pz);
                addLine(cx+6, cy, cz, cx+6, cy, pz);
                
                dir *= -1;
                cz = pz + 5*dir;
            }

            return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        }

        function createDoorGeometry() {
            const hw = CONFIG.w/2, hd = CONFIG.d/2;
            const dw = CONFIG.doorW/2;
            const dh = CONFIG.doorH;
            const points = [];
            points.push(-dw, 0, hd, -dw, dh, hd);
            points.push(-dw, dh, hd, dw, dh, hd);
            points.push(dw, dh, hd, dw, 0, hd);
            return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        }

        function createCrosshair() {
            const cvs = document.createElement('canvas');
            cvs.width=64; cvs.height=64;
            const ctx = cvs.getContext('2d');
            ctx.strokeStyle='#FFF'; ctx.lineWidth=2;
            ctx.beginPath();
            ctx.moveTo(32,16); ctx.lineTo(32,24);
            ctx.moveTo(32,40); ctx.lineTo(32,48);
            ctx.moveTo(16,32); ctx.lineTo(24,32);
            ctx.moveTo(40,32); ctx.lineTo(48,32);
            ctx.stroke();
            const tex = new THREE.CanvasTexture(cvs);
            const mat = new THREE.SpriteMaterial({map:tex, depthTest:false, depthWrite:false, renderOrder:9999, toneMapped:false});
            crosshair = new THREE.Sprite(mat);
            crosshair.scale.set(0.5,0.5,1);
            scene.add(crosshair);
        }

        // ==========================================
        // 5. 物理与碰撞 (✅ 修复楼梯碰撞)
        // ==========================================
        function updatePhysics
