function lockOrientation() {
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => { });
    }
}

function checkOrientation() {
    const warning = document.getElementById('orientation-warning');
    if (window.innerHeight > window.innerWidth && window.innerWidth < 768) {
        warning.classList.add('active');
    } else {
        warning.classList.remove('active');
        lockOrientation();
    }
}

window.addEventListener('resize', checkOrientation);
window.addEventListener('load', () => {
    checkOrientation();
    initGame(1);
    setupDragAndDrop();
});

const COLOR_PALETTE = [
    '#ef4444', '#3b82f6', '#22c55e', '#eab308',
    '#a855f7', '#f97316', '#06b6d4', '#ec4899',
    '#84cc16', '#6366f1'
];

const MAX_SLOTS = 4;
let columns = [];
let currentLevel = 1;
let moves = 0;
let soundEnabled = true;

let isDragging = false;
let dragSourceColIdx = null;
let draggedColor = null;
let sameColorChainCount = 0;
let currentHoveredColIdx = null;
let isAnimatingMove = false;

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    document.getElementById('soundToggleBtn').innerText = soundEnabled ? '🔊' : '🔇';
}

function playTone(freq, duration, type = 'sine', delay = 0, gainVal = 0.1) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        setTimeout(() => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(gainVal, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        }, delay * 1000);
    } catch (e) { }
}

function playVictoryFanfare() {
    if (!soundEnabled) return;
    const notes = [
        { f: 523.25, d: 0.12 },
        { f: 659.25, d: 0.12 },
        { f: 783.99, d: 0.12 },
        { f: 1046.50, d: 0.25 },
        { f: 783.99, d: 0.12 },
        { f: 1046.50, d: 0.40 }
    ];

    let cumulativeTime = 0;
    notes.forEach((note) => {
        playTone(note.f, note.d * 1.2, 'triangle', cumulativeTime, 0.2);
        playTone(note.f / 2, note.d * 1.2, 'square', cumulativeTime, 0.08);
        cumulativeTime += note.d;
    });
}

function getLevelConfig(lvl) {
    let clampedLvl = Math.min(Math.max(lvl, 1), 10);
    let colors = clampedLvl + 1;
    let emptyCols = 1;
    return { colors, emptyCols };
}

function updateNavigationButtons() {
    const prevHeader = document.getElementById('prevBtnHeader');
    const nextHeader = document.getElementById('nextBtnHeader');
    const prevModal = document.getElementById('prevBtnModal');
    const nextModal = document.getElementById('nextBtnModal');

    if (currentLevel <= 1) {
        prevHeader.disabled = true;
        prevModal.disabled = true;
    } else {
        prevHeader.disabled = false;
        prevModal.disabled = false;
    }

    if (currentLevel >= 10) {
        nextHeader.disabled = true;
        nextModal.disabled = true;
        nextModal.innerText = 'Fim dos Níveis 🏁';
    } else {
        nextHeader.disabled = false;
        nextModal.disabled = false;
        nextModal.innerText = 'Próximo Nível ➡';
    }
}

function initGame(level = 1) {
    if (level > 10) level = 10;
    if (level < 1) level = 1;
    currentLevel = level;
    moves = 0;
    isDragging = false;
    isAnimatingMove = false;
    dragSourceColIdx = null;
    draggedColor = null;
    sameColorChainCount = 0;
    currentHoveredColIdx = null;

    document.getElementById('levelDisplay').innerText = `Nível ${currentLevel} de 10`;
    document.getElementById('movesDisplay').innerText = `Movimentos: 0`;
    document.getElementById('statusMessage').innerText = '';
    document.getElementById('victory-screen').classList.remove('active');

    updateNavigationButtons();

    const config = getLevelConfig(currentLevel);
    const numColors = config.colors;
    const totalCols = numColors + config.emptyCols;
    const selectedColors = COLOR_PALETTE.slice(0, numColors);

    columns = Array.from({ length: totalCols }, () => []);
    for (let c = 0; c < numColors; c++) {
        for (let r = 0; r < MAX_SLOTS; r++) {
            columns[c].push(selectedColors[c]);
        }
    }

    const shuffleMoves = numColors * 15;
    for (let m = 0; m < shuffleMoves; m++) {
        const nonEmpty = [];
        columns.forEach((col, idx) => { if (col.length > 0) nonEmpty.push(idx); });

        const fromIdx = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
        const availableDest = [];
        columns.forEach((col, idx) => {
            if (idx !== fromIdx && col.length < MAX_SLOTS) availableDest.push(idx);
        });

        if (availableDest.length > 0) {
            const toIdx = availableDest[Math.floor(Math.random() * availableDest.length)];
            columns[toIdx].push(columns[fromIdx].pop());
        }
    }

    renderBoard();
}

