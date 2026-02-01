const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. إعدادات قاعدة البيانات PostgreSQL (متوافق مع Render) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // ضروري جداً لبيئة Render
    }
});

pool.connect((err) => {
    if (err) return console.error('❌ Database connection error:', err.stack);
    console.log('✅ Server connected to PostgreSQL successfully');
});

// دالة مساعدة لحفظ أو تحديث النقاط
async function saveScoreToDB(playerName, pointsToAdd) {
    try {
        const query = `
            INSERT INTO players_scores (player_name, score) 
            VALUES ($1, $2)
            ON CONFLICT (player_name) 
            DO UPDATE SET score = players_scores.score + $2;
        `;
        await pool.query(query, [playerName, pointsToAdd]);
        console.log(`📊 Score Updated: ${playerName} (+${pointsToAdd})`);
    } catch (err) {
        console.error('❌ Error saving score to DB:', err);
    }
}

// --- 2. إعدادات المحرك والمسارات ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

let players = [];          
let submittedAnswers = []; 
let votes = []; 
let currentRoundQuestions = { q1: "", q2: "", spyQuestion: "", generalQuestion: "" };
let isAnswersRevealed = false;
let playerScores = {}; 
let submissionTimes = {}; 
let playersWhoWereSpies = []; 

const roundsPool = [
    { q1: "ما هي الفاكهة التي تحبها جداً؟", q2: "ما هي الفاكهة التي تكره رائحتها؟" },
    { q1: "مادة دراسية كنت تتمنى أن لا تنتهي؟", q2: "مادة دراسية كنت تهرب من حصتها؟" },
    { q1: "تطبيق في جوالك لا تستغني عنه أبداً؟", q2: "تطبيق في جوالك تفكر في حذفه دائماً؟" },
    { q1: "مكان هادئ تحب الجلوس فيه؟", q2: "مكان صاخب يسبب لك الصداع؟" },
    { q1: "أكلة شعبية تفتخر بها؟", q2: "أكلة شعبية لا تطيق تذوقها؟" },
    { q1: "لغة برمجة تراها هي المستقبل؟", q2: "لغة برمجة تمنيت لو لم يتم اختراعها؟" },
    { q1: "حيوان تراه لطيفاً جداً؟", q2: "حيوان تراه مخيفاً أو مقززاً؟" },
    { q1: "فصل من فصول السنة تفضله؟", q2: "فصل من فصول السنة يضايقك؟" },
    { q1: "مهنة كنت تحلم بها وأنت صغير؟", q2: "مهنة مستحيل أن تعمل بها مهما كان الراتب؟" },
    { q1: "ماركة سيارات تتمنى امتلاكها؟", q2: "ماركة سيارات تراها سيئة جداً؟" }
];

app.get('/', (req, res) => res.render('index'));
app.get('/admin', (req, res) => res.render('admin'));
app.get('/display', (req, res) => res.render('display'));
app.get('/lobby', (req, res) => res.render('lobby'));
app.get('/game', (req, res) => res.render('game'));
app.get('/results', (req, res) => res.render('results'));
app.get('/leaderboard', (req, res) => res.render('leaderboard'));

