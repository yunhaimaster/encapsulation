// 導入必要的 Firebase 函數
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    limit, 
    getDocs, 
    deleteDoc, 
    doc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// 遊戲配置
const GAME_CONFIG = {
    GAME_DURATION: 20,    // 遊戲時長（秒）
    FILL_SPEED: 0.5,     // 基礎填充速度
    PERFECT_THRESHOLD: 2, // 完美判定範圍
    GOOD_THRESHOLD: 5,    // 好判定範圍
    BASE_SCORE: {
        PERFECT: 100,    // 基礎完美分數
        GOOD: 50,        // 基礎好分數
    },
    SPEED_BONUS: {
        THRESHOLD: 60,   // 速度獎勵閾值（%）
        MULTIPLIER: 1.5  // 速度獎勵倍數
    },
    ACCURACY_THRESHOLD: 5,// 基礎準確度閾值
    COMBO_MULTIPLIER: 1.2,// 連擊倍率
    BONUS_TIME: 3,       // 完美填充獎勵時間（秒）
    COMBO_REQUIREMENT: 3,  // 達到連擊所需次數
    MOVING_TARGET_CHANCE: 0.3, // 移動目標出現機率
    POWERUP_SPAWN_RATE: 0.25,  // 道具生成機率
    TARGET_SPEED: 2,      // 目標移動速度 (px/ms)
    CRITICAL_ZONE: 3      // 精準區間(完美判定範圍)
};

// 遊戲狀態
let gameState = {
    isPlaying: false,
    score: 0,
    timeRemaining: GAME_CONFIG.GAME_DURATION,
    currentLevel: 0,
    targetLevel: 0,
    combo: 0,            // 連擊數
    perfectCount: 0,     // 完美次數
    totalAttempts: 0,    // 總嘗試次數
    bestCombo: 0,        // 最佳連擊
    timeBonus: 0,        // 時間獎勵
    gameTimer: null,
    fillInterval: null,
    comboCount: 0,
    isMovingTarget: false,
    powerupActive: null,
    powerupEndTime: 0,
    targetPosition: 0,
    targetDirection: 1,
    doubleTargets: [0, 0]
};

// DOM 元素
const elements = {
    timeDisplay: document.getElementById('time'),
    scoreDisplay: document.getElementById('score'),
    fillButton: document.getElementById('fillButton'),
    startButton: document.getElementById('startGame'),
    currentLevel: document.getElementById('currentLevel'),
    targetLine: document.getElementById('targetLine'),
    targetAmount: document.getElementById('targetAmount'),
    gameMessages: document.getElementById('gameMessages'),
    accuracyDisplay: document.getElementById('accuracy')
};

// Add this near the start of the file, after the elements declaration
elements.fillButton.style.touchAction = 'none'; // Prevent any default touch actions

// 修改音效處理
const sounds = {
    success: document.getElementById('successSound'),
    error: document.getElementById('errorSound'),
    initialized: false,
    
    // 初始化音效
    async init() {
        if (this.initialized) return;
        
        try {
            // 檢查音效元素是否存在
            if (!this.success || !this.error) {
                console.error('找不到音效元素');
                return;
            }

            // 檢查音效文件是否可以播放
            await Promise.all([
                this.success.play().then(() => this.success.pause()),
                this.error.play().then(() => this.error.pause())
            ]);

            // 重置音效
            this.success.currentTime = 0;
            this.error.currentTime = 0;
            
            // 設置音量
            this.success.volume = 0.5;
            this.error.volume = 0.5;
            
            this.initialized = true;
            console.log('音效初始化成功');
        } catch (error) {
            console.error('音效初始化失敗:', error);
        }
    },
    
    // 播放音效的安全方法
    async playSound(type) {
        if (!this.initialized) {
            await this.init();
        }

        try {
            const sound = this[type];
            if (!sound) {
                console.error(`找不到音效: ${type}`);
                return;
            }
            
            // 重置並播放
            sound.currentTime = 0;
            await sound.play();
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                console.log('瀏覽器阻止了自動播放，需要用戶互動');
            } else {
                console.error('音效播放失敗:', error);
            }
        }
    }
};

// 防止頁面縮放
document.addEventListener('touchmove', function(event) {
    if (event.scale !== 1) {
        event.preventDefault();
    }
}, { passive: false });

// 遊戲初始化
function initGame() {
    gameState.isPlaying = false;
    gameState.score = 0;
    gameState.timeRemaining = GAME_CONFIG.GAME_DURATION;
    gameState.currentLevel = 0;
    gameState.combo = 0;
    gameState.perfectCount = 0;
    gameState.totalAttempts = 0;
    gameState.bestCombo = 0;
    
    // 清除任何現有的計時器
    if (gameState.gameTimer) {
        clearInterval(gameState.gameTimer);
        gameState.gameTimer = null;
    }
    if (gameState.fillInterval) {
        clearInterval(gameState.fillInterval);
        gameState.fillInterval = null;
    }
    
    updateDisplay();
    generateNewTarget();
    setupEventListeners();
}

