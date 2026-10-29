const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const uiOverlay = document.getElementById('overlay-ui');
const uiTitle = document.getElementById('ui-title');
const uiSubtitle = document.getElementById('ui-subtitle');

// Sintetizador de Audio Web
const AudioSys = {
    ctx: null,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    play(freq, type, duration, sweepFreq = null) {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            if (sweepFreq) {
                osc.frequency.exponentialRampToValueAtTime(sweepFreq, this.ctx.currentTime + duration);
            }
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {}
    },
    jump() { this.play(150, 'square', 0.15, 400); },
    dash() { this.play(600, 'sawtooth', 0.1, 150); },
    coin() { this.play(800, 'sine', 0.1, 1200); },
    hit() { this.play(120, 'sawtooth', 0.25, 40); },
    win() { this.play(400, 'sine', 0.4, 800); }
};

// Variables del sistema
let canvasWidth = 800;
let canvasHeight = 450;
let gameState = 'START'; // 'START', 'PLAYING', 'GAMEOVER', 'WIN'
let score = 0;
let particles = [];

// Teclas e inputs
const keys = { left: false, right: false, jump: false, dash: false };

function resizeCanvas() {
    const aspect = 16 / 9;
    let w = window.innerWidth;
    let h = window.innerHeight;

    if (w / h > aspect) {
        w = h * aspect;
    } else {
        h = w / aspect;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Clase Jugador
class Player {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 50;
        this.y = 300;
        this.w = 24;
        this.h = 32;
        this.vx = 0;
        this.vy = 0;
        this.speed = 4.5;
        this.jumpForce = -9.5;
        this.gravity = 0.45;
        this.grounded = false;
        this.jumpsLeft = 2;
        this.dashCooldown = 0;
        this.dashTimer = 0;
        this.isDashing = false;
        this.facing = 1;
    }

    update() {
        // Dash
        if (this.dashTimer > 0) {
            this.dashTimer--;
            this.vy = 0;
            this.vx = this.facing * 12;
            createParticle(this.x + this.w / 2, this.y + this.h / 2, '#00f3ff');
        } else {
            this.isDashing = false;
            // Movimiento Horizontal
            if (keys.left) {
                this.vx = -this.speed;
                this.facing = -1;
            } else if (keys.right) {
                this.vx = this.speed;
                this.facing = 1;
            } else {
                this.vx *= 0.7;
            }

            // Gravedad
            this.vy += this.gravity;
        }

        if (this.dashCooldown > 0) this.dashCooldown--;

        // Aplicar movimiento
        this.x += this.vx;
        this.y += this.vy;

        // Límites del mundo
        if (this.x < 0) this.x = 0;
        if (this.y > canvasHeight + 100) gameOver();
    }

    jump() {
        if (this.jumpsLeft > 0) {
            this.vy = this.jumpForce;
            this.jumpsLeft--;
            this.grounded = false;
            AudioSys.jump();
            for (let i = 0; i < 6; i++) {
                createParticle(this.x + this.w / 2, this.y + this.h, '#ff0055');
            }
        }
    }

    dash() {
        if (this.dashCooldown === 0) {
            this.isDashing = true;
            this.dashTimer = 10;
            this.dashCooldown = 40;
            AudioSys.dash();
        }
    }

    draw() {
        ctx.fillStyle = this.isDashing ? '#ffffff' : '#00f3ff';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00f3ff';
        ctx.fillRect(this.x, this.y, this.w, this.h);

        // Ojo neón según orientación
        ctx.fillStyle = '#ff0055';
        const eyeX = this.facing === 1 ? this.x + 14 : this.x + 4;
        ctx.fillRect(eyeX, this.y + 6, 6, 6);
        ctx.shadowBlur = 0;
    }
}

// Plataformas
class Platform {
    constructor(x, y, w, h, type = 'normal', moveRange = 0) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.type = type; // 'normal', 'moving', 'breakable'
        this.startX = x;
        this.moveRange = moveRange;
        this.dir = 1;
        this.broken = false;
    }

    update() {
        if (this.type === 'moving') {
            this.x += 1.5 * this.dir;
            if (Math.abs(this.x - this.startX) > this.moveRange) {
                this.dir *= -1;
            }
        }
    }

    draw() {
        if (this.broken) return;
        ctx.shadowBlur = 8;
        if (this.type === 'normal') {
            ctx.fillStyle = '#1a1a3a';
            ctx.strokeStyle = '#00f3ff';
            ctx.shadowColor = '#00f3ff';
        } else if (this.type === 'moving') {
            ctx.fillStyle = '#2a1a3a';
            ctx.strokeStyle = '#ff0055';
            ctx.shadowColor = '#ff0055';
        } else if (this.type === 'breakable') {
            ctx.fillStyle = '#3a2a1a';
            ctx.strokeStyle = '#ffcc00';
            ctx.shadowColor = '#ffcc00';
        }

        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.w, this.h);
        ctx.shadowBlur = 0;
    }
}

