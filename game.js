// ========================================
// 점프맵 (Jump Map) - 3D Platformer Game
// ========================================

// === CONSTANTS ===
const GRAVITY = 20.0;
const JUMP_FORCE = 8.0;
const TERMINAL_VELOCITY = 50.0;
const playerSpeed = 1.5;
const runSpeed = 3.0;

// === GAME STATE ===
const GameState = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game_over',
    VICTORY: 'victory'
};

let currentState = GameState.MENU;
let currentStage = 1;
const totalStages = 20;
let gameStartTime = 0;
let currentTime = 0;

// === THREE.JS CORE ===
let scene, camera, renderer, clock;

// === PHYSICS & MOVEMENT ===
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let isOnGround = false;
let currentPlatform = null;
let canJump = true;
let checkpointReached = false;

// === CONTROLS STATE ===
let controls = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
    isRunning: false
};

// === CAMERA CONTROL ===
let euler = new THREE.Euler(0, 0, 0, 'YXZ');
let PI_2 = Math.PI / 2;
let isPointerLocked = false;

// === PLATFORMS ===
let platforms = [];
let checkpoint = null;

// === MOBILE ===
let isMobile = false;
let joystickDirection = new THREE.Vector2(0, 0);

// ========================================
// INITIALIZATION
// ========================================

function init() {
    console.log('Initializing Jump Map game...');

    // Detect mobile
    detectMobile();

    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

    // Create camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 2, 0);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Clock for delta time
    clock = new THREE.Clock();

    // Create lighting
    createLighting();

    // Setup controls
    setupEventListeners();
    setupCameraControls();
    if (isMobile) {
        setupMobileControls();
    }

    console.log('Initialization complete!');
}

// ========================================
// LIGHTING
// ========================================

function createLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional light (sun)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    console.log('Lighting created');
}

// ========================================
// PLATFORM CLASS
// ========================================

class Platform {
    constructor(x, y, z, width, height, depth, type = 'normal', moveData = null) {
        this.type = type;
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.moveData = moveData; // For moving platforms

        // Create mesh based on type
        const geometry = new THREE.BoxGeometry(width, height, depth);
        let material;

        switch (type) {
            case 'normal':
                material = new THREE.MeshStandardMaterial({
                    color: 0x808080,
                    roughness: 0.7,
                    metalness: 0.3
                });
                break;
            case 'slime':
                material = new THREE.MeshStandardMaterial({
                    color: 0x00ff00,
                    emissive: 0x00ff00,
                    emissiveIntensity: 0.3,
                    roughness: 0.4
                });
                break;
            case 'jump':
                material = new THREE.MeshStandardMaterial({
                    color: 0xffaa00,
                    emissive: 0xffaa00,
                    emissiveIntensity: 0.4,
                    roughness: 0.5
                });
                break;
            case 'ice':
                material = new THREE.MeshStandardMaterial({
                    color: 0xaaddff,
                    roughness: 0.1,
                    metalness: 0.6,
                    transparent: true,
                    opacity: 0.8
                });
                break;
            case 'lava':
                material = new THREE.MeshStandardMaterial({
                    color: 0xff4400,
                    emissive: 0xff4400,
                    emissiveIntensity: 0.6,
                    roughness: 0.8
                });
                break;
            case 'moving':
                material = new THREE.MeshStandardMaterial({
                    color: 0xaa00ff,
                    emissive: 0xaa00ff,
                    emissiveIntensity: 0.3,
                    roughness: 0.6
                });
                break;
            default:
                material = new THREE.MeshStandardMaterial({ color: 0x808080 });
        }

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, z);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Store platform data in userData
        this.mesh.userData.platformType = type;
        this.mesh.userData.platform = this;

        // For lava platforms - timer
        this.lavaTimer = 0;