// 開始遊戲
function startGame() {
    if (gameState.isPlaying) return;
    
    // 初始化遊戲狀態
    initGame();
    gameState.isPlaying = true;
    gameState.timeRemaining = GAME_CONFIG.GAME_DURATION; // 重置時間
    
    // 更新按鈕狀態
    elements.startButton.disabled = true;
    elements.fillButton.disabled = false;
    elements.startButton.classList.add('disabled');
    elements.gameMessages.textContent = '遊戲開始！';
    
    // 開始計時
    updateDisplay(); // 立即更新顯示
    
    gameState.gameTimer = setInterval(() => {
        if (gameState.timeRemaining > 0) {
            gameState.timeRemaining--;
            updateDisplay();
            
            if (gameState.timeRemaining <= 0) {
                endGame();
            }
        }
    }, 1000); // 使用1000毫秒（1秒）作為間隔
}

// 添加名字輸入相關函數
const nameInputModal = {
    element: document.querySelector('.name-input-modal'),
    scoreDisplay: document.querySelector('.final-score'),
    input: document.getElementById('playerName'),
    submitButton: document.querySelector('.submit-button'),
    
    show(score) {
        this.scoreDisplay.textContent = score;
        this.element.classList.add('active');
        this.input.value = '';
        this.input.focus();
    },
    
    hide() {
        this.element.classList.remove('active');
    },
    
    async getPlayerName(score) {
        return new Promise((resolve) => {
            this.show(score);
            
            const handleSubmit = () => {
                const name = this.input.value.trim();
                if (name) {
                    this.hide();
                    resolve(name);
                } else {
                    this.input.classList.add('error');
                    setTimeout(() => this.input.classList.remove('error'), 500);
                }
            };
            
            this.submitButton.onclick = handleSubmit;
            this.input.onkeypress = (e) => {
                if (e.key === 'Enter') handleSubmit();
            };
        });
    }
};

// 修改高分處理相關函數
const highscoreManager = {
    async saveScore(score) {
        try {
            const highscores = await this.getHighscores();
            
            if (highscores.length < 3 || score > highscores[highscores.length - 1].score) {
                // 獲取玩家名字
                const playerName = await nameInputModal.getPlayerName(score);
                
                try {
                    const highscoresRef = collection(window.db, 'highscores');
                    await addDoc(highscoresRef, {
                        name: playerName,
                        score: score,
                        timestamp: serverTimestamp(),
                        createdAt: new Date().toISOString()
                    });
                    
                    if (highscores.length >= 3) {
                        const lowestScore = highscores[highscores.length - 1];
                        await deleteDoc(doc(window.db, 'highscores', lowestScore.id));
                    }
                    
                    await this.displayHighscores();
                    return true;
                } catch (error) {
                    console.error('保存分數時出錯：', error);
                    return false;
                }
            }
            return false;
        } catch (error) {
            console.error('檢查最高分時出錯：', error);
            return false;
        }
    },
    
    async getHighscores() {
        try {
            console.log('開始獲取最高分...');
            const highscoresRef = collection(window.db, 'highscores');
            console.log('集合引用創建成功');
            
            const q = query(highscoresRef, 
                orderBy('score', 'desc'),
                limit(3)
            );
            console.log('查詢創建成功');
            
            const snapshot = await getDocs(q);
            console.log('獲取文檔成功，文檔數量：', snapshot.size);
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('獲取最高分時出錯：', error.message, error.code);
            console.error('完整錯誤：', error);
            return [];
        }
    },
    
    async displayHighscores() {
        const highscoresList = document.getElementById('highscoresList');
        try {
            highscoresList.innerHTML = '<div class="loading">載入中...</div>';
            const highscores = await this.getHighscores();
            
            if (highscores.length === 0) {
                highscoresList.innerHTML = '<div class="highscore-item">暫無記錄</div>';
                return;
            }
            
            highscoresList.innerHTML = highscores
                .map((score, index) => `
                    <div class="highscore-item">
                        <div class="highscore-info">
                            <span class="highscore-rank">第 ${index + 1} 名</span>
                            <span class="highscore-name">${score.name || '匿名'}</span>
                        </div>
                        <span class="highscore-score">${score.score} 分</span>
                    </div>
                `).join('');
        } catch (error) {
            console.error('顯示最高分時出錯：', error.message, error.code);
            highscoresList.innerHTML = '<div class="error">載入失敗</div>';
        }
    }
};

