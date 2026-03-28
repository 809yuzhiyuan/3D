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
let player = {
    mesh: null,
    height: CONFIG.heightStand,
    velocity: new THREE.Vector3(),
    isGrounded: false,
    controls: null
};
let keys = {};
let STATE = { NORMAL: 'normal', INV: 'inv', PAUSED: 'paused' };
let currentInventoryState = STATE.NORMAL;
let inventoryOpen = false;

// 物品列表
const items = ['木头', '石头', '铁矿', '金矿'];
let currentSelectedItemIndex = 0;

// DOM 元素
let inventoryEl, notebookEl, mapEl, uiContainer, itemDisplayEl;

// ==========================================
// 3. 初始化 (Init)
// ==========================================
function init() {
    // 创建场景、相机、渲染器
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

    camera = new THREE.PerspectiveCamera(
        CONFIG.fov,
        window.innerWidth / window.innerHeight,
        CONFIG.near,
        CONFIG.far
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 添加坐标轴辅助
    const axes = new THREE.AxesHelper(100);
    scene.add(axes);

    // 添加网格辅助
    const grid = new THREE.GridHelper(1000, 100);
    scene.add(grid);

    // 创建玩家（简易胶囊体）
    const geometry = new THREE.CapsuleGeometry(CONFIG.radius, CONFIG.heightStand - 2 * CONFIG.radius, 4, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    player.mesh = new THREE.Mesh(geometry, material);
    player.mesh.position.y = CONFIG.heightStand / 2;
    scene.add(player.mesh);

    // 添加光源
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 10, 10);
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    // 创建世界（简单地面）
    createWorld();

    // 初始化 UI
    createUI();

    // 监听事件
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('wheel', onWheel, false);
}

// ==========================================
// 4. 世界构建
// ==========================================
function createWorld() {
    // 创建一个简单的地面
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x228B22, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
}

// ==========================================
// 5. UI 界面
// ==========================================
function createUI() {
    // 创建 UI 容器
    uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '0';
    uiContainer.style.left = '0';
    uiContainer.style.width = '100%';
    uiContainer.style.height = '100%';
    uiContainer.style.pointerEvents = 'none';
    uiContainer.style.color = 'white';
    uiContainer.style.fontFamily = 'Arial, sans-serif';
    document.body.appendChild(uiContainer);

    // 左下角物品显示区域
    itemDisplayEl = document.createElement('div');
    itemDisplayEl.style.position = 'absolute';
    itemDisplayEl.style.bottom = '20px';
    itemDisplayEl.style.left = '20px';
    itemDisplayEl.style.padding = '10px';
    itemDisplayEl.style.background = 'rgba(0,0,0,0.6)';
    itemDisplayEl.style.borderRadius = '5px';
    itemDisplayEl.style.pointerEvents = 'none';
    itemDisplayEl.style.zIndex = '1000';
    itemDisplayEl.innerHTML = `<strong>当前物品:</strong> ${items[currentSelectedItemIndex]}`;
    uiContainer.appendChild(itemDisplayEl);

    // 背包/笔记本/地图 元素 (这里仅创建 DOM，显示隐藏由逻辑控制)
    inventoryEl = document.createElement('div');
    inventoryEl.style.position = 'absolute';
    inventoryEl.style.top = '0';
    inventoryEl.style.left = '0';
    inventoryEl.style.width = '100%';
    inventoryEl.style.height = '100%';
    inventoryEl.style.background = 'rgba(0,0,0,0.8)';
    inventoryEl.style.color = 'white';
    inventoryEl.style.display = 'none'; // 默认隐藏
    inventoryEl.style.zIndex = '2000';
    inventoryEl.innerHTML = '<h2>背包界面 (按 E 关闭)</h2><p>这里是背包内容...</p>';
    document.body.appendChild(inventoryEl);

    notebookEl = document.createElement('div');
    notebookEl.style.position = 'absolute';
    notebookEl.style.top = '0';
    notebookEl.style.left = '0';
    notebookEl.style.width = '100%';
    notebookEl.style.height = '100%';
    notebookEl.style.background = 'rgba(0,0,0,0.8)';
    notebookEl.style.color = 'white';
    notebookEl.style.display = 'none';
    notebookEl.style.zIndex = '2000';
    notebookEl.innerHTML = '<h2>笔记本界面 (按 N 关闭)</h2><p>这里是笔记...</p>';
    document.body.appendChild(notebookEl);

    mapEl = document.createElement('div');
    mapEl.style.position = 'absolute';
    mapEl.style.top = '0';
    mapEl.style.left = '0';
    mapEl.style.width = '100%';
    mapEl.style.height = '100%';
    mapEl.style.background = 'rgba(0,0,0,0.8)';
    mapEl.style.color = 'white';
    mapEl.style.display = 'none';
    mapEl.style.zIndex = '2000';
    mapEl.innerHTML = '<h2>地图界面 (按 M 关闭)</h2><p>这里是地图...</p>';
    document.body.appendChild(mapEl);
}

// ==========================================
// 6. 逻辑更新 (Update)
// ==========================================
function update() {
    // 玩家移动逻辑 (示例)
    const delta = 0.1; // 假设的帧时间

    if (keys['KeyW']) player.mesh.position.z -= CONFIG.speedWalk * delta;
    if (keys['KeyS']) player.mesh.position.z += CONFIG.speedWalk * delta;
    if (keys['KeyA']) player.mesh.position.x -= CONFIG.speedWalk * delta;
    if (keys['KeyD']) player.mesh.position.x += CONFIG.speedWalk * delta;

    // 简单的跳跃逻辑
    if (keys['Space'] && player.isGrounded) {
        player.velocity.y = CONFIG.jumpForce;
        player.isGrounded = false;
    }

    // 重力
    player.velocity.y -= CONFIG.gravity * delta;
    player.mesh.position.y += player.velocity.y * delta;

    // 碰撞检测 (简单的地面检测)
    if (player.mesh.position.y < CONFIG.heightStand / 2) {
        player.mesh.position.y = CONFIG.heightStand / 2;
        player.velocity.y = 0;
        player.isGrounded = true;
    }
}

// ==========================================
// 7. 渲染与动画
// ==========================================
function render() {
    renderer.render(scene, camera);
}

function animate() {
    requestAnimationFrame(animate);

    update();
    render();

    // 更新 UI
    updateUI();
}

// ==========================================
// 8. UI 更新逻辑
// ==========================================
function updateUI() {
    // 更新左下角物品显示
    if (itemDisplayEl) {
        itemDisplayEl.innerHTML = `<strong>当前物品:</strong> ${items[currentSelectedItemIndex]}`;
    }
}

// ==========================================
// 9. 事件监听
// ==========================================
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    keys[event.code] = true;

    // E 键：切换背包
    if (event.code === 'KeyE') {
        toggleInventory();
    }

    // N 键：切换笔记本
    if (event.code === 'KeyN') {
        toggleNotebook();
    }

    // M 键：切换地图
    if (event.code === 'KeyM') {
        toggleMap();
    }
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onWheel(event) {
    // 鼠标滚轮切换物品
    if (event.deltaY < 0) {
        // 向上滚
        currentSelectedItemIndex--;
    } else {
        // 向下滚
        currentSelectedItemIndex++;
    }

    // 循环选择
    if (currentSelectedItemIndex >= items.length) {
        currentSelectedItemIndex = 0;
    } else if (currentSelectedItemIndex < 0) {
        currentSelectedItemIndex = items.length - 1;
    }
}

// ==========================================
// 10. 界面切换逻辑
// ==========================================
function toggleInventory() {
    inventoryOpen = !inventoryOpen;

    if (inventoryOpen) {
        currentInventoryState = STATE.INV;
        inventoryEl.style.display = 'block';
        // 禁用鼠标控制（可选）
        // controls.enabled = false;
    } else {
        currentInventoryState = STATE.NORMAL;
        inventoryEl.style.display = 'none';
        // 启用鼠标控制（可选）
        // controls.enabled = true;
    }
}

function toggleNotebook() {
    const isVisible = notebookEl.style.display === 'block';
    notebookEl.style.display = isVisible ? 'none' : 'block';
}

function toggleMap() {
    const isVisible = mapEl.style.display === 'block';
    mapEl.style.display = isVisible ? 'none' : 'block';
}

// ==========================================
// 11. 启动
// ==========================================
init();
animate();