        // For moving platforms
        if (moveData) {
            this.startPos = new THREE.Vector3(x, y, z);
            this.endPos = new THREE.Vector3(moveData.endX, moveData.endY, moveData.endZ);
            this.moveSpeed = moveData.speed || 2.0;
            this.moveProgress = 0;
            this.moveDirection = 1;
        }

        scene.add(this.mesh);
    }

    update(delta) {
        // Update moving platforms
        if (this.type === 'moving' && this.moveData) {
            this.moveProgress += this.moveDirection * this.moveSpeed * delta;

            if (this.moveProgress >= 1.0) {
                this.moveProgress = 1.0;
                this.moveDirection = -1;
            } else if (this.moveProgress <= 0.0) {
                this.moveProgress = 0.0;
                this.moveDirection = 1;
            }

            this.mesh.position.lerpVectors(this.startPos, this.endPos, this.moveProgress);
        }

        // Update lava platform pulsing
        if (this.type === 'lava') {
            const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.6;
            this.mesh.material.emissiveIntensity = pulse;
        }
    }

    handleEffect(player, delta) {
        switch (this.type) {
            case 'lava':
                this.lavaTimer += delta;
                if (this.lavaTimer > 1.5) {
                    // Player dies from lava
                    gameOver('용암에 빠졌습니다!');
                }
                break;
        }
    }

    resetLavaTimer() {
        this.lavaTimer = 0;
    }
}

// ========================================
// CHECKPOINT
// ========================================

function createCheckpoint(x, y, z) {
    const geometry = new THREE.CylinderGeometry(1, 1, 4, 8);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xffd700,
        emissiveIntensity: 0.5
    });

    checkpoint = new THREE.Mesh(geometry, material);
    checkpoint.position.set(x, y, z);
    checkpoint.castShadow = true;
    checkpoint.userData.isCheckpoint = true;
    scene.add(checkpoint);

    // Rotation animation handled in animate loop
}

// ========================================
// STAGE SYSTEM
// ========================================

function loadStage(stageNumber) {
    console.log(`Loading stage ${stageNumber}...`);

    // Clear previous stage
    clearStage();

    // Reset checkpoint flag
    checkpointReached = false;

    // Define stages
    const stageConfig = getStageConfig(stageNumber);

    // Create platforms
    stageConfig.platforms.forEach(p => {
        const platform = new Platform(
            p.position[0], p.position[1], p.position[2],
            p.size ? p.size[0] : 3,
            p.size ? p.size[1] : 0.5,
            p.size ? p.size[2] : 3,
            p.type,
            p.moveData
        );
        platforms.push(platform);
    });

    // Create checkpoint
    const cp = stageConfig.checkpoint;
    createCheckpoint(cp[0], cp[1], cp[2]);

    // Spawn player
    const spawn = stageConfig.spawnPoint;
    camera.position.set(spawn[0], spawn[1], spawn[2]);
    velocity.set(0, 0, 0);
    isOnGround = false;

    console.log(`Stage ${stageNumber} loaded!`);
}

function clearStage() {
    // Remove all platforms
    platforms.forEach(p => {
        scene.remove(p.mesh);
    });
    platforms = [];

    // Remove checkpoint
    if (checkpoint) {
        scene.remove(checkpoint);
        checkpoint = null;
    }
}