function nextLevel() {
    if (currentLevel < 10) {
        initGame(currentLevel + 1);
    }
}

function prevLevel() {
    if (currentLevel > 1) {
        initGame(currentLevel - 1);
    }
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    columns.forEach((col, colIdx) => {
        const track = document.createElement('div');
        track.className = `column-track ${currentHoveredColIdx === colIdx ? 'hovered' : ''}`;
        track.dataset.colIdx = colIdx;

        for (let i = 0; i < MAX_SLOTS; i++) {
            const slot = document.createElement('div');
            slot.className = 'slot';

            const color = col[i];
            if (color) {
                const ball = document.createElement('div');
                ball.className = 'ball draggable';
                ball.style.backgroundColor = color;

                if (isDragging && colIdx === dragSourceColIdx && i === col.length - 1) {
                    ball.style.opacity = '0.0';
                }

                slot.appendChild(ball);
            }
            track.appendChild(slot);
        }

        boardEl.appendChild(track);
    });
}

function setupDragAndDrop() {
    const ghostChain = document.getElementById('ghostChain');

    function handleStart(e) {
        if (isDragging || isAnimatingMove) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const element = document.elementFromPoint(clientX, clientY);
        if (!element) return;

        const track = element.closest('.column-track');
        if (!track) return;

        const colIdx = parseInt(track.dataset.colIdx);
        const col = columns[colIdx];

        if (!col || col.length === 0) return;

        draggedColor = col[col.length - 1];

        sameColorChainCount = 0;
        for (let i = col.length - 1; i >= 0; i--) {
            if (col[i] === draggedColor) sameColorChainCount++;
            else break;
        }

        isDragging = true;
        dragSourceColIdx = colIdx;

        ghostChain.innerHTML = '';
        const gBall = document.createElement('div');
        gBall.className = 'ghost-ball';
        gBall.style.backgroundColor = draggedColor;
        ghostChain.appendChild(gBall);

        ghostChain.classList.remove('hidden');
        updateGhostPosition(clientX, clientY);

        playTone(440, 0.08, 'sine');
        renderBoard();

        if (e.cancelable) e.preventDefault();
    }

    function handleMove(e) {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        updateGhostPosition(clientX, clientY);

        const element = document.elementFromPoint(clientX, clientY);
        if (element) {
            const track = element.closest('.column-track');
            if (track) {
                const hoveredIdx = parseInt(track.dataset.colIdx);
                if (currentHoveredColIdx !== hoveredIdx) {
                    currentHoveredColIdx = hoveredIdx;
                    renderBoard();
                }
            } else if (currentHoveredColIdx !== null) {
                currentHoveredColIdx = null;
                renderBoard();
            }
        }
    }

    function handleEnd(e) {
        if (!isDragging) return;

        ghostChain.classList.add('hidden');

        if (currentHoveredColIdx !== null && currentHoveredColIdx !== dragSourceColIdx) {
            executeMoveWithTrajectoryAnimation(dragSourceColIdx, currentHoveredColIdx);
        } else {
            playTone(250, 0.08, 'sine');
            isDragging = false;
            dragSourceColIdx = null;
            currentHoveredColIdx = null;
            renderBoard();
        }
    }

    function updateGhostPosition(x, y) {
        ghostChain.style.left = `${x}px`;
        ghostChain.style.top = `${y - 25}px`;
    }

    window.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    window.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
}

