// تحميل متغيرات البيئة
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. إعدادات قاعدة البيانات PostgreSQL ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

if (!process.env.DATABASE_URL) {
    // Local Fallback if no DATABASE_URL provided
    pool.options = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || '5432'),
    };
}

// اختبار الاتصال بقاعدة البيانات
// اختبار الاتصال بقاعدة البيانات وإصلاح الـ Schema تلقائياً
pool.connect(async (err, client, release) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Server connected to PostgreSQL successfully');

        // إصلاح سريع للـ Schema للتأكد من وجود الأعمدة المطلوبة
        try {
            await client.query(`
                ALTER TABLE players_scores 
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ADD COLUMN IF NOT EXISTS times_spy INTEGER DEFAULT 0;
            `);
            console.log('✅ Checked/Fixed database schema (players_scores columns including times_spy)');
        } catch (dbErr) {
            console.error('⚠️ Warning checking schema:', dbErr.message);
        }

        release();
    }
});

// --- 2. إعدادات المحرك والمسارات ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- دوال مساعدة لقاعدة البيانات ---

async function getActiveGameState() {
    const res = await pool.query('SELECT * FROM active_game_state WHERE id = 1');
    return res.rows[0];
}

async function updateGameState(updates) {
    const setClause = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = Object.values(updates);
    await pool.query(`UPDATE active_game_state SET ${setClause} WHERE id = 1`, values);
}

async function createOrUpdateSession(playerName, socketId = null) {
    const existing = await pool.query('SELECT * FROM game_sessions WHERE player_name = $1', [playerName]);

    if (existing.rows.length > 0) {
        await pool.query('UPDATE game_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE player_name = $1', [playerName]);
        return existing.rows[0];
    } else {
        const sessionId = uuidv4();
        await pool.query(
            'INSERT INTO game_sessions (session_id, player_name, socket_id, role) VALUES ($1, $2, $3, $4)',
            [sessionId, playerName, socketId, 'general']
        );
        return { session_id: sessionId, player_name: playerName, role: 'general' };
    }
}

async function getSessionById(sessionId) {
    const res = await pool.query('SELECT * FROM game_sessions WHERE session_id = $1', [sessionId]);
    return res.rows[0];
}

async function getAllPlayers() {
    const res = await pool.query('SELECT * FROM game_sessions ORDER BY last_active_at DESC');
    return res.rows;
}

// --- المسارات (Routes) ---

app.get('/', async (req, res) => {
    // 1. إذا كان هناك خطأ، اعرض الصفحة الرئيسية فوراً ولا تقم بإعادة التوجيه (لمنع الحلقة)
    if (req.query.error) {
        return res.render('index', { error: 'حدث خطأ في الاتصال، يرجى إعادة الدخول.' });
    }

    const sessionId = req.cookies.game_session;
    if (sessionId) {
        const session = await getSessionById(sessionId);
        if (session) {
            return res.redirect('/lobby');
        }
    }
    res.render('index');
});

