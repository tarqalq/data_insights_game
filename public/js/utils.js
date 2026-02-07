// دوال مساعدة مشتركة
(function () {
    'use strict';

    // ===== دالة التايمر الموحدة =====
    window.createCountdownTimer = function (endTime, displayElement, options = {}) {
        const {
            onTick = null,
            onComplete = null,
            warningThreshold = 5,
            warningClass = 'timer-low'
        } = options;

        let timerInterval = setInterval(() => {
            const now = Date.now();
            const timeLeft = Math.ceil((endTime - now) / 1000);

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                if (displayElement) displayElement.innerText = "0";
                if (onComplete) onComplete();
                return;
            }

            if (displayElement) {
                displayElement.innerText = timeLeft;

                // إضافة/إزالة كلاس التحذير
                if (timeLeft <= warningThreshold) {
                    displayElement.classList.add(warningClass);
                } else {
                    displayElement.classList.remove(warningClass);
                }
            }

            if (onTick) onTick(timeLeft);
        }, 1000);

        return timerInterval;
    };

    // ===== التحقق من صحة المدخلات =====
    window.validateInput = {
        // التحقق من اسم اللاعب
        playerName: function (name) {
            const trimmed = name.trim();
            if (!trimmed) return { valid: false, message: 'الرجاء إدخال اسمك' };
            if (trimmed.length < 2) return { valid: false, message: 'الاسم قصير جداً (حد أدنى حرفين)' };
            if (trimmed.length > 50) return { valid: false, message: 'الاسم طويل جداً (حد أقصى 50 حرف)' };
            if (!/^[\u0600-\u06FFa-zA-Z0-9\s]+$/.test(trimmed)) {
                return { valid: false, message: 'الاسم يحتوي على رموز غير مسموحة' };
            }
            return { valid: true, value: trimmed };
        },

        // التحقق من الإجابة
        answer: function (answer) {
            const trimmed = answer.trim();
            if (!trimmed) return { valid: false, message: 'الرجاء إدخال إجابة' };
            if (trimmed.length < 1) return { valid: false, message: 'الإجابة قصيرة جداً' };
            if (trimmed.length > 200) return { valid: false, message: 'الإجابة طويلة جداً (حد أقصى 200 حرف)' };
            return { valid: true, value: trimmed };
        }
    };

    // ===== إدارة localStorage بشكل آمن =====
    window.storage = {
        set: function (key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.error('خطأ في حفظ البيانات:', e);
                return false;
            }
        },

        get: function (key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                console.error('خطأ في قراءة البيانات:', e);
                return defaultValue;
            }
        },

        remove: function (key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (e) {
                console.error('خطأ في حذف البيانات:', e);
                return false;
            }
        },

        clear: function () {
            try {
                localStorage.clear();
                return true;
            } catch (e) {
                console.error('خطأ في مسح البيانات:', e);
                return false;
            }
        }
    };

    // ===== خلط المصفوفات بشكل عشوائي (Fisher-Yates) =====
    window.shuffleArray = function (array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // ===== تنسيق الأرقام العربية =====
    window.formatNumber = function (num) {
        return num.toLocaleString('ar-SA');
    };

    // ===== تنسيق الوقت =====
    window.formatTime = function (seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // ===== إظهار رسالة تأكيد =====
    window.showConfirm = function (message, onConfirm, onCancel) {
        if (confirm(message)) {
            if (onConfirm) onConfirm();
        } else {
            if (onCancel) onCancel();
        }
    };

    // ===== debounce للأحداث المتكررة =====
    window.debounce = function (func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // ===== التحقق من الاتصال بالإنترنت =====
    window.checkConnection = function () {
        return navigator.onLine;
    };

    // مراقبة حالة الاتصال
    window.addEventListener('online', () => {
        console.log('✅ تم استعادة الاتصال بالإنترنت');
    });

    window.addEventListener('offline', () => {
        console.warn('⚠️ انقطع الاتصال بالإنترنت');
    });

})();