async function executeMoveWithTrajectoryAnimation(fromIdx, toIdx) {
    const sourceCol = columns[fromIdx];
    const destCol = columns[toIdx];

    if (sourceCol.length === 0) return;

    const availableSpace = MAX_SLOTS - destCol.length;
    if (availableSpace <= 0) {
        playTone(180, 0.15, 'sawtooth');
        isDragging = false;
        dragSourceColIdx = null;
        currentHoveredColIdx = null;
        renderBoard();
        return;
    }

    const moveCount = Math.min(sameColorChainCount, availableSpace);

    isDragging = false;
    isAnimatingMove = true;
    currentHoveredColIdx = null;

    const boardEl = document.getElementById('board');
    const tracks = boardEl.children;

    for (let i = 0; i < moveCount; i++) {
        const fromTrack = tracks[fromIdx];
        const toTrack = tracks[toIdx];

        const sourceSlotIndex = sourceCol.length - 1;
        const sourceSlotEl = fromTrack.children[sourceSlotIndex];
        const sourceRect = sourceSlotEl ? sourceSlotEl.getBoundingClientRect() : fromTrack.getBoundingClientRect();

        const targetSlotIndex = destCol.length;
        const targetSlotEl = toTrack.children[targetSlotIndex];
        const targetRect = targetSlotEl ? targetSlotEl.getBoundingClientRect() : toTrack.getBoundingClientRect();

        const colorToMove = sourceCol.pop();
        renderBoard();

        const flyingBall = document.createElement('div');
        flyingBall.className = 'flying-ball';
        flyingBall.style.backgroundColor = colorToMove;

        const startX = sourceRect.left + (sourceRect.width / 2) - 15;
        const startY = sourceRect.top + (sourceRect.height / 2) - 15;

        const boardRect = boardEl.getBoundingClientRect();
        const apexY = boardRect.top - 40;

        const endX = targetRect.left + (targetRect.width / 2) - 15;
        const endY = targetRect.top + (targetRect.height / 2) - 15;

        flyingBall.style.left = `${startX}px`;
        flyingBall.style.top = `${startY}px`;
        document.body.appendChild(flyingBall);

        flyingBall.getBoundingClientRect();

        flyingBall.style.left = `${startX}px`;
        flyingBall.style.top = `${apexY}px`;
        await sleep(100);

        flyingBall.style.left = `${endX}px`;
        flyingBall.style.top = `${apexY}px`;
        await sleep(120);

        flyingBall.style.left = `${endX}px`;
        flyingBall.style.top = `${endY}px`;
        await sleep(100);

        flyingBall.remove();

        destCol.push(colorToMove);
        playTone(587.33 + (i * 30), 0.08, 'sine');
        renderBoard();
    }

    moves++;
    document.getElementById('movesDisplay').innerText = `Movimentos: ${moves}`;

    isAnimatingMove = false;
    dragSourceColIdx = null;

    checkVictory();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkVictory() {
    let isWon = true;

    for (let col of columns) {
        if (col.length > 0) {
            if (col.length !== MAX_SLOTS) {
                isWon = false;
                break;
            }
            const firstColor = col[0];
            if (!col.every(color => color === firstColor)) {
                isWon = false;
                break;
            }
        }
    }

    if (isWon) {
        const praises = ["BOM TRABALHO!", "MUITO BEM!", "EXCELENTE!", "PERFEITO!"];
        document.getElementById('victoryText').innerText = praises[Math.floor(Math.random() * praises.length)];
        document.getElementById('statusMessage').innerText = '🎉 Nível Concluído!';
        playVictoryFanfare();

        document.getElementById('victory-screen').classList.add('active');

        for (let i = 0; i < 25; i++) {
            setTimeout(() => {
                createBalloon();
            }, i * 120);
        }

        if (window.confetti) {
            confetti({
                particleCount: 120,
                spread: 80,
                origin: { y: 0.6 }
            });
        }
    }
}

function createBalloon() {
    const balloon = document.createElement('div');
    balloon.className = 'balloon';
    balloon.style.left = `${Math.random() * 85 + 5}vw`;
    balloon.style.backgroundColor = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    balloon.style.animationDuration = `${Math.random() * 2 + 3}s`;

    document.getElementById('victory-screen').appendChild(balloon);

    setTimeout(() => {
        balloon.remove();
    }, 5000);
}