// --- 3. منطق Socket.io ---
io.on('connection', (socket) => {
    
    socket.emit('update_player_list', players);
    socket.emit('update_player_count', players.length);

    const emitTimer = (seconds) => {
        const endTime = Date.now() + (seconds * 1000);
        io.emit('start_countdown', endTime);
    };

    socket.on('admin_start_timer', (seconds) => {
        emitTimer(seconds);
    });

    socket.on('request_leaderboard', () => {
        socket.emit('update_leaderboard', { scores: playerScores, times: submissionTimes });
    });

    socket.on('request_current_state', () => {
        if (isAnswersRevealed && submittedAnswers.length > 0) {
            socket.emit('reveal_all_answers', {
                answers: submittedAnswers,
                spyQuestion: currentRoundQuestions.spyQuestion,
                generalQuestion: currentRoundQuestions.generalQuestion
            });
        }
    });

    socket.on('join_game', async (data, callback) => {
        const trimmedName = data.name.trim();
        const existingPlayer = players.find(p => p.name === trimmedName);
        if (existingPlayer) {
            existingPlayer.id = socket.id;
        } else {
            const newPlayer = { id: socket.id, name: trimmedName, role: 'general' };
            players.push(newPlayer);
            try {
                const res = await pool.query('SELECT score FROM players_scores WHERE player_name = $1', [trimmedName]);
                playerScores[trimmedName] = res.rows.length > 0 ? res.rows[0].score : 0;
            } catch (err) { playerScores[trimmedName] = 0; }
        }
        io.emit('update_player_count', players.length);
        io.emit('update_player_list', players);
        if (callback) callback({ status: 'ok' });
    });

    socket.on('admin_start_game', (data) => {
        if (players.length < 1) return; 
        submittedAnswers = []; 
        votes = []; 
        isAnswersRevealed = false; 

        let spyCount = Math.floor((players.length - 1) / 10) + 1;
        let candidates = players.filter(p => !playersWhoWereSpies.includes(p.name));
        let selectedSpiesNames = [];

        if (candidates.length >= spyCount) {
            let shuffled = candidates.sort(() => 0.5 - Math.random());
            selectedSpiesNames = shuffled.slice(0, spyCount).map(p => p.name);
        } else {
            selectedSpiesNames = candidates.map(p => p.name);
            let needed = spyCount - selectedSpiesNames.length;
            playersWhoWereSpies = []; 
            let poolForExtra = players.filter(p => !selectedSpiesNames.includes(p.name));
            let extraSpies = poolForExtra.sort(() => 0.5 - Math.random()).slice(0, needed).map(p => p.name);
            selectedSpiesNames.push(...extraSpies);
        }
        playersWhoWereSpies.push(...selectedSpiesNames);

        const selectedRound = roundsPool[data.roundIndex];
        const spyGetsQ1 = Math.random() > 0.5;
        currentRoundQuestions = {
            spyQuestion: spyGetsQ1 ? selectedRound.q1 : selectedRound.q2,
            generalQuestion: spyGetsQ1 ? selectedRound.q2 : selectedRound.q1
        };

        players.forEach((player) => {
            const targetSocket = io.sockets.sockets.get(player.id);
            if (!targetSocket) return;
            const isSpy = selectedSpiesNames.includes(player.name);
            player.role = isSpy ? 'special' : 'general';
            targetSocket.emit('receive_question', { 
                question: isSpy ? currentRoundQuestions.spyQuestion : currentRoundQuestions.generalQuestion, 
                role: player.role 
            });
        });

        io.emit('game_started_display');
        io.emit('reveal_spy_count_for_voting', spyCount);
        
        setTimeout(() => emitTimer(30), 1200);
    });

    socket.on('submit_answer', (data) => {
        submissionTimes[data.name] = Date.now();
        const player = players.find(p => p.name === data.name);
        submittedAnswers.push({ name: data.name, answer: data.answer, role: player ? player.role : 'general' });
        io.emit('answer_received_count', submittedAnswers.length);
    });

    socket.on('admin_reveal_answers', () => {
        isAnswersRevealed = true;
        io.emit('reveal_all_answers', {
            answers: submittedAnswers,
            spyQuestion: currentRoundQuestions.spyQuestion,
            generalQuestion: currentRoundQuestions.generalQuestion
        });

        setTimeout(() => emitTimer(45), 1500);
        io.emit('answer_received_count', 0); 
    });

    socket.on('submit_vote', (data) => {
        votes.push(data);
        io.emit('answer_received_count', votes.length);
    });

    socket.on('admin_show_spies', async () => {
        const spies = players.filter(p => p.role === 'special');
        const citizens = players.filter(p => p.role === 'general');
        
        for (const vote of votes) {
            const targetPlayer = players.find(p => p.name === vote.votedAnswer);
            if (targetPlayer && targetPlayer.role === 'special') {
                playerScores[vote.voter] = (playerScores[vote.voter] || 0) + 1;
                await saveScoreToDB(vote.voter, 1); 
            }
        }

        const spyCount = spies.length;
        const groupSize = citizens.length / spyCount; 
        const firstThreshold = Math.floor(groupSize / 2); 

        for (const spy of spies) {
            const votesAgainst = votes.filter(v => v.votedAnswer === spy.name).length;
            let spyEarned = spyCount; 
            let deduction = 0;
            if (votesAgainst >= firstThreshold) {
                deduction = 1; 
                if (votesAgainst > firstThreshold) {
                    deduction += Math.floor((votesAgainst - firstThreshold) / groupSize);
                }
            }
            spyEarned = Math.max(0, spyEarned - deduction);
            playerScores[spy.name] = (playerScores[spy.name] || 0) + spyEarned;
            await saveScoreToDB(spy.name, spyEarned);
        }

        io.emit('final_spy_reveal', {
            spies: spies.map(s => ({ name: s.name, answer: submittedAnswers.find(a => a.name === s.name)?.answer || 'لا يوجد' })),
            spyQuestion: currentRoundQuestions.spyQuestion,
            scores: playerScores
        });
    });

    socket.on('admin_go_to_leaderboard', () => {
        io.emit('nav_to_leaderboard');
    });

    socket.on('admin_next_round', () => {
        submittedAnswers = []; votes = []; isAnswersRevealed = false;
        players.forEach(p => p.role = 'general');
        io.emit('back_to_lobby');
        io.emit('answer_received_count', 0);
    });

    socket.on('admin_full_reset_db', async () => {
        try {
            await pool.query('DELETE FROM players_scores');
            players = []; playerScores = {}; submittedAnswers = []; votes = []; playersWhoWereSpies = [];
            io.emit('force_logout');
        } catch (err) { console.error(err); }
    });

    socket.on('disconnect', () => {
        const sid = socket.id;
        setTimeout(() => {
            if (!Array.from(io.sockets.sockets.values()).some(s => s.id === sid)) {
                players = players.filter(p => p.id !== sid);
                io.emit('update_player_count', players.length);
                io.emit('update_player_list', players);
            }
        }, 1500); 
    });
});

// --- 4. تشغيل السيرفر ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});
