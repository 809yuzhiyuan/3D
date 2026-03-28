import * as THREE from 'three';

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
let keyLocks = { e: false, b: false }; // 新增 B 键锁定

const STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, INV: 3, NOTEBOOK: 4 };
let currentState = STATE.MENU;
let isLocked = false;

const houses = [];

// ✅ 新增变量：背包状态、地图状态、笔记本状态、选中物品
let inventoryOpen = false;
let mapVisible = false;
let notebookOpen = false;
let currentSelectedItem = 0; // 默认选中第 0 个
const items = ["拳头", "撬棍", "手电筒", "钥匙卡", "医疗包", "相机", "地图", "打火机"]; // 物品列表

// ==========================================
// 3. 初始化
// ==========================================
init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

    camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, CONFIG.near, CONFIG.far);
    camera.position.copy(player.pos);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    createWorld();
    createCrosshair();
    createUI(); // UI 必须在初始化时创建

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('wheel', onWheel); // ✅ 新增：监听鼠标滚轮
    
    renderer.domElement.addEventListener('click', () => {
        if (currentState === STATE.PLAYING && !isLocked) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isLocked = (document.pointerLockElement === renderer.domElement);
    });

    renderer.render(scene, camera);
}

// ==========================================
// 4. 几何体创建 (必须在 createWorld 之前定义)
// ==========================================
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

// ==========================================
// 5. 世界构建
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
// 6. 物理与碰撞
// ==========================================
function updatePhysics() {
    const dt = 0.016;

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

        const minX = h.minX, maxX = h.maxX;
        const minZ = h.minZ, maxZ = h.maxZ;
        const minY = 0, maxY = CONFIG.h;

        if (pos.y < minY || pos.y > maxY) continue;

        const frontZ = maxZ;
        const dw = CONFIG.doorW/2;
        const dh = CONFIG.doorH;
        
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
                if (calculatedStairY > supportY) supportY = calculatedStairY;
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
        if (player.pos.y > supportY + targetH + 1.0) {
            player.grounded = false;
        }
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
// 7. 渲染与 UI
// ==========================================
function createUI() {
    uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position:'absolute', top:0, left:0, width:'100%', height:'100%',
        pointerEvents:'none', fontFamily:'"Microsoft YaHei", "Courier New", monospace', color:'#FFF', userSelect:'none'
    });
    document.body.appendChild(uiContainer);

    // ✅ 创建右上角地图 (P键开关)
    const mapEl = document.createElement('div');
    mapEl.id = 'map-ui';
    Object.assign(mapEl.style, {
        position: 'absolute', top: '10px', right: '10px', width: '150px', height: '150px',
        background: 'rgba(0,0,0,0.6)', border: '1px solid #00FFFF', pointerEvents: 'none',
        display: 'none', overflow: 'hidden'
    });
    // 地图内部的玩家点
    const mapDot = document.createElement('div');
    mapDot.style = 'width: 4px; height: 4px; background: red; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);';
    mapEl.appendChild(mapDot);
    document.body.appendChild(mapEl);

    // ✅ 创建左下角物品显示
    const itemEl = document.createElement('div');
    itemEl.id = 'item-ui';
    Object.assign(itemEl.style, {
        position: 'absolute', bottom: '10px', left: '10px', fontSize: '16px', color: '#FFFF00',
        background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '4px',
        pointerEvents: 'none', display: 'none'
    });
    document.body.appendChild(itemEl);

    // ✅ 创建笔记本 (B键开关)
    const notebookEl = document.createElement('div');
    notebookEl.id = 'notebook-ui';
    Object.assign(notebookEl.style, {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '500px', height: '400px', background: 'rgba(10, 10, 20, 0.9)', border: '2px solid #FFAA00',
        display: 'none', color: '#FFF', padding: '20px', boxSizing: 'border-box', overflow: 'auto',
        pointerEvents: 'auto', fontSize: '14px', lineHeight: '1.6'
    });
    notebookEl.innerHTML = `
        <h3>📝 笔记本</h3>
        <p>按 <strong>B</strong> 键关闭</p>
        <hr>
        <p>这里是你的笔记记录区域。</p>
        <p>你可以在这里记录线索、密码或者地图标记。</p>
        <p>...</p>
    `;
    document.body.appendChild(notebookEl);

    updateUI();
}