function getStageConfig(stageNumber) {
    const stages = {
        1: { // Tutorial
            name: "Tutorial",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'normal', position: [0, 0, -6], size: [3, 0.5, 3] },
                { type: 'slime', position: [0, 1, -11], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 3, -16], size: [3, 0.5, 3] },
                { type: 'lava', position: [0, 3, -21], size: [3, 0.5, 3] },
                { type: 'ice', position: [0, 4, -26], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 5, -31],
            spawnPoint: [0, 2, 0]
        },
        2: { // 계단 오르기
            name: "계단 오르기",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'normal', position: [0, 1, -5], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 2, -10], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 3, -15], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 4, -20], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 5, -25], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 6, -30],
            spawnPoint: [0, 2, 0]
        },
        3: { // 슬라임 점프
            name: "슬라임 점프",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'slime', position: [0, 0, -6], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 3, -11], size: [3, 0.5, 3] },
                { type: 'slime', position: [0, 3, -16], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 6, -21], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 7, -26],
            spawnPoint: [0, 2, 0]
        },
        4: { // 좌우 지그재그
            name: "지그재그",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'normal', position: [4, 1, -5], size: [3, 0.5, 3] },
                { type: 'normal', position: [-4, 2, -10], size: [3, 0.5, 3] },
                { type: 'normal', position: [4, 3, -15], size: [3, 0.5, 3] },
                { type: 'normal', position: [-4, 4, -20], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 5, -25], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 6, -30],
            spawnPoint: [0, 2, 0]
        },
        5: { // 점프패드 연습
            name: "점프패드",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'jump', position: [0, 0, -6], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 8, -11], size: [3, 0.5, 3] },
                { type: 'jump', position: [0, 8, -16], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 16, -21], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 17, -26],
            spawnPoint: [0, 2, 0]
        },
        6: { // 얼음길
            name: "미끄러운 길",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'ice', position: [0, 0, -6], size: [5, 0.5, 3] },
                { type: 'ice', position: [0, 1, -11], size: [5, 0.5, 3] },
                { type: 'normal', position: [0, 2, -16], size: [3, 0.5, 3] },
                { type: 'ice', position: [3, 3, -21], size: [4, 0.5, 3] },
                { type: 'normal', position: [0, 4, -26], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 5, -31],
            spawnPoint: [0, 2, 0]
        },
        7: { // 용암 타이밍
            name: "용암 타이밍",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'lava', position: [0, 1, -5], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 2, -10], size: [3, 0.5, 3] },
                { type: 'lava', position: [0, 3, -15], size: [3, 0.5, 3] },
                { type: 'lava', position: [0, 4, -20], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 5, -25], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 6, -30],
            spawnPoint: [0, 2, 0]
        },
        8: { // 혼합 1
            name: "혼합 챌린지 1",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'slime', position: [3, 0, -6], size: [3, 0.5, 3] },
                { type: 'ice', position: [-3, 3, -11], size: [4, 0.5, 3] },
                { type: 'lava', position: [0, 4, -16], size: [3, 0.5, 3] },
                { type: 'jump', position: [0, 5, -21], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 13, -26], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 14, -31],
            spawnPoint: [0, 2, 0]
        },
        9: { // 나선형 오르기
            name: "나선형 계단",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'normal', position: [5, 2, -3], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 4, -6], size: [3, 0.5, 3] },
                { type: 'normal', position: [-5, 6, -9], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 8, -12], size: [3, 0.5, 3] },
                { type: 'normal', position: [5, 10, -15], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 12, -18], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 13, -23],
            spawnPoint: [0, 2, 0]
        },
        10: { // 움직이는 발판 도입
            name: "움직이는 발판",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'moving', position: [0, 2, -7], size: [3, 0.5, 3], moveData: { endX: 5, endY: 2, endZ: -7, speed: 1.5 } },
                { type: 'normal', position: [8, 3, -12], size: [3, 0.5, 3] },
                { type: 'moving', position: [-5, 5, -17], size: [3, 0.5, 3], moveData: { endX: 5, endY: 5, endZ: -17, speed: 2.0 } },
                { type: 'normal', position: [0, 7, -22], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 8, -27],
            spawnPoint: [0, 2, 0]
        },
        11: { // 정밀 점프
            name: "정밀 점프",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'normal', position: [0, 2, -7], size: [2.5, 0.5, 2.5] },
                { type: 'normal', position: [4, 4, -12], size: [2.5, 0.5, 2.5] },
                { type: 'normal', position: [-4, 6, -17], size: [2.5, 0.5, 2.5] },
                { type: 'slime', position: [0, 8, -22], size: [2.5, 0.5, 2.5] },
                { type: 'normal', position: [0, 12, -27], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 13, -32],
            spawnPoint: [0, 2, 0]
        },
        12: { // 용암과 얼음
            name: "불과 얼음",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'lava', position: [0, 1, -5], size: [3, 0.5, 3] },
                { type: 'ice', position: [0, 2, -10], size: [5, 0.5, 3] },
                { type: 'lava', position: [0, 3, -15], size: [3, 0.5, 3] },
                { type: 'ice', position: [4, 4, -20], size: [4, 0.5, 3] },
                { type: 'normal', position: [0, 5, -25], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 6, -30],
            spawnPoint: [0, 2, 0]
        },
        13: { // 점프패드 연쇄
            name: "연쇄 발사",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'jump', position: [0, 1, -6], size: [3, 0.5, 3] },
                { type: 'jump', position: [0, 10, -11], size: [3, 0.5, 3] },
                { type: 'normal', position: [5, 19, -16], size: [3, 0.5, 3] },
                { type: 'slime', position: [5, 19, -21], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 23, -26], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 24, -31],
            spawnPoint: [0, 2, 0]
        },
        14: { // 복합 움직임
            name: "복합 이동",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'moving', position: [0, 2, -7], size: [3, 0.5, 3], moveData: { endX: 6, endY: 4, endZ: -7, speed: 1.8 } },
                { type: 'ice', position: [8, 5, -12], size: [4, 0.5, 3] },
                { type: 'moving', position: [-6, 6, -17], size: [3, 0.5, 3], moveData: { endX: 6, endY: 6, endZ: -17, speed: 2.2 } },
                { type: 'lava', position: [0, 7, -22], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 8, -27], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 9, -32],
            spawnPoint: [0, 2, 0]
        },
        15: { // 수직 타워
            name: "수직 타워",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'slime', position: [0, 2, -2], size: [3, 0.5, 3] },
                { type: 'normal', position: [4, 6, -4], size: [2.5, 0.5, 2.5] },
                { type: 'jump', position: [-4, 8, -6], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 17, -8], size: [2.5, 0.5, 2.5] },
                { type: 'slime', position: [0, 18, -12], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 22, -16], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 23, -21],
            spawnPoint: [0, 2, 0]
        },
        16: { // 극한의 타이밍
            name: "극한 타이밍",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'lava', position: [0, 1, -5], size: [2.5, 0.5, 2.5] },
                { type: 'lava', position: [4, 2, -10], size: [2.5, 0.5, 2.5] },
                { type: 'lava', position: [-4, 3, -15], size: [2.5, 0.5, 2.5] },
                { type: 'jump', position: [0, 4, -20], size: [3, 0.5, 3] },
                { type: 'ice', position: [0, 13, -25], size: [5, 0.5, 3] },
                { type: 'normal', position: [0, 14, -30], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 15, -35],
            spawnPoint: [0, 2, 0]
        },
        17: { // 미로 경로
            name: "미로 경로",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'normal', position: [5, 2, -4], size: [2.5, 0.5, 2.5] },
                { type: 'ice', position: [8, 3, -8], size: [4, 0.5, 3] },
                { type: 'slime', position: [4, 4, -13], size: [3, 0.5, 3] },
                { type: 'moving', position: [-4, 8, -17], size: [3, 0.5, 3], moveData: { endX: 4, endY: 8, endZ: -17, speed: 2.5 } },
                { type: 'lava', position: [0, 9, -22], size: [2.5, 0.5, 2.5] },
                { type: 'jump', position: [0, 10, -27], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 19, -32], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 20, -37],
            spawnPoint: [0, 2, 0]
        },
        18: { // 속도전
            name: "속도전",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'lava', position: [0, 1, -4], size: [3, 0.5, 3] },
                { type: 'lava', position: [0, 2, -8], size: [3, 0.5, 3] },
                { type: 'lava', position: [0, 3, -12], size: [3, 0.5, 3] },
                { type: 'slime', position: [0, 4, -16], size: [3, 0.5, 3] },
                { type: 'lava', position: [0, 7, -20], size: [2.5, 0.5, 2.5] },
                { type: 'lava', position: [0, 8, -24], size: [2.5, 0.5, 2.5] },
                { type: 'normal', position: [0, 9, -28], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 10, -33],
            spawnPoint: [0, 2, 0]
        },
        19: { // 종합 시험
            name: "종합 시험",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'ice', position: [5, 1, -5], size: [4, 0.5, 3] },
                { type: 'slime', position: [5, 2, -10], size: [3, 0.5, 3] },
                { type: 'moving', position: [-5, 6, -15], size: [3, 0.5, 3], moveData: { endX: 5, endY: 8, endZ: -15, speed: 2.0 } },
                { type: 'lava', position: [0, 9, -20], size: [2.5, 0.5, 2.5] },
                { type: 'jump', position: [0, 10, -25], size: [3, 0.5, 3] },
                { type: 'ice', position: [0, 19, -30], size: [5, 0.5, 3] },
                { type: 'slime', position: [5, 20, -35], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 24, -40], size: [3, 0.5, 3] }
            ],
            checkpoint: [0, 25, -45],
            spawnPoint: [0, 2, 0]
        },
        20: { // 최종 도전
            name: "최종 도전",
            platforms: [
                { type: 'normal', position: [0, 0, 0], size: [4, 0.5, 4] },
                { type: 'jump', position: [0, 1, -5], size: [3, 0.5, 3] },
                { type: 'ice', position: [6, 10, -10], size: [4, 0.5, 3] },
                { type: 'slime', position: [6, 11, -15], size: [2.5, 0.5, 2.5] },
                { type: 'moving', position: [-6, 15, -20], size: [3, 0.5, 3], moveData: { endX: 6, endY: 17, endZ: -20, speed: 2.5 } },
                { type: 'lava', position: [0, 18, -25], size: [2.5, 0.5, 2.5] },
                { type: 'lava', position: [4, 19, -29], size: [2.5, 0.5, 2.5] },
                { type: 'jump', position: [-4, 20, -33], size: [3, 0.5, 3] },
                { type: 'ice', position: [0, 29, -38], size: [5, 0.5, 3] },
                { type: 'slime', position: [0, 30, -43], size: [3, 0.5, 3] },
                { type: 'normal', position: [0, 35, -48], size: [4, 0.5, 4] }
            ],
            checkpoint: [0, 36, -53],
            spawnPoint: [0, 2, 0]
        }
    };

    const config = stages[stageNumber];
    if (config) {
        return {
            id: stageNumber,
            name: config.name,
            platforms: config.platforms,
            checkpoint: config.checkpoint,
            spawnPoint: config.spawnPoint
        };
    }

    // Fallback for invalid stage numbers
    return stages[1];
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    // Start button
    document.getElementById('start-button').addEventListener('click', startGame);

    // Retry button
    document.getElementById('retry-button').addEventListener('click', retryGame);

    // Menu button
    document.getElementById('menu-button').addEventListener('click', returnToMenu);

    // Play again button
    document.getElementById('play-again-button').addEventListener('click', playAgain);

    // Pause menu buttons
    document.getElementById('resume-button').addEventListener('click', resumeGame);
    document.getElementById('restart-button').addEventListener('click', retryGame);
    document.getElementById('pause-menu-button').addEventListener('click', returnToMenu);

    // Keyboard controls
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Window resize
    window.addEventListener('resize', onWindowResize);

    // Pointer lock change
    document.addEventListener('pointerlockchange', onPointerLockChange);
}