app.post('/login', async (req, res) => {
    const playerName = req.body.name ? req.body.name.trim() : '';
    if (!playerName || playerName.length < 2) return res.redirect('/');

    try {
        const existing = await pool.query('SELECT * FROM game_sessions WHERE player_name = $1', [playerName]);
        const currentSessionId = req.cookies.game_session;

        // التحقق من حجز الاسم
        if (existing.rows.length > 0) {
            // إذا كان الاسم موجوداً ولكن لجلسة مختلفة (شخص آخر أو متصفح آخر)
            if (existing.rows[0].session_id !== currentSessionId) {
                return res.render('index', { error: 'هذا الاسم محجوز للاعب آخر! ⛔' });
            }
        }

        const session = await createOrUpdateSession(playerName);

        res.cookie('game_session', session.session_id, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

        await pool.query(`
            INSERT INTO players_scores (player_name, score) VALUES ($1, 0)
            ON CONFLICT (player_name) DO NOTHING
        `, [playerName]);

        res.redirect('/lobby');
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

app.get('/lobby', async (req, res) => {
    const sessionId = req.cookies.game_session;
    if (!sessionId) return res.redirect('/');

    const session = await getSessionById(sessionId);
    if (!session) {
        res.clearCookie('game_session');
        return res.redirect('/');
    }
    res.render('lobby', { playerName: session.player_name });
});

app.get('/game', async (req, res) => {
    const sessionId = req.cookies.game_session;
    if (!sessionId) return res.redirect('/');

    const session = await getSessionById(sessionId);
    if (!session) {
        res.clearCookie('game_session');
        return res.redirect('/');
    }
    res.render('game', { playerName: session.player_name });
});
app.get('/results', async (req, res) => {
    const sessionId = req.cookies.game_session;
    if (!sessionId) return res.redirect('/');

    const session = await getSessionById(sessionId);
    if (!session) {
        res.clearCookie('game_session');
        return res.redirect('/');
    }
    res.render('results', { playerName: session.player_name });
});
app.get('/leaderboard', async (req, res) => {
    const sessionId = req.cookies.game_session;
    if (!sessionId) return res.redirect('/');

    const session = await getSessionById(sessionId);
    if (!session) {
        res.clearCookie('game_session');
        return res.redirect('/');
    }
    res.render('leaderboard', { playerName: session.player_name });
});
app.get('/display', (req, res) => res.render('display'));
app.get('/tutorial', (req, res) => res.render('tutorial'));

let adminSessions = new Set();
app.get('/admin-login', (req, res) => res.render('admin-login', { error: false }));

app.post('/admin-login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        const sessionId = uuidv4();
        adminSessions.add(sessionId);
        res.cookie('admin_session', sessionId, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
        res.redirect('/admin');
    } else {
        res.render('admin-login', { error: true });
    }
});

app.get('/admin', (req, res) => {
    const sessionId = req.cookies.admin_session;
    if (sessionId && adminSessions.has(sessionId)) {
        res.render('admin');
    } else {
        res.redirect('/admin-login');
    }
});

// --- 3. منطق Socket.io ---

const disconnectTimeouts = new Map();

io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;

    // --- DEBUG LOGGING ---
    console.log(`[Socket Debug] Connection attempt from ${socket.id}`);
    console.log(`[Socket Debug] Cookie Header:`, cookieHeader ? 'Present' : 'Missing');
    // ---------------------

    if (!cookieHeader) return next(new Error('Authentication error'));

    const getCookie = (name) => {
        const value = `; ${cookieHeader}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    };

    const sessionId = getCookie('game_session');

    // --- DEBUG LOGGING ---
    console.log(`[Socket Debug] Extracted Session ID:`, sessionId);
    // ---------------------

    if (sessionId) {
        const session = await getSessionById(sessionId);
        if (session) {
            socket.data.session = session;
            socket.data.playerName = session.player_name;
            return next();
        } else {
            console.log(`[Socket Debug] Session ID found but not valid in DB.`);
        }
    }
    if (socket.handshake.headers.referer.includes('/display') || socket.handshake.headers.referer.includes('/admin')) {
        return next();
    }

    console.log(`[Socket Debug] Authentication Failed.`);
    next(new Error('Authentication error'));
});

const roundsPool = [
    { q1: "تطبيق في جوالك 24 ساعه فيه؟", q2: "تطبيق في جوالك نادر تدخله بس انه مهم؟" },
    { q1: "ماركة سيارات تتمنى امتلاكها؟", q2: "ماركة سيارات تشوف الناس مبالغين في تقديرها؟" },
    { q1: "حيوان تراه لطيفاً جداً؟", q2: "حيوان تراه مخيفاً أو مقززاً؟" },
    { q1: "وجبة فطور مثالية بالنسبة لك؟", q2: "وجبة عشاء مثالية بالنسبة لك؟" },
    { q1: "اول شخصيه مشهورة شفتها بحياتك واذا مافي مين ودك تشوف مشهور؟", q2: "شخصية مشهورة ما ودك تشوفه ابدا؟" },
    { q1: "اسم شخص تحسه ينحب بدون تعرفه؟", q2: "اسم شخص تحسه ما ينطاق ؟" },
    { q1: "هدية تسعدك جداً لو وصلتك؟", q2: "هدية تستغرب إذا أحد أهداك إياها؟" },
    { q1: "كلمة عامية تحب تستخدمها؟", q2: "كلمة عامية تحسها ثقيلة دم؟" },
    { q1: "اكثر ايموجي ينرفزك", q2: "اكثر ايموجي تستخدمه" },
    { q1: "لو معك مليون ريال وش أول شيء تشتريه؟", q2: "شيء مستحيل تشتريه حتى لو معك ملايين؟" },

];

async function saveScoreToDB(playerName, pointsToAdd) {
    console.log(`[DB Debug] Saving score for ${playerName}: +${pointsToAdd}`);
    try {
        const query = `
            INSERT INTO players_scores (player_name, score) 
            VALUES ($1, $2)
            ON CONFLICT (player_name) 
            DO UPDATE SET score = players_scores.score + $2;
        `;
        await pool.query(query, [playerName, pointsToAdd]);
    } catch (err) { console.error('Error saving score:', err); }
}

io.on('connection', async (socket) => {
    if (socket.data.playerName) {
        // إذا رجع اتصل خلال الـ 10 ثواني، نلغي الطرد
        if (disconnectTimeouts.has(socket.data.playerName)) {
            console.log(`[Socket] ${socket.data.playerName} reconnected. Cancelling logout timer.`);
            clearTimeout(disconnectTimeouts.get(socket.data.playerName));
            disconnectTimeouts.delete(socket.data.playerName);
        }

        await pool.query('UPDATE game_sessions SET socket_id = $1, last_active_at = CURRENT_TIMESTAMP WHERE session_id = $2', [socket.id, socket.data.session.session_id]);

        const gameState = await getActiveGameState();

        if (gameState.end_time && gameState.end_time > Date.now()) {
            socket.emit('start_countdown', parseInt(gameState.end_time));
        }

        if (gameState.game_status === 'playing' || gameState.game_status === 'voting' || gameState.game_status === 'result') {
            // إعادة قراءة الـ role من قاعدة البيانات للتأكد أنه محدّث
            const freshSession = await getSessionById(socket.data.session.session_id);
            const role = freshSession ? freshSession.role : socket.data.session.role;
            const question = role === 'special' ? gameState.spy_question : gameState.general_question;
            socket.emit('receive_question', { question, role });

            // إرسال عدد الإجابات
            if (gameState.game_status !== 'lobby') {
                const answersCount = (await pool.query("SELECT COUNT(*) FROM round_logs WHERE action_type = 'answer'")).rows[0].count;
                socket.emit('answer_received_count', parseInt(answersCount));
            }

            // إذا كانت مرحلة التصويت، أرسل الإجابات للاعب الذي اتصل للتو
            if (gameState.game_status === 'voting' && gameState.is_answers_revealed) {
                const answersRes = await pool.query("SELECT player_name, content as answer FROM round_logs WHERE action_type = 'answer'");
                const answers = [];
                for (let row of answersRes.rows) {
                    const pRes = await pool.query('SELECT role FROM game_sessions WHERE player_name = $1', [row.player_name]);
                    answers.push({
                        name: row.player_name,
                        answer: row.answer,
                        role: pRes.rows[0]?.role || 'general'
                    });
                }
                socket.emit('reveal_all_answers', {
                    answers: answers,
                    spyQuestion: gameState.spy_question,
                    generalQuestion: gameState.general_question
                });

                // إرسال عدد الجواسيس للتصويت
                socket.emit('reveal_spy_count_for_voting', gameState.spy_count);
            }
        }
    }

    const playersList = await getAllPlayers();
    io.emit('update_player_list', playersList.map(p => ({ id: p.socket_id, name: p.player_name, role: p.role })));
    io.emit('update_player_count', playersList.length);

    socket.on('admin_start_game', async (data) => {
        const players = await getAllPlayers();
        if (players.length < 1) return;

        await pool.query('DELETE FROM round_logs');

        let spyCount = Math.floor((players.length - 1) / 10) + 1;

        // --- نظام اختيار الجاسوس العادل ---
        // 1. جلب عدد مرات الجاسوسية لكل لاعب نشط
        const pNames = players.map(p => p.player_name);
        try {
            const tsRes = await pool.query('SELECT player_name, times_spy FROM players_scores WHERE player_name = ANY($1)', [pNames]);
            const tsMap = {};
            tsRes.rows.forEach(r => tsMap[r.player_name] = r.times_spy || 0);
            players.forEach(p => p.times_spy = tsMap[p.player_name] || 0);
        } catch (e) { console.error('Error fetching spy history:', e); }

        // 2. خلط عشوائي أولاً (للكسرة التعادل)
        players.sort(() => 0.5 - Math.random());

        // 3. ترتيب تصاعدي حسب عدد المرات (الأقل حظاً أولاً)
        players.sort((a, b) => (a.times_spy || 0) - (b.times_spy || 0));

        let selectedSpies = players.slice(0, spyCount);
        let spyNames = selectedSpies.map(p => p.player_name);
        // -------------------------------------

        await pool.query("UPDATE game_sessions SET role = 'general'");
        if (spyNames.length > 0) {
            const queryText = 'UPDATE game_sessions SET role = $1 WHERE player_name = ANY($2::text[])';
            await pool.query(queryText, ['special', spyNames]);

            // تحديث عداد مرات الجاسوسية
            await pool.query('UPDATE players_scores SET times_spy = COALESCE(times_spy, 0) + 1 WHERE player_name = ANY($1)', [spyNames]);
        }

        const selectedRound = roundsPool[data.roundIndex % roundsPool.length];
        const spyGetsQ1 = Math.random() > 0.5;
        const spyQuestion = spyGetsQ1 ? selectedRound.q1 : selectedRound.q2;
        const generalQuestion = spyGetsQ1 ? selectedRound.q2 : selectedRound.q1;

        const endTime = Date.now() + (30 * 1000);

        await updateGameState({
            game_status: 'playing',
            start_time: Date.now(),
            end_time: endTime,
            spy_count: spyCount,
            spy_question: spyQuestion,
            general_question: generalQuestion,
            current_round_index: data.roundIndex,
            is_answers_revealed: false
        });

        const updatedPlayers = await getAllPlayers();
        updatedPlayers.forEach(p => {
            const targetSocket = io.sockets.sockets.get(p.socket_id);
            if (targetSocket) {
                const q = p.role === 'special' ? spyQuestion : generalQuestion;
                targetSocket.emit('receive_question', { question: q, role: p.role });
            }
        });

        io.emit('game_started_display');
        io.emit('reveal_spy_count_for_voting', spyCount);
        io.emit('start_countdown', endTime);
    });

    socket.on('submit_answer', async (data) => {
        if (!socket.data.playerName) return;
        await pool.query(
            "INSERT INTO round_logs (player_name, action_type, content) VALUES ($1, 'answer', $2)",
            [socket.data.playerName, data.answer]
        );
        const countRes = await pool.query("SELECT COUNT(*) FROM round_logs WHERE action_type = 'answer'");
        io.emit('answer_received_count', parseInt(countRes.rows[0].count));
    });

    socket.on('admin_reveal_answers', async () => {
        await updateGameState({ game_status: 'voting', is_answers_revealed: true });

        const answersRes = await pool.query("SELECT player_name, content as answer FROM round_logs WHERE action_type = 'answer'");
        const gameState = await getActiveGameState();

        const answers = [];
        for (let row of answersRes.rows) {
            const pRes = await pool.query('SELECT role FROM game_sessions WHERE player_name = $1', [row.player_name]);
            answers.push({
                name: row.player_name,
                answer: row.answer,
                role: pRes.rows[0]?.role || 'general'
            });
        }

        io.emit('reveal_all_answers', {
            answers: answers,
            spyQuestion: gameState.spy_question,
            generalQuestion: gameState.general_question
        });

        const endTime = Date.now() + (45 * 1000);
        await updateGameState({ end_time: endTime });
        io.emit('start_countdown', endTime);
        io.emit('answer_received_count', 0);
    });

    socket.on('submit_vote', async (data) => {
        if (!socket.data.playerName) {
            console.log('[Vote Error] No playerName in socket data');
            return;
        }
        await pool.query(
            "INSERT INTO round_logs (player_name, action_type, content) VALUES ($1, 'vote', $2)",
            [socket.data.playerName, data.votedAnswer]
        );
        console.log(`[Vote Debug] Vote received from ${socket.data.playerName} against ${data.votedAnswer}`);
        const countRes = await pool.query("SELECT COUNT(*) FROM round_logs WHERE action_type = 'vote'");
        io.emit('answer_received_count', parseInt(countRes.rows[0].count));
    });

    socket.on('admin_show_spies', async () => {
        await updateGameState({ game_status: 'result', end_time: null });

        const sessionRes = await pool.query("SELECT * FROM game_sessions");
        const allPlayers = sessionRes.rows;
        const spies = allPlayers.filter(p => p.role === 'special');
        const citizens = allPlayers.filter(p => p.role === 'general');

        const votesRes = await pool.query("SELECT player_name as voter, content as target FROM round_logs WHERE action_type = 'vote'");
        const votes = votesRes.rows;

        for (const vote of votes) {
            const targetPlayer = allPlayers.find(p => p.player_name === vote.target);
            if (targetPlayer && targetPlayer.role === 'special') {
                console.log(`[Score Debug] Player ${vote.voter} voted correctly for spy ${vote.target} (+1 point)`);
                await saveScoreToDB(vote.voter, 1);
            }
        }

        const spyCount = spies.length;
        const groupSize = citizens.length / (spyCount || 1);
        const firstThreshold = Math.floor(groupSize / 2);

        const spyDetails = {};

        for (const spy of spies) {
            const votesAgainst = votes.filter(v => v.target === spy.player_name).length;
            let spyEarned = spyCount;
            let deduction = 0;
            if (votesAgainst >= firstThreshold) {
                deduction = 1;
                if (votesAgainst > firstThreshold) {
                    deduction += Math.floor((votesAgainst - firstThreshold) / groupSize);
                }
            }
            spyEarned = Math.max(0, spyEarned - deduction);
            console.log(`[Score Debug] Spy ${spy.player_name} earned ${spyEarned} points (Votes against: ${votesAgainst})`);

            // تخزين التفاصيل لإرسالها للعميل
            spyDetails[spy.player_name] = {
                votes: votesAgainst,
                earned: spyEarned
            };

            await saveScoreToDB(spy.player_name, spyEarned);
        }

        const answersRes = await pool.query("SELECT player_name, content FROM round_logs WHERE action_type = 'answer'");
        const answersMap = {};
        answersRes.rows.forEach(r => answersMap[r.player_name] = r.content);

        const scoresRes = await pool.query("SELECT player_name, score FROM players_scores");
        const playerScores = {};
        scoresRes.rows.forEach(r => playerScores[r.player_name] = r.score);

        const gameState = await getActiveGameState();

        io.emit('final_spy_reveal', {
            spies: spies.map(s => ({
                name: s.player_name,
                answer: answersMap[s.player_name] || 'لا يوجد',
                votes: spyDetails[s.player_name]?.votes || 0,
                earned: spyDetails[s.player_name]?.earned || 0
            })),
            spyQuestion: gameState.spy_question,
            scores: playerScores,
            totalVotes: citizens.length
        });
    });

    socket.on('admin_next_round', async () => {
        await updateGameState({
            game_status: 'lobby',
            is_answers_revealed: false,
            end_time: null,
            spy_question: null,
            general_question: null
        });
        await pool.query("UPDATE game_sessions SET role = 'general'");
        await pool.query("DELETE FROM round_logs");

        io.emit('back_to_lobby');
        io.emit('answer_received_count', 0);
    });

    // عندما يضغط الأدمن على زر لوحة المتصدرين، أرسل للمشاركين
    socket.on('admin_go_to_leaderboard', async () => {
        // تحديث حالة اللعبة لتكون leaderboard لمنع إرسال السؤال للمتصلين
        await updateGameState({ game_status: 'leaderboard' });
        io.emit('nav_to_leaderboard');
    });

    socket.on('admin_full_reset_db', async () => {
        await pool.query('DELETE FROM players_scores');
        await pool.query('DELETE FROM round_logs');
        await pool.query('DELETE FROM game_sessions');

        await updateGameState({ game_status: 'lobby', current_round_index: 0 });
        io.emit('force_logout');
    });

    socket.on('request_leaderboard', async () => {
        const scoresRes = await pool.query("SELECT player_name, score FROM players_scores");
        const scores = {};
        scoresRes.rows.forEach(r => scores[r.player_name] = r.score);
        console.log('[Leaderboard Debug] Sending scores:', scores);
        socket.emit('update_leaderboard', { scores: scores, times: {} });
    });

    socket.on('disconnect', async () => {
        const playerName = socket.data.playerName;
        if (playerName) {
            console.log(`[Socket] ${playerName} disconnected. Waiting 10s before kick...`);

            // تحقق لو أن هذا السوكيت هو النشط فعلاً (ربما فتح تاب جديد والقديم فصل)
            // إذا كان سوكيت قديم، لا تطرده
            try {
                const sessionRes = await pool.query('SELECT socket_id FROM game_sessions WHERE player_name = $1', [playerName]);
                if (sessionRes.rows.length > 0 && sessionRes.rows[0].socket_id !== socket.id) {
                    console.log(`[Socket] Stale socket disconnected for ${playerName}. Ignoring.`);
                    return;
                }
            } catch (e) {
                console.error(e);
            }

            const timer = setTimeout(async () => {
                console.log(`[Socket] ${playerName} timed out (10s). Kicking from session.`);
                try {
                    await pool.query('DELETE FROM game_sessions WHERE player_name = $1', [playerName]);

                    // تحديث قائمة اللاعبين للآدمن
                    const players = await pool.query('SELECT player_name as name FROM game_sessions');
                    io.emit('update_player_list', players.rows);
                    io.emit('update_player_count', players.rows.length);
                } catch (e) {
                    console.error('Error in disconnect timeout:', e);
                }
                disconnectTimeouts.delete(playerName);
            }, 10000); // 10 ثواني مهلة

            disconnectTimeouts.set(playerName, timer);
        }
    });
});

const PORT = parseInt(process.env.PORT || '3000');
server.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 السيرفر يعمل بنجاح! (نسخة قاعدة البيانات المحدثة v2)');
    console.log(`📍 الرابط: http://localhost:${PORT}`);
    console.log('='.repeat(50) + '\n');
});