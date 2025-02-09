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

// 遊戲配置
const GAME_CONFIG = {
    GAME_DURATION: 20,    // 遊戲時長（秒）
    FILL_SPEED: 0.5,     // 填充速度（每10毫秒增加的百分比）
    ACCURACY_THRESHOLD: 5 // 準確度閾值（允許的誤差範圍）
};

// 遊戲狀態
let gameState = {
    isPlaying: false,
    score: 0,
    timeRemaining: GAME_CONFIG.GAME_DURATION,
    currentLevel: 0,
    targetLevel: 0,
    gameTimer: null,
    fillInterval: null
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
    gameMessages: document.getElementById('gameMessages')
};

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
    
    updateDisplay();
    generateNewTarget();
    
    // 重置按鈕狀態
    elements.fillButton.disabled = true;
}

// 開始遊戲
function startGame() {
    if (gameState.isPlaying) return;
    
    // 用戶互動時初始化音效
    sounds.init();
    
    initGame();
    gameState.isPlaying = true;
    elements.startButton.disabled = true;
    elements.fillButton.disabled = false;
    elements.startButton.classList.add('disabled');
    elements.gameMessages.textContent = '遊戲開始！';
    
    gameState.gameTimer = setInterval(() => {
        gameState.timeRemaining--;
        updateDisplay();
        
        if (gameState.timeRemaining <= 0) {
            endGame();
        }
    }, 1000);
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
    
    elements.gameMessages.textContent = `遊戲結束！最終得分：${gameState.score}` + 
        (isNewHighscore ? ' 🎉 新記錄！' : '');
}

// 生成新目標
function generateNewTarget() {
    gameState.targetLevel = Math.floor(Math.random() * 80) + 10; // 10-90%
    elements.targetLine.style.bottom = `${gameState.targetLevel}%`;
    elements.targetAmount.textContent = gameState.targetLevel;
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

// 更新檢查準確度函數
function checkAccuracy() {
    const difference = Math.abs(gameState.currentLevel - gameState.targetLevel);
    const capsule = document.querySelector('.capsule');
    const powderLevel = document.querySelector('.powder-level');
    
    if (difference <= GAME_CONFIG.ACCURACY_THRESHOLD) {
        // 成功效果
        gameState.score += 10;
        sounds.playSound('success');
        
        elements.gameMessages.textContent = '完美！+10分';
        elements.gameMessages.className = 'game-messages success';
        
        capsule.classList.add('success');
        powderLevel.classList.add('success');
        
        setTimeout(() => {
            capsule.classList.remove('success');
            powderLevel.classList.remove('success');
        }, 500);
    } else {
        // 失敗效果
        sounds.playSound('error');
        
        elements.gameMessages.textContent = '差太遠了！再試一次';
        elements.gameMessages.className = 'game-messages error';
        
        capsule.classList.add('error');
        powderLevel.classList.add('error');
        
        setTimeout(() => {
            capsule.classList.remove('error');
            powderLevel.classList.remove('error');
        }, 500);
    }
    
    updateDisplay();
    setTimeout(() => {
        generateNewTarget();
        elements.gameMessages.className = 'game-messages';
    }, 800);  // 延長顯示時間
}

// 填充粉末
function startFilling(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!gameState.isPlaying) return;
    
    elements.fillButton.classList.add('active');
    gameState.fillInterval = setInterval(() => {
        if (gameState.currentLevel < 100) {
            gameState.currentLevel += GAME_CONFIG.FILL_SPEED;
            updatePowderLevel();
        }
    }, 10);
}

// 停止填充
function stopFilling(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    elements.fillButton.classList.remove('active');
    clearInterval(gameState.fillInterval);
    if (gameState.isPlaying) {
        checkAccuracy();
    }
}

// 事件監聽器
elements.startButton.addEventListener('click', startGame);

// 滑鼠事件
elements.fillButton.addEventListener('mousedown', startFilling);
elements.fillButton.addEventListener('mouseup', stopFilling);
elements.fillButton.addEventListener('mouseleave', stopFilling);

// 觸控事件
elements.fillButton.addEventListener('touchstart', startFilling, { passive: false });
elements.fillButton.addEventListener('touchend', stopFilling, { passive: false });
elements.fillButton.addEventListener('touchcancel', stopFilling, { passive: false });

// 禁用長按選單
elements.fillButton.addEventListener('contextmenu', (e) => e.preventDefault());

// 添加載入畫面相關函數
const loadingScreen = {
    element: document.querySelector('.loading-screen'),
    progressBar: document.querySelector('.progress-fill'),
    progressNumber: document.querySelector('.progress-number'),
    loadingText: document.querySelector('.loading-text'),
    
    // 更新進度
    updateProgress(progress, text) {
        this.progressBar.style.width = `${progress}%`;
        this.progressNumber.textContent = Math.round(progress);
        if (text) {
            this.loadingText.textContent = text;
        }
    },
    
    // 隱藏載入畫面
    hide() {
        this.element.classList.add('hidden');
    },
    
    // 顯示載入畫面
    show() {
        this.element.classList.remove('hidden');
    }
};

// 模擬載入過程
async function initializeGame() {
    const tasks = [
        { name: '載入遊戲資源', duration: 500 },
        { name: '初始化系統', duration: 800 },
        { name: '連接資料庫', duration: 700 },
        { name: '準備遊戲環境', duration: 500 }
    ];
    
    let progress = 0;
    const progressPerTask = 100 / tasks.length;
    
    for (const task of tasks) {
        loadingScreen.updateProgress(progress, `${task.name}...`);
        await new Promise(resolve => setTimeout(resolve, task.duration));
        progress += progressPerTask;
    }
    
    loadingScreen.updateProgress(100, '載入完成！');
    await new Promise(resolve => setTimeout(resolve, 500));
    loadingScreen.hide();
}

// 在文檔載入時初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeGame().then(() => {
        initGame();
        highscoreManager.displayHighscores();
    });
}); 