function startGame() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';

    currentState = GameState.PLAYING;
    currentStage = 1;
    gameStartTime = Date.now();

    loadStage(currentStage);

    // Request pointer lock
    renderer.domElement.requestPointerLock();

    console.log('Game started!');
}

function retryGame() {
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';

    currentState = GameState.PLAYING;
    loadStage(currentStage);

    renderer.domElement.requestPointerLock();
}

function returnToMenu() {
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('victory').style.display = 'none';
    document.getElementById('pause-menu').style.display = 'none';
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('menu').style.display = 'flex';

    currentState = GameState.MENU;
    clearStage();

    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
}

function playAgain() {
    document.getElementById('victory').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';

    currentState = GameState.PLAYING;
    currentStage = 1;
    gameStartTime = Date.now();
    loadStage(currentStage);

    renderer.domElement.requestPointerLock();
}

function pauseGame() {
    if (currentState === GameState.PLAYING) {
        currentState = GameState.PAUSED;
        document.getElementById('pause-menu').style.display = 'flex';
        document.exitPointerLock();
    }
}

function resumeGame() {
    document.getElementById('pause-menu').style.display = 'none';
    currentState = GameState.PLAYING;
    renderer.domElement.requestPointerLock();
}

function gameOver(message) {
    currentState = GameState.GAME_OVER;
    document.getElementById('game-over').style.display = 'flex';
    document.getElementById('game-over-stats').textContent = message || `스테이지 ${currentStage}에서 떨어졌습니다.`;
    document.exitPointerLock();
}