// 修改 endGame 函數
async function endGame() {
    gameState.isPlaying = false;
    clearInterval(gameState.gameTimer);
    clearInterval(gameState.fillInterval);
    
    elements.startButton.disabled = false;
    elements.fillButton.disabled = true;
    elements.startButton.classList.remove('disabled');
    
    // 檢查是否創造新記錄
    const isNewHighscore = await highscoreManager.saveScore(gameState.score);
    
    // 顯示結束統計
    const stats = `
    🎯 最終得分：${gameState.score}
    ✨ 完美次數：${gameState.perfectCount}
    🔥 最佳連擊：${gameState.bestCombo}
    📊 準確率：${Math.round((gameState.perfectCount / gameState.totalAttempts) * 100)}%
    ⭐ 總嘗試次數：${gameState.totalAttempts}
    `;
    
    elements.gameMessages.innerHTML = stats.split('\n').join('<br>') + 
        (isNewHighscore ? '<br>🎉 新記錄！' : '');
}

// 生成新目標
function generateNewTarget() {
    gameState.targetLevel = Math.floor(Math.random() * 50) + 40; // 40-90%
    elements.targetLine.style.bottom = `${gameState.targetLevel}%`;
    elements.targetAmount.textContent = `${gameState.targetLevel}`; // 確保更新顯示
    gameState.currentLevel = 0;
    updatePowderLevel();
}

// 更新顯示
function updateDisplay() {
    elements.timeDisplay.textContent = gameState.timeRemaining;
    elements.scoreDisplay.textContent = gameState.score;
}

// 更新粉末水平
function updatePowderLevel() {
    elements.currentLevel.style.height = `${gameState.currentLevel}%`;
}

// 修改檢查準確度函數
function checkAccuracy() {
    const difference = Math.abs(gameState.currentLevel - gameState.targetLevel);
    const fillSpeed = gameState.currentLevel;
    gameState.totalAttempts++;
    
    let baseScore = 0;
    let speedBonus = 0;
    let message = '';
    let isSuccess = false;

    // 基礎分數和精確性計算
    if (difference <= GAME_CONFIG.PERFECT_THRESHOLD) {
        baseScore = GAME_CONFIG.BASE_SCORE.PERFECT;
        message = '完美！';
        isSuccess = true;
        gameState.perfectCount++;
        // 更新精確性（添加安全檢查）
        if (elements.accuracyDisplay) {
            elements.accuracyDisplay.textContent = Math.round((gameState.perfectCount / gameState.totalAttempts) * 100);
        }
    } else if (difference <= GAME_CONFIG.GOOD_THRESHOLD) {
        baseScore = GAME_CONFIG.BASE_SCORE.GOOD;
        message = '很好！';
        isSuccess = true;
        // 更新精確性（添加安全檢查）
        if (elements.accuracyDisplay) {
            elements.accuracyDisplay.textContent = Math.round((gameState.perfectCount / gameState.totalAttempts) * 100);
        }
    }

    // 速度獎勵計算
    if (isSuccess && fillSpeed >= GAME_CONFIG.SPEED_BONUS.THRESHOLD) {
        speedBonus = baseScore * (GAME_CONFIG.SPEED_BONUS.MULTIPLIER - 1);
        message += ` +${Math.round(speedBonus)}分速度獎勵！🚀`;
    }

    // 總分計算
    const totalScore = Math.round(baseScore + speedBonus);
    
    if (isSuccess) {
        message = `${message} +${totalScore}分 ✨`;
        gameState.score += totalScore;
    } else {
        message = `差了${Math.round(difference)}%！再試一次 💪`;
    }

    // 顯示消息和更新UI
    showGameMessage(message, isSuccess);
    updateStats();
    updateDisplay();

    // 重要：延遲後重置並生成新目標
    setTimeout(() => {
        gameState.currentLevel = 0;
        updatePowderLevel();
        generateNewTarget();
    }, isSuccess ? 800 : 500);
}