function updateUI() {
    uiContainer.innerHTML = '';
    uiContainer.style.pointerEvents = (currentState === STATE.MENU || currentState === STATE.PAUSED) ? 'auto' : 'none';

    if (currentState === STATE.PLAYING || currentState === STATE.INV) {
        let dirStr = "静止";
        if (keys.w) dirStr = "前进 ↑";
        if (keys.s) dirStr = "后退 ↓";
        if (keys.a) dirStr = "向左 ←";
        if (keys.d) dirStr = "向右 →";
        
        const info = document.createElement('div');
        Object.assign(info.style, { position:'absolute', top:'10px', left:'10px', fontSize:'14px', color:'#0F0', textShadow:'1px 1px 0 #000' });
        const floor = Math.floor(player.pos.y / CONFIG.floorH) + 1;
        
        const keyStatus = (k) => k ? "<span style='color:#FFF'>ON</span>" : "<span style='color:#666'>OFF</span>";
        const runStatus = keys.shift ? "<span style='color:#FFD700'>加速跑</span>" : "步行";
        const crouchStatus = keys.ctrl ? "<span style='color:#FFD700'>下蹲</span>" : "站立";
        const mouseStatus = isLocked ? "<span style='color:#0F0'>已锁定</span>" : "<span style='color:#F00'>自由</span>";

        info.innerHTML = `
            坐标：${player.pos.x.toFixed(0)} ${player.pos.y.toFixed(0)} ${player.pos.z.toFixed(0)}<br>
            楼层：<strong>${floor}</strong><br>
            方向：<strong>${dirStr}</strong><br>
            按键：W[${keyStatus(keys.w)}] S[${keyStatus(keys.s)}] A[${keyStatus(keys.a)}] D[${keyStatus(keys.d)}]<br>
            Shift [${runStatus}] | Ctrl [${crouchStatus}] | 空格 [${keys.space ? '跳跃' : '--'}]<br>
            鼠标：${mouseStatus} | 房屋总数：${CONFIG.count}
        `;
        uiContainer.appendChild(info);
    }

    if (currentState === STATE.MENU) {
        uiContainer.style.background = '#000';
        drawOverlay("后朋克之城 200", [
            {txt:"开始游戏", act:startGame},
            {txt:"退出游戏", act:()=>window.close()}
        ]);
    } else if (currentState === STATE.PAUSED) {
        uiContainer.style.background = 'rgba(0,0,0,0.7)';
        drawOverlay("已暂停", [
            {txt:"继续游戏", act:resumeGame},
            {txt:"返回菜单", act:goToMenu}
        ]);
    } else if (currentState === STATE.INV) {
        uiContainer.style.background = 'rgba(0,0,0,0.85)';
        drawInventory();
    }
}

function drawInventory() {
    const box = document.createElement('div');
    Object.assign(box.style, {
        position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:'600px', minHeight:'400px', border:'2px solid #FFD700', background:'rgba(20,20,20,0.9)',
        padding:'20px', display:'flex', flexWrap:'wrap', pointerEvents: 'auto'
    });
    box.innerHTML = `<div style="width:100%;color:#FFD700;font-size:24px;margin-bottom:20px">📦 背包 (按 E 关闭)</div>`;
    
    items.forEach((n, i) => {
        const s = document.createElement('div');
        const sel = (i === currentSelectedItem);
        Object.assign(s.style, {
            width:'70px', height:'70px', margin:'10px', border: sel?'3px solid #FFF':'1px solid #555',
            background: sel?'#333':'#111', color: sel?'#FFF':'#888',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            cursor:'pointer', fontSize:'14px', position: 'relative'
        });
        s.innerHTML = `<div>${n}</div><div style='font-size:10px; margin-top:5px'>[${i+1}]</div>`;
        if (sel) s.innerHTML += "<div style='position:absolute; top:0; right:0; background:red; color:white; font-size:10px; padding:2px;'>装备中</div>";
        box.appendChild(s);
    });
    uiContainer.appendChild(box);
    uiContainer.onclick = (e) => { if(e.target===uiContainer) toggleInventory(); };
}