function victory() {
    currentState = GameState.VICTORY;
    const totalTime = Math.floor((Date.now() - gameStartTime) / 1000);
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;
    document.getElementById('victory-stats').textContent = `클리어 시간: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('victory').style.display = 'flex';
    document.exitPointerLock();
}

// ========================================
// KEYBOARD CONTROLS
// ========================================

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            controls.moveForward = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            controls.moveBackward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            controls.moveLeft = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            controls.moveRight = true;
            break;
        case 'Space':
            controls.jump = true;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            controls.isRunning = true;
            break;
        case 'Escape':
            pauseGame();
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            controls.moveForward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            controls.moveBackward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            controls.moveLeft = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            controls.moveRight = false;
            break;
        case 'Space':
            controls.jump = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            controls.isRunning = false;
            break;
    }
}

// ========================================
// CAMERA CONTROLS
// ========================================

function setupCameraControls() {
    renderer.domElement.addEventListener('click', () => {
        if (currentState === GameState.PLAYING && !isMobile) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('mousemove', onMouseMove);
}

function onMouseMove(event) {
    if (!isPointerLocked || currentState !== GameState.PLAYING) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    euler.setFromQuaternion(camera.quaternion);

    euler.y -= movementX * 0.002;
    euler.x -= movementY * 0.002;

    euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));

    camera.quaternion.setFromEuler(euler);
}

function onPointerLockChange() {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
}

// ========================================
// MOBILE CONTROLS
// ========================================

function detectMobile() {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.innerWidth <= 768);

    if (isMobile) {
        document.getElementById('mobile-controls').style.display = 'block';
    }
}

function setupMobileControls() {
    const joystickContainer = document.getElementById('joystick-container');
    const joystickStick = document.getElementById('joystick-stick');
    const jumpBtn = document.getElementById('mobile-jump-btn');
    const runBtn = document.getElementById('mobile-run-btn');

    // Joystick touch events
    let joystickActive = false;
    let joystickTouchId = null;

    joystickContainer.addEventListener('touchstart', (e) => {
        if (joystickTouchId === null) {
            e.preventDefault();
            const touch = e.changedTouches[0];
            joystickTouchId = touch.identifier;
            joystickActive = true;
            updateJoystick(touch);
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (!joystickActive) return;
        for (let touch of e.changedTouches) {
            if (touch.identifier === joystickTouchId) {
                updateJoystick(touch);
                break;
            }
        }
    });

    document.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.identifier === joystickTouchId) {
                joystickActive = false;
                joystickTouchId = null;
                joystickDirection.set(0, 0);
                joystickStick.style.transform = 'translate(-50%, -50%)';
                controls.moveForward = false;
                controls.moveBackward = false;
                controls.moveLeft = false;
                controls.moveRight = false;
                break;
            }
        }
    });

    // Jump button
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        controls.jump = true;
    });

    jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        controls.jump = false;
    });

    // Run button
    runBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        controls.isRunning = true;
    });

    runBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        controls.isRunning = false;
    });

    // Touch camera rotation
    let cameraTouchId = null;
    let lastTouchX = 0;
    let lastTouchY = 0;

    renderer.domElement.addEventListener('touchstart', (e) => {
        if (cameraTouchId === null && e.touches.length > 0) {
            const touch = e.touches[0];
            // Check if touch is not on joystick or buttons
            const rect = joystickContainer.getBoundingClientRect();
            const jumpRect = jumpBtn.getBoundingClientRect();
            const runRect = runBtn.getBoundingClientRect();

            if (!isPointInRect(touch.clientX, touch.clientY, rect) &&
                !isPointInRect(touch.clientX, touch.clientY, jumpRect) &&
                !isPointInRect(touch.clientX, touch.clientY, runRect)) {
                cameraTouchId = touch.identifier;
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
            }
        }
    });

    renderer.domElement.addEventListener('touchmove', (e) => {
        if (cameraTouchId === null) return;
        for (let touch of e.touches) {
            if (touch.identifier === cameraTouchId) {
                const deltaX = touch.clientX - lastTouchX;
                const deltaY = touch.clientY - lastTouchY;

                euler.setFromQuaternion(camera.quaternion);
                euler.y -= deltaX * 0.003;
                euler.x -= deltaY * 0.003;
                euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
                camera.quaternion.setFromEuler(euler);

                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
                break;
            }
        }
    });

    renderer.domElement.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.identifier === cameraTouchId) {
                cameraTouchId = null;
                break;
            }
        }
    });
}

function updateJoystick(touch) {
    const joystickContainer = document.getElementById('joystick-container');
    const joystickStick = document.getElementById('joystick-stick');
    const rect = joystickContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let deltaX = touch.clientX - centerX;
    let deltaY = touch.clientY - centerY;

    const maxDistance = 45;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > maxDistance) {
        deltaX = (deltaX / distance) * maxDistance;
        deltaY = (deltaY / distance) * maxDistance;
    }

    joystickStick.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;

    joystickDirection.x = deltaX / maxDistance;
    joystickDirection.y = deltaY / maxDistance;

    const threshold = 0.2;
    controls.moveForward = joystickDirection.y < -threshold;
    controls.moveBackward = joystickDirection.y > threshold;
    controls.moveLeft = joystickDirection.x < -threshold;
    controls.moveRight = joystickDirection.x > threshold;
}

function isPointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// ========================================
// PHYSICS SYSTEM
// ========================================

function updatePhysics(delta) {
    // Apply gravity
    if (!isOnGround) {
        velocity.y -= GRAVITY * delta;
        velocity.y = Math.max(velocity.y, -TERMINAL_VELOCITY);
    }

    // Ground detection
    checkGroundCollision();

    // Jump
    if (controls.jump && isOnGround && canJump) {
        // Check platform type for jump boost
        if (currentPlatform && currentPlatform.type === 'slime') {
            velocity.y = JUMP_FORCE * 1.5; // Slime boost
        } else {
            velocity.y = JUMP_FORCE;
        }
        isOnGround = false;
        canJump = false;
    }

    // Reset jump when button released
    if (!controls.jump) {
        canJump = true;
    }

    // Jump pad auto-launch
    if (currentPlatform && currentPlatform.type === 'jump' && isOnGround) {
        velocity.y = JUMP_FORCE * 2.5;
        isOnGround = false;
    }

    // Apply velocity
    const speed = controls.isRunning ? runSpeed : playerSpeed;
    const velocityDamping = currentPlatform && currentPlatform.type === 'ice' ? 3.0 : 10.0;

    velocity.x -= velocity.x * velocityDamping * delta;
    velocity.z -= velocity.z * velocityDamping * delta;

    direction.z = Number(controls.moveForward) - Number(controls.moveBackward);
    direction.x = Number(controls.moveRight) - Number(controls.moveLeft);
    direction.normalize();

    if (controls.moveForward || controls.moveBackward) {
        velocity.z -= direction.z * speed * delta * 100;
    }
    if (controls.moveLeft || controls.moveRight) {
        velocity.x -= direction.x * speed * delta * 100;
    }

    // Apply movement
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(camera.up, cameraDirection).normalize();

    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(cameraDirection, -velocity.z * delta);
    moveVector.addScaledVector(right, velocity.x * delta);
    moveVector.y = velocity.y * delta;

    camera.position.add(moveVector);

    // Fall detection
    if (camera.position.y < -20) {
        gameOver();
    }

    // Platform effects
    if (currentPlatform) {
        currentPlatform.handleEffect(camera, delta);
    }
}

function checkGroundCollision() {
    const raycaster = new THREE.Raycaster(
        camera.position,
        new THREE.Vector3(0, -1, 0),
        0,
        2.0
    );

    const platformMeshes = platforms.map(p => p.mesh);
    const intersects = raycaster.intersectObjects(platformMeshes);

    if (intersects.length > 0) {
        const distance = intersects[0].distance;
        if (distance < 1.7) {
            isOnGround = true;
            const platform = intersects[0].object.userData.platform;
            if (currentPlatform !== platform) {
                // Reset lava timer on different platform
                if (currentPlatform && currentPlatform.type === 'lava') {
                    currentPlatform.resetLavaTimer();
                }
                currentPlatform = platform;
            }

            // Prevent falling through platform
            if (velocity.y < 0) {
                velocity.y = 0;
                camera.position.y = intersects[0].point.y + 1.6;
            }
        } else {
            isOnGround = false;
            if (currentPlatform && currentPlatform.type === 'lava') {
                currentPlatform.resetLavaTimer();
            }
            currentPlatform = null;
        }
    } else {
        isOnGround = false;
        if (currentPlatform && currentPlatform.type === 'lava') {
            currentPlatform.resetLavaTimer();
        }
        currentPlatform = null;
    }
}

function checkCheckpointCollision() {
    if (!checkpoint || checkpointReached) return;

    const distance = camera.position.distanceTo(checkpoint.position);
    if (distance < 3) {
        // Reached checkpoint!
        checkpointReached = true;
        currentStage++;
        if (currentStage > totalStages) {
            victory();
        } else {
            showMessage(`스테이지 ${currentStage - 1} 클리어!`);
            setTimeout(() => {
                loadStage(currentStage);
                updateHUD();
            }, 1000);
        }
    }
}

// ========================================
// HUD UPDATES
// ========================================

function updateHUD() {
    // Stage number
    document.getElementById('stage-number').textContent = `${currentStage} / ${totalStages}`;

    // Timer
    if (currentState === GameState.PLAYING) {
        currentTime = Math.floor((Date.now() - gameStartTime) / 1000);
        const minutes = Math.floor(currentTime / 60);
        const seconds = currentTime % 60;
        document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Height
    const height = Math.max(0, Math.floor(camera.position.y));
    document.getElementById('height').textContent = `${height}m`;
}

function showMessage(text) {
    const msgDisplay = document.getElementById('message-display');
    msgDisplay.textContent = text;
    msgDisplay.style.display = 'block';
    setTimeout(() => {
        msgDisplay.style.display = 'none';
    }, 2000);
}

// ========================================
// WINDOW RESIZE
// ========================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ========================================
// ANIMATION LOOP
// ========================================

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (currentState === GameState.PLAYING) {
        updatePhysics(delta);
        checkCheckpointCollision();
        updateHUD();

        // Update platforms
        platforms.forEach(p => p.update(delta));

        // Rotate checkpoint
        if (checkpoint) {
            checkpoint.rotation.y += delta * 2;
        }
    }

    renderer.render(scene, camera);
}

// ========================================
// START
// ========================================

init();
animate();
