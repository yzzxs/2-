// ==UserScript==
// @name         2048高分策略版
// @version      1.5
// @description   ====因为好久没玩游戏余额太多因此搞了这个脚本,官方早就开始查女巫但不会告诉你你已被女巫,如果你以后查空投发现自己被女巫了,与该脚本无关!!!
// @author       如何呢?
// @match        https://testnet.succinct.xyz/2048
// @icon         https://testnet.succinct.xyz/favicon.ico
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const DIRECTIONS = {
        UP: 'ArrowUp',
        RIGHT: 'ArrowRight',
        DOWN: 'ArrowDown',
        LEFT: 'ArrowLeft'
    };

    const MIN_SCORE_TO_SUBMIT = 150000; //大于该数值的分数将自动提交
    const MOVE_DELAY = 500; //速度
    const CHECK_INTERVAL = 500; //检查元素间隔

    let moveCount = 0;
    let lastBoardHash = '';
    let isPlaying = false;
    let gameOver = false;
    let moveTimeout = null;
    let checkInterval = null;


    function ensureControlsExist() {
        if (!document.getElementById('tm-2048-controls')) {
            addControlButtons();
        }
        if (!document.getElementById('tm-2048-disclaimer')) {
            addDisclaimer();
        }
    }

    function getBoardState() {
        const board = Array(4).fill().map(() => Array(4).fill(0));
        const tiles = document.querySelectorAll('[class*="absolute flex items-center justify-center rounded font-bold"]');

        tiles.forEach(tile => {
            const value = parseInt(tile.textContent) || 0;
            const style = tile.getAttribute('style');

            const top = parseInt(style.match(/top:\s*calc\((\d+)%/)?.[1]) || 0;
            const left = parseInt(style.match(/left:\s*calc\((\d+)%/)?.[1]) || 0;

            const row = Math.min(3, Math.floor(top / 25));
            const col = Math.min(3, Math.floor(left / 25));

            board[row][col] = value;
        });

        return board;
    }

    function getBoardHash(board) {
        return board.flat().join(',');
    }

    function evaluateMove(board, direction) {
        const newBoard = JSON.parse(JSON.stringify(board));
        let score = 0;
        let moved = false;

        const processLine = (line) => {
            const filtered = line.filter(x => x !== 0);
            const result = [];
            for (let i = 0; i < filtered.length; i++) {
                if (i < filtered.length - 1 && filtered[i] === filtered[i + 1]) {
                    result.push(filtered[i] * 2);
                    score += filtered[i] * 2;
                    i++;
                    moved = true;
                } else {
                    result.push(filtered[i]);
                }
            }
            while (result.length < 4) result.push(0);
            return result;
        };

        if (direction === DIRECTIONS.LEFT) {
            for (let i = 0; i < 4; i++) {
                const newRow = processLine(newBoard[i]);
                if (JSON.stringify(newRow) !== JSON.stringify(newBoard[i])) moved = true;
                newBoard[i] = newRow;
            }
        }
        else if (direction === DIRECTIONS.RIGHT) {
            for (let i = 0; i < 4; i++) {
                const newRow = processLine([...newBoard[i]].reverse()).reverse();
                if (JSON.stringify(newRow) !== JSON.stringify(newBoard[i])) moved = true;
                newBoard[i] = newRow;
            }
        }
        else if (direction === DIRECTIONS.UP) {
            for (let j = 0; j < 4; j++) {
                const column = [newBoard[0][j], newBoard[1][j], newBoard[2][j], newBoard[3][j]];
                const newColumn = processLine(column);
                for (let i = 0; i < 4; i++) {
                    if (newBoard[i][j] !== newColumn[i]) moved = true;
                    newBoard[i][j] = newColumn[i];
                }
            }
        }
        else if (direction === DIRECTIONS.DOWN) {
            for (let j = 0; j < 4; j++) {
                const column = [newBoard[3][j], newBoard[2][j], newBoard[1][j], newBoard[0][j]];
                const newColumn = processLine(column);
                for (let i = 0; i < 4; i++) {
                    if (newBoard[3-i][j] !== newColumn[i]) moved = true;
                    newBoard[3-i][j] = newColumn[i];
                }
            }
        }

        if (!moved) return -Infinity;

        let emptyCells = 0;
        let smoothness = 0;
        let maxTile = 0;

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (newBoard[i][j] === 0) emptyCells++;
                maxTile = Math.max(maxTile, newBoard[i][j]);

                if (i < 3 && newBoard[i][j] && newBoard[i+1][j]) {
                    smoothness -= Math.abs(Math.log2(newBoard[i][j]) - Math.log2(newBoard[i+1][j]));
                }
                if (j < 3 && newBoard[i][j] && newBoard[i][j+1]) {
                    smoothness -= Math.abs(Math.log2(newBoard[i][j]) - Math.log2(newBoard[i][j+1]));
                }
            }
        }

        return score * 10 + emptyCells * 3.0 + smoothness * 0.1 + maxTile * 1.0;
    }

    function getBestMove() {
        const board = getBoardState();
        const currentHash = getBoardHash(board);

        if (currentHash === lastBoardHash) {
            console.log('卡住了，正在尝试恢复操作。');
            return [DIRECTIONS.RIGHT, DIRECTIONS.DOWN, DIRECTIONS.LEFT, DIRECTIONS.UP][moveCount % 4];
        }

        lastBoardHash = currentHash;

        const directions = [DIRECTIONS.UP, DIRECTIONS.RIGHT, DIRECTIONS.DOWN, DIRECTIONS.LEFT];
        let bestScore = -Infinity;
        let bestDirection = directions[0];

        for (const dir of directions) {
            const score = evaluateMove(board, dir);
            if (score > bestScore) {
                bestScore = score;
                bestDirection = dir;
            }
        }

        return bestDirection;
    }

    function getCurrentScore() {
        const scoreElement = document.querySelector('.jsx-2883dceedf364fd2.mb-2.text-xl.font-bold.text-gray-700');
        if (scoreElement && scoreElement.textContent.includes('Your Score:')) {
            const scoreText = scoreElement.textContent.replace('Your Score:', '').trim();
            return parseInt(scoreText) || 0;
        }
        return 0;
    }

    function handleGameOver() {
        const currentScore = getCurrentScore();
        console.log(`Game Over! Score: ${currentScore}`);

        if (currentScore >= MIN_SCORE_TO_SUBMIT) {
            const confirmScoreBtn = document.querySelector('button.bg-gradient-to-b.from-2048-pink-light-200.to-2048-pink-light-400');
            if (confirmScoreBtn) {
                console.log('Score meets threshold, confirming...');
                confirmScoreBtn.click();

                setTimeout(() => {
                    const finalConfirmBtn = document.querySelector('button.bg-succinct-pink.text-white');
                    if (finalConfirmBtn) {
                        console.log('Clicking final confirmation...');
                        finalConfirmBtn.click();
                    }
                }, 1000);
            }
        } else {
            const tryAgainBtn = document.querySelector('button.jsx-2883dceedf364fd2.bg-succinct-pink');
            if (tryAgainBtn) {
                console.log('Score below threshold, trying again...');
                tryAgainBtn.click();

                setTimeout(() => {
                    isPlaying = true;
                    gameOver = false;
                    moveCount = 0;
                    lastBoardHash = '';
                    updateButtonStates();
                    makeMove();
                }, 1000);
            }
        }
    }

    function makeMove() {
        if (!isPlaying) return;

        const gameOverElement = document.querySelector('.jsx-2883dceedf364fd2.mb-1.text-4xl.font-extrabold.text-succinct-pink');
        if (gameOverElement && gameOverElement.textContent.includes('Game Over!')) {
            console.log('Game Over detected');
            isPlaying = false;
            gameOver = true;
            updateButtonStates();
            handleGameOver();
            return;
        }

        moveCount++;
        const direction = getBestMove();

        console.log(`Move #${moveCount}: ${direction}`);

        const event = new KeyboardEvent('keydown', {
            key: direction,
            code: direction,
            keyCode: direction === DIRECTIONS.UP ? 38 :
                     direction === DIRECTIONS.RIGHT ? 39 :
                     direction === DIRECTIONS.DOWN ? 40 : 37,
            which: direction === DIRECTIONS.UP ? 38 :
                   direction === DIRECTIONS.RIGHT ? 39 :
                   direction === DIRECTIONS.DOWN ? 40 : 37,
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
        });

        document.dispatchEvent(event);
        window.dispatchEvent(event);
        document.activeElement.dispatchEvent(event);

        moveTimeout = setTimeout(makeMove, MOVE_DELAY);
    }

    function updateButtonStates() {
        const startBtn = document.getElementById('tm-2048-start');
        const pauseBtn = document.getElementById('tm-2048-pause');

        if (startBtn && pauseBtn) {
            startBtn.style.display = isPlaying ? 'none' : 'block';
            pauseBtn.style.display = isPlaying ? 'block' : 'none';
        }
    }

   function addDisclaimer() {
    const disclaimer = document.createElement('div');
    disclaimer.id = 'tm-2048-disclaimer';
    disclaimer.textContent = '因为好久没玩游戏余额太多因此搞了这个脚本,官方早就开始查女巫但不会告诉你你已被女巫,如果你以后查空投发现自己被女巫了,与该脚本无关!!!----------如何呢?';
    disclaimer.style.position = 'fixed';
    disclaimer.style.top = '30px';
    disclaimer.style.left = '50%';
    disclaimer.style.transform = 'translateX(-50%)';
    disclaimer.style.color = 'red';
    disclaimer.style.fontSize = '12px';
    disclaimer.style.width = '80%';
    disclaimer.style.maxWidth = '500px';
    disclaimer.style.textAlign = 'center';
    disclaimer.style.backgroundColor = 'rgba(255,255,255,0.8)';
    disclaimer.style.padding = '5px';
    disclaimer.style.borderRadius = '5px';
    disclaimer.style.zIndex = '9999';

    document.body.appendChild(disclaimer);
}

    function addControlButtons() {
        const controls = document.createElement('div');
        controls.id = 'tm-2048-controls';
        controls.style.position = 'fixed';
        controls.style.bottom = '20px';
        controls.style.right = '20px';
        controls.style.zIndex = '9999';
        controls.style.display = 'flex';
        controls.style.gap = '10px';
        controls.style.backgroundColor = 'rgba(255,255,255,0.9)';
        controls.style.padding = '10px';
        controls.style.borderRadius = '5px';
        controls.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
        const startBtn = document.createElement('button');
        startBtn.id = 'tm-2048-start';
        startBtn.textContent = '开始自动游戏';
        startBtn.style.padding = '8px 12px';
        startBtn.style.backgroundColor = '#4CAF50';
        startBtn.style.color = 'white';
        startBtn.style.border = 'none';
        startBtn.style.borderRadius = '4px';
        startBtn.style.cursor = 'pointer';
        startBtn.style.fontWeight = 'bold';

        startBtn.addEventListener('click', () => {
            isPlaying = true;
            gameOver = false;
            updateButtonStates();
            makeMove();
        });


        const pauseBtn = document.createElement('button');
        pauseBtn.id = 'tm-2048-pause';
        pauseBtn.textContent = '暂停自动游戏';
        pauseBtn.style.padding = '8px 12px';
        pauseBtn.style.backgroundColor = '#f44336';
        pauseBtn.style.color = 'white';
        pauseBtn.style.border = 'none';
        pauseBtn.style.borderRadius = '4px';
        pauseBtn.style.cursor = 'pointer';
        pauseBtn.style.fontWeight = 'bold';
        pauseBtn.style.display = 'none';

        pauseBtn.addEventListener('click', () => {
            isPlaying = false;
            if (moveTimeout) {
                clearTimeout(moveTimeout);
                moveTimeout = null;
            }
            updateButtonStates();
        });

        controls.appendChild(startBtn);
        controls.appendChild(pauseBtn);
        document.body.appendChild(controls);
    }

    function startWhenReady() {
        const tiles = document.querySelectorAll('[class*="absolute flex items-center justify-center rounded font-bold"]');
        if (tiles.length >= 2) {
            console.log('Game detected, adding controls');
            addControlButtons();
            addDisclaimer();


            checkInterval = setInterval(ensureControlsExist, CHECK_INTERVAL);
        } else {
            setTimeout(startWhenReady, 500);
        }
    }


    startWhenReady();

    window.addEventListener('beforeunload', () => {
        if (checkInterval) clearInterval(checkInterval);
        if (moveTimeout) clearTimeout(moveTimeout);
    });
})();