function updateInventoryUI() {
    // 更新左下角的当前物品显示
    const itemEl = document.getElementById('item-ui');
    if (itemEl) {
        if (currentState === STATE.PLAYING) {
            itemEl.style.display = 'block';
            itemEl.innerHTML = `当前物品: <strong>${items[currentSelectedItem]}</strong> (${currentSelectedItem+1}/${items.length})`;
        } else {
            itemEl.style.display = 'none';
        }
    }

    // 更新右上角地图显示
    const mapEl = document.getElementById('map-ui');
    if (mapEl) {
        mapEl.style.display = mapVisible ? 'block' : 'none';
        // 简单的缩放和定位计算 (这里只是示意，实际需要更复杂的转换)
        const scale = 0.005; // 缩放比例
        const mapDot = mapEl.querySelector('div');
        if (mapDot) {
            mapDot.style.left = `${50 + player.pos.x * scale}%`;
            mapDot.style.top = `${50 - player.pos.z * scale}%`; // 注意Z轴方向
        }
    }

    // 更新笔记本显示
    const notebookEl = document.getElementById('notebook-ui');
    if (notebookEl) {
        notebookEl.style.display = notebookOpen ? 'block' : 'none';
    }
}

// ==========================================
// 8. 输入处理
// ==========================================
function onKeyDown(e) {
    const code = e.code;

    // 统一的按键状态更新
    if (code === 'KeyW') keys.w = true;
    if (code === 'KeyS') keys.s = true;
    if (code === 'KeyA') keys.a = true;
    if (code === 'KeyD') keys.d = true;
    if (code === 'Space') keys.space = true;
    if (code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
    if (code === 'ControlLeft' || code === 'ControlRight') keys.ctrl = true;
    
    // ============ 功能键逻辑 ============
    
    // E 键：开关背包 (Inventory)
    if (code === 'KeyE' && !keyLocks.e) {
        if (currentState === STATE.PLAYING) {
            toggleInventory();
        } else if (currentState === STATE.INV) {
            // 修复：在背包状态下按 E 应该关闭背包
            toggleInventory();
        }
        keyLocks.e = true;
    }

    // O 键：暂停/继续 (Pause/Resume)
    if (code === 'KeyO') {
        if (currentState === STATE.PLAYING) {
            currentState = STATE.PAUSED;
            document.exitPointerLock();
            updateUI();
        } else if (currentState === STATE.PAUSED) {
            resumeGame();
        }
    }

    // P 键：开关地图
    if (code === 'KeyP') {
        mapVisible = !mapVisible;
    }

    // B 键：开关笔记本
    if (code === 'KeyB' && !keyLocks.b) {
        notebookOpen = !notebookOpen;
        keyLocks.b = true;
    }

    // Escape 键：通用退出逻辑
    if (code === 'Escape') {
        if (currentState === STATE.INV) {
            toggleInventory();
        } else if (currentState === STATE.PAUSED) {
            currentState = STATE.MENU;
            updateUI();
        } else if (notebookOpen) {
            notebookOpen = false;
        } else if (currentState === STATE.PLAYING) {
            // 如果在游戏里按 Esc，进入暂停
            currentState = STATE.PAUSED;
            document.exitPointerLock();
            updateUI();
        }
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
    if (code === 'KeyB') keyLocks.b = false;
}

// ✅ 新增：鼠标滚轮切换物品
function onWheel(e) {
    if (currentState !== STATE.PLAYING) return;

    if (e.deltaY < 0) {
        // 向上滚
        currentSelectedItem = (currentSelectedItem - 1 + items.length) % items.length;
    } else {
        // 向下滚
        currentSelectedItem = (currentSelectedItem + 1) % items.length;
    }
    // 触发 UI 更新
    updateInventoryUI();
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

// ==========================================
// 9. 状态切换函数
// ==========================================
function startGame() {
    currentState = STATE.PLAYING;
    player.pos.set(0, 2, 0);
    player.vel.set(0,0,0);
    player.yaw = 0;
    updateUI();
    updateInventoryUI(); // 初始化UI显示
    setTimeout(() => renderer.domElement.requestPointerLock(), 50);
}

function resumeGame() {
    currentState = STATE.PLAYING;
    updateUI();
    updateInventoryUI();
    setTimeout(() => renderer.domElement.requestPointerLock(), 50);
}

function goToMenu() {
    currentState = STATE.MENU;
    document.exitPointerLock();
    updateUI();
    updateInventoryUI();
}

function toggleInventory() {
    if (currentState === STATE.PLAYING) {
        currentState = STATE.INV;
        document.exitPointerLock();
        updateUI();
    } else if (currentState === STATE.INV) {
        // 修复点：从背包返回游戏
        currentState = STATE.PLAYING;
        updateUI();
        updateInventoryUI();
        setTimeout(() => renderer.domElement.requestPointerLock(), 50);
    }
}

// ==========================================
// 10. 动画循环
// ==========================================
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
    
    renderer.render(scene, camera);
    
    // 每一帧都更新 UI 状态 (地图点位置、物品显示)
    updateInventoryUI();
}
