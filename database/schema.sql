-- إنشاء قاعدة البيانات (إذا لم تكن موجودة)
-- CREATE DATABASE data_insights_db;

-- الاتصال بقاعدة البيانات
-- \c data_insights_db;

-- 1. جدول النقاط (موجود سابقاً - نستخدمه لحفظ النقاط التراكمية)
CREATE TABLE IF NOT EXISTS players_scores (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(255) UNIQUE NOT NULL,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. جدول الجلسات النشطة (لمنع انتحال الشخصية)
-- يحفظ تفاصيل اللاعب الحالية: اسمه، الـ Cookie الخاص به، ودوره في الجولة
CREATE TABLE IF NOT EXISTS game_sessions (
    session_id VARCHAR(255) PRIMARY KEY, -- الـ Cookie
    player_name VARCHAR(255) NOT NULL,
    socket_id VARCHAR(255),              -- آخر Socket ID للاتصال
    role VARCHAR(50) DEFAULT 'general',  -- general / special (spy)
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_player_name UNIQUE (player_name) -- يمنع تكرار الاسم في الجلسات النشطة
);

-- 3. جدول حالة اللعبة الحالية (لحفظ حالة السيرفر)
-- يحتوي على سطر واحد فقط يمثل الحالة الحالية للعبة
CREATE TABLE IF NOT EXISTS active_game_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    game_status VARCHAR(50) DEFAULT 'lobby', -- lobby, playing, voting, result
    start_time BIGINT,                       -- وقت بدء الجولة (timestamp)
    end_time BIGINT,                         -- وقت انتهاء التايمر (timestamp)
    spy_count INTEGER DEFAULT 0,             -- عدد الجواسيس في الجولة الحالية
    current_round_index INTEGER DEFAULT 0,    -- رقم الجولة الحالية
    spy_question TEXT,                       -- سؤال الجاسوس للجولة الحالية
    general_question TEXT,                   -- سؤال المواطن للجولة الحالية
    is_answers_revealed BOOLEAN DEFAULT FALSE,
    CONSTRAINT single_row CHECK (id = 1)     -- نضمن وجود سطر واحد فقط
);

-- 4. جدول سجلات الجولة (لحفظ الإجابات والتصويتات الحالية)
-- يتم مسحه عند بداية كل جولة جديدة
CREATE TABLE IF NOT EXISTS round_logs (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(255) REFERENCES game_sessions(player_name) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- answer, vote
    content TEXT,                     -- نص الإجابة أو اسم الشخص المصوت ضده
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- إنشاء فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_player_name ON players_scores(player_name);
CREATE INDEX IF NOT EXISTS idx_score ON players_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_session_last_active ON game_sessions(last_active_at);

-- دوال التحديث التلقائي للوقت
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_players_scores_updated_at ON players_scores;
CREATE TRIGGER update_players_scores_updated_at
    BEFORE UPDATE ON players_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- تهيئة السطر الوحيد لحالة اللعبة إذا لم يكن موجوداً
INSERT INTO active_game_state (id, game_status) 
VALUES (1, 'lobby') 
ON CONFLICT (id) DO NOTHING;