// Orbes Recolectables
class Coin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.r = 7;
        this.collected = false;
    }

    draw() {
        if (this.collected) return;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff0055';
        ctx.fillStyle = '#ff0055';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// Obstáculos Láser
class Laser {
    constructor(x, y, h) {
        this.x = x;
        this.y = y;
        this.h = h;
        this.timer = 0;
    }

    update() {
        this.timer += 0.05;
    }

    draw() {
        const active = Math.sin(this.timer) > -0.2;
        if (active) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ff0000';
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x, this.y + this.h);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    isActive() {
        return Math.sin(this.timer) > -0.2;
    }
}

// Partículas
function createParticle(x, y, color) {
    particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 20,
        color: color
    });
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
        if (p.life <= 0) particles.splice(i, 1);
    }
}

// Inicialización de Niveles
let player = new Player();
let platforms = [];
let coins = [];
let lasers = [];
let goal = { x: 0, y: 0, w: 30, h: 40 };

function initLevel() {
    score = 0;
    player.reset();

    platforms = [
        new Platform(0, 380, 200, 20),
        new Platform(240, 320, 100, 15, 'moving', 40),
        new Platform(390, 260, 90, 15, 'breakable'),
        new Platform(520, 200, 120, 15),
        new Platform(680, 280, 100, 15, 'moving', 60),
        new Platform(820, 220, 120, 15)
    ];

    coins = [
        new Coin(290, 280),
        new Coin(435, 220),
        new Coin(580, 160),
        new Coin(730, 240)
    ];

    lasers = [
        new Laser(360, 200, 120)
    ];

    goal = { x: 890, y: 170, w: 30, h: 50 };
}

// Detectar Colisiones
function checkCollisions() {
    player.grounded = false;

    // Plataformas
    platforms.forEach(p => {
        if (p.broken) return;

        if (player.x < p.x + p.w &&
            player.x + player.w > p.x &&
            player.y + player.h > p.y &&
            player.y + player.h < p.y + p.h + player.vy) {
            
            player.grounded = true;
            player.jumpsLeft = 2;
            player.vy = 0;
            player.y = p.y - player.h;

            if (p.type === 'moving') {
                player.x += 1.5 * p.dir;
            }
            if (p.type === 'breakable') {
                setTimeout(() => { p.broken = true; }, 350);
            }
        }
    });

    // Orbes
    coins.forEach(c => {
        if (!c.collected &&
            Math.hypot(player.x + player.w / 2 - c.x, player.y + player.h / 2 - c.y) < player.w / 2 + c.r) {
            c.collected = true;
            score += 100;
            AudioSys.coin();
        }
    });

    // Láseres
    lasers.forEach(l => {
        if (l.isActive() &&
            player.x < l.x + 2 && player.x + player.w > l.x - 2 &&
            player.y < l.y + l.h && player.y + player.h > l.y) {
            if (!player.isDashing) gameOver();
        }
    });

    // Meta
    if (player.x < goal.x + goal.w &&
        player.x + player.w > goal.x &&
        player.y < goal.y + goal.h &&
        player.y + player.h > goal.y) {
        winGame();
    }
}

// Control del flujo del juego
function startGame() {
    AudioSys.init();
    initLevel();
    gameState = 'PLAYING';
    uiOverlay.style.display = 'none';
}

function gameOver() {
    AudioSys.hit();
    gameState = 'GAMEOVER';
    uiTitle.innerText = 'SISTEMA FALLIDO';
    uiSubtitle.innerText = `Puntuación: ${score} - Toca JUGAR para reiniciar`;
    uiOverlay.style.display = 'block';
}

function winGame() {
    AudioSys.win();
    gameState = 'WIN';
    uiTitle.innerText = '¡NIVEL COMPLETADO!';
    uiSubtitle.innerText = `Puntuación Total: ${score}`;
    uiOverlay.style.display = 'block';
}

// Bucle Principal de Renderizado
function gameLoop() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (gameState === 'PLAYING') {
        player.update();
        checkCollisions();

        // Camara centrada en el jugador
        ctx.save();
        let cameraX = Math.max(0, player.x - canvasWidth / 3);
        ctx.translate(-cameraX, 0);

        // Renderizar elementos
        platforms.forEach(p => { p.update(); p.draw(); });
        coins.forEach(c => c.draw());
        lasers.forEach(l => { l.update(); l.draw(); });

        // Meta (Portal Neón)
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f3ff';
        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
        ctx.shadowBlur = 0;

        player.draw();
        updateParticles();

        ctx.restore();

        // Renderizar HUD (Puntos)
        ctx.fillStyle = '#00f3ff';
        ctx.font = '16px monospace';
        ctx.fillText(`SCORE: ${score}`, 20, 30);
    }

    requestAnimationFrame(gameLoop);
}

// Manejadores de Controles
function bindTouch(elementId, action) {
    const btn = document.getElementById(elementId);
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        AudioSys.init();
        if (action === 'jump') player.jump();
        else if (action === 'dash') player.dash();
        else keys[action] = true;
    });
    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (action !== 'jump' && action !== 'dash') keys[action] = false;
    });
}

bindTouch('btn-left', 'left');
bindTouch('btn-right', 'right');
bindTouch('btn-jump', 'jump');
bindTouch('btn-dash', 'dash');

window.addEventListener('keydown', (e) => {
    AudioSys.init();
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (!keys.jump) player.jump();
        keys.jump = true;
    }
    if (e.code === 'ShiftLeft' || e.code === 'KeyK') player.dash();
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jump = false;
});

// Iniciar animación
gameLoop();