// 添加粒子特效
function showParticleEffect(type) {
    const container = document.querySelector('.capsule-container');
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = `particle ${type}`;
        
        // 隨機位置和動畫
        const angle = (Math.random() * 360) * (Math.PI / 180);
        const velocity = 2 + Math.random() * 2;
        const x = Math.cos(angle) * velocity;
        const y = Math.sin(angle) * velocity;
        
        particle.style.left = '50%';
        particle.style.bottom = '50%';
        
        container.appendChild(particle);
        
        // 動畫
        particle.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${x * 50}px, ${y * 50}px) scale(0)`, opacity: 0 }
        ], {
            duration: 1000,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        }).onfinish = () => particle.remove();
    }
}

// 添加顯示遊戲消息的函數
function showGameMessage(message, isSuccess) {
    elements.gameMessages.textContent = message;
    elements.gameMessages.className = `game-messages ${isSuccess ? 'success' : 'error'}`;
    
    if (isSuccess) {
        sounds.playSound('success');
    } else {
        sounds.playSound('error');
    }
}

// 添加更新統計的函數
function updateStats() {
    // 可以在這裡添加更多統計更新邏輯
    updateDisplay();
}

// 修改事件監聽器的設置
function setupEventListeners() {
    // 移除所有現有的事件監聽器
    elements.fillButton.removeEventListener('touchstart', startFilling);
    elements.fillButton.removeEventListener('touchend', stopFilling);
    elements.fillButton.removeEventListener('touchcancel', stopFilling);
    elements.fillButton.removeEventListener('mousedown', startFilling);
    elements.fillButton.removeEventListener('mouseup', stopFilling);
    elements.fillButton.removeEventListener('mouseleave', stopFilling);

    // 重新添加事件監聽器
    elements.fillButton.addEventListener('touchstart', startFilling, { passive: false });
    elements.fillButton.addEventListener('touchend', stopFilling, { passive: false });
    elements.fillButton.addEventListener('touchcancel', stopFilling, { passive: false });
    elements.fillButton.addEventListener('mousedown', startFilling);
    elements.fillButton.addEventListener('mouseup', stopFilling);
    elements.fillButton.addEventListener('mouseleave', stopFilling);

    // 防止觸摸事件和滑鼠事件同時觸發
    let isTouching = false;
    elements.fillButton.addEventListener('touchstart', () => { isTouching = true; });
    elements.fillButton.addEventListener('touchend', () => { 
        setTimeout(() => { isTouching = false; }, 100);
    });

    elements.fillButton.addEventListener('mousedown', (e) => {
        if (isTouching) e.preventDefault();
    });
}

// 修改 startFilling 函數
function startFilling(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!gameState.isPlaying) return;
    
    // 確保之前的填充已經停止
    if (gameState.fillInterval) {
        stopFilling();
        return;
    }

    elements.fillButton.classList.add('active');
    
    let lastTimestamp = performance.now();
    
    const fill = (timestamp) => {
        if (!gameState.fillInterval) return;
        
        const deltaTime = timestamp - lastTimestamp;
        lastTimestamp = timestamp;
        
        if (gameState.currentLevel < 100) {
            gameState.currentLevel += (GAME_CONFIG.FILL_SPEED * deltaTime) / 16.67;
            updatePowderLevel();
            requestAnimationFrame(fill);
        }
    };
    
    gameState.fillInterval = true;
    requestAnimationFrame(fill);
}

// 修改 stopFilling 函數
function stopFilling(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    elements.fillButton.classList.remove('active');
    gameState.fillInterval = false;
    updatePowderLevel();
    
    if (gameState.isPlaying) {
        checkAccuracy();
    }
}

// 事件監聽器
elements.startButton.addEventListener('click', startGame);

// 禁用長按選單
elements.fillButton.addEventListener('contextmenu', (e) => e.preventDefault());

// 修改載入過程
async function initializeGame() {
    const tasks = [
        { name: '載入遊戲資源', duration: 500 },
        { name: '初始化系統', duration: 800 },
        { name: '連接資料庫', duration: 700 },
        { name: '準備遊戲環境', duration: 500 }
    ];
    
    let progress = 0;
    const progressPerTask = 100 / tasks.length;
    
    try {
        for (const task of tasks) {
            loadingScreen.updateProgress(progress, `${task.name}...`);
            await new Promise(resolve => setTimeout(resolve, task.duration));
            progress += progressPerTask;
        }
        
        loadingScreen.updateProgress(100, '載入完成！');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 確保載入畫面完全隱藏
        loadingScreen.element.style.display = 'none';
        
        // 初始化遊戲和顯示排行榜
        initGame();
        highscoreManager.displayHighscores();
        
    } catch (error) {
        console.error('載入過程出錯：', error);
        loadingScreen.updateProgress(100, '載入失敗，請重新整理頁面');
    }
}

// 修改載入畫面相關函數
const loadingScreen = {
    element: document.querySelector('.loading-screen'),
    progressBar: document.querySelector('.progress-fill'),
    progressNumber: document.querySelector('.progress-number'),
    loadingText: document.querySelector('.loading-text'),
    
    updateProgress(progress, text) {
        this.progressBar.style.width = `${progress}%`;
        this.progressNumber.textContent = Math.round(progress);
        if (text) {
            this.loadingText.textContent = text;
        }
    },
    
    hide() {
        this.element.style.display = 'none'; // 改用 display: none
    },
    
    show() {
        this.element.style.display = 'flex'; // 使用 flex 顯示
    }
};

// 在文檔載入時初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeGame().then(() => {
        initGame();
        highscoreManager.displayHighscores();
    });
}); 