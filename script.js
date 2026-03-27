// ==========================================
// 1. CONFIG
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDZWcQ7INpnZj1Hbf0fICcsPs2Wndus8AM",
  authDomain: "liceum-eit-manager.firebaseapp.com",
  databaseURL: "https://liceum-eit-manager-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "liceum-eit-manager",
  storageBucket: "liceum-eit-manager.firebasestorage.app",
  messagingSenderId: "854455059262",
  appId: "1:854455059262:web:e6282bed63182559c5a26f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ВИПРАВЛЕНО UTC баг: конвертує Date в локальний ISO рядок (без зсуву UTC)
function toLocalISOString(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
           `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

// ==========================================
// КОНСТАНТИ (уникаємо magic strings)
// ==========================================
const ROLES = {
    TECH:    'tech',
    ADMIN:   'admin',
    TEACHER: 'teacher'
};

const EVENT_TYPES = {
    LESSON:     'lesson',
    TECH_BREAK: 'tech'
};

const STATUS_COLORS = {
    'Проведено':   '#10B981',
    'Запізнююсь':  '#F59E0B',
    'Скасовано':   '#EF4444'
};

// Глобальні змінні
let USERS = {
    "777": { role: "Технік", level: ROLES.TECH,    color: "#6B7280" },
    "888": { role: "Адмін",  level: ROLES.ADMIN,   color: "#4F46E5" },
    "999": { role: "Викладач", level: ROLES.TEACHER, color: "#10B981" }
};

let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEvent = null;
let tgConfig = null;
let autoLoginChecked = false;
let activeFilter = null;

// Варіанти причин для технічної перерви
const TECH_BREAK_REASONS = [
    "🔧 Технічне обслуговування обладнання",
    "🧹 Прибирання та санітарна обробка",
    "📦 Завезення / переміщення обладнання",
    "🔌 Планові електроремонтні роботи",
    "🎬 Зйомки / офіційний захід",
    "🚫 Студія не працює (вихідний)",
    "✏️ Інша причина..."
];

// ==========================================
// 2. АВТОРИЗАЦІЯ & АВТО-ВХІД
// ==========================================
db.ref('users').on('value', snap => {
    if (snap.val()) USERS = snap.val();
    if (!autoLoginChecked) {
        autoLoginChecked = true;
        checkAutoLogin();
    }
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else {
        Swal.fire({ icon: 'error', title: 'Помилка!', text: 'Невірний код доступу', confirmButtonColor: '#4F46E5' });
    }
};

function checkAutoLogin() {
    if (currentUser) return;
    const token = sessionStorage.getItem('st_token');
    if (token && USERS[token]) {
        currentUser = USERS[token];
        startApp();
    }
}

window.logout = () => { sessionStorage.clear(); location.reload(); };

// ==========================================
// КРОК 3: ОФЛАЙН-ІНДИКАЦІЯ
// ==========================================
function initConnectionMonitor() {
    const statusBar = document.getElementById('statusBar');

    const setOffline = () => {
        if (!statusBar) return;
        statusBar.textContent = '⚠️ Немає зʼєднання з інтернетом — зміни не зберігаються';
        statusBar.style.background = '#EF4444';
        statusBar.style.fontSize = '12px';
    };

    const setOnline = () => {
        if (!statusBar || !currentUser) return;
        statusBar.textContent = `Ви увійшли як: ${currentUser.role}`;
        statusBar.style.background = currentUser.color;
        statusBar.style.fontSize = '14px';
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Зʼєднання відновлено!', showConfirmButton: false, timer: 2000 });
    };

    window.addEventListener('offline', setOffline);
    window.addEventListener('online', setOnline);
    // Перевіряємо стан одразу при запуску
    if (!navigator.onLine) setOffline();
}
// Запускаємо моніторинг одразу (незалежно від логіну)
initConnectionMonitor();

// ==========================================
// LOGIN HELPERS
// ==========================================

// Вхід по Enter вже вішається в HTML, але на всяк випадок — глобальний fallback
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
        tryLogin();
    }
});

// Перевірка Caps Lock
window.checkCapsLock = (e) => {
    const warning = document.getElementById('capsLockWarning');
    if (!warning) return;
    // getModifierState доступний на keydown/keyup, на input — ні, тому перевіряємо символ
    let capsOn = false;
    if (e.getModifierState) {
        capsOn = e.getModifierState('CapsLock');
    } else if (e.type === 'input') {
        // Запасний метод: якщо введена велика буква без Shift
        const val = document.getElementById('passInput').value;
        const last = val[val.length - 1];
        if (last && last !== last.toLowerCase() && last === last.toUpperCase()) capsOn = true;
    }
    warning.style.display = capsOn ? 'flex' : 'none';
};

// Показати / сховати пароль
window.togglePassVisibility = () => {
    const input = document.getElementById('passInput');
    const icon = document.getElementById('eyeIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = '🙈';
    } else {
        input.type = 'password';
        icon.textContent = '👁';
    }
    input.focus();
};

function startApp() {
    // Плавна анімація зникнення екрану входу
    const loginScreen = document.getElementById('loginScreen');
    loginScreen.classList.add('login-fade-out');

    setTimeout(() => {
        loginScreen.style.display = 'none';
        loginScreen.classList.remove('login-fade-out');

        document.getElementById('topBar').style.display = 'flex';
        document.getElementById('statusBar').style.display = 'flex';

        const mainApp = document.getElementById('mainApp');
        mainApp.style.display = 'grid';
        mainApp.classList.add('app-fade-in');
        setTimeout(() => mainApp.classList.remove('app-fade-in'), 600);

        document.getElementById('roleBadge').textContent = currentUser.role;
        document.getElementById('roleBadge').style.background = currentUser.color;

        const statusBar = document.getElementById('statusBar');
        statusBar.textContent = `Ви увійшли як: ${currentUser.role}`;
        statusBar.style.background = currentUser.color;

        if (currentUser.level === ROLES.ADMIN || currentUser.level === ROLES.TECH) {
            document.getElementById('reportBtn').style.display = 'block';
            const bnavReport = document.getElementById('bnav-report');
            if (bnavReport) bnavReport.style.display = 'flex';
        }
        if (currentUser.level === ROLES.TECH) {
            document.getElementById('settingsBtn').style.display = 'block';
            document.getElementById('techBlockOption').style.display = 'block';
            document.getElementById('bulkDeleteBtn').style.display = 'block';
            const bnavSettings = document.getElementById('bnav-settings');
            if (bnavSettings) bnavSettings.style.display = 'flex';
        }

        // Bottom nav — показуємо тільки на мобільному
        if (window.innerWidth < 768) {
            document.getElementById('bottomNav').style.display = 'flex';
        }

        if (!calendar) initCalendar();
        loadData();
    }, 400);
}

// КРОК 4: Слухачі resize/orientation — ОДИН РАЗ глобально (не в startApp)
window.addEventListener('resize', () => {
    if (calendar) calendar.updateSize();
    const nav = document.getElementById('bottomNav');
    if (nav) nav.style.display = window.innerWidth < 768 ? 'flex' : 'none';
});
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        if (calendar) calendar.updateSize();
        const nav = document.getElementById('bottomNav');
        if (nav) nav.style.display = window.innerWidth < 768 ? 'flex' : 'none';
    }, 300);
});

// ==========================================
// 3. КАЛЕНДАР
// ==========================================
function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', slotMinTime: '08:00:00', slotMaxTime: '21:00:00',
        selectable: true,
        // КРОК 2: Drag & Drop + resize подій
        editable: true,
        eventDurationEditable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },

        // Перетягування події на новий час
        eventDrop: (info) => {
            const ev = info.event;
            // Тех.перерви — не переміщати
            if (ev.extendedProps.type === EVENT_TYPES.TECH_BREAK) { info.revert(); return; }
            // Тільки автор або технік можуть переміщувати
            const isAuthor = ev.extendedProps.creator === sessionStorage.getItem('st_token');
            if (!isAuthor && currentUser.level !== ROLES.TECH) {
                info.revert();
                Swal.fire({ icon: 'warning', title: 'Немає прав', text: 'Переміщувати можна лише власні уроки.', confirmButtonColor: '#4F46E5' });
                return;
            }
            const newStart = toLocalISOString(ev.start);
            const newEnd   = toLocalISOString(ev.end);
            const avail = checkSlotAvailability(ev.extendedProps.teacher, newStart, newEnd, ev.id);
            if (avail === 'tech_break') {
                info.revert();
                Swal.fire({ icon: 'error', title: 'Технічна перерва', text: 'Цей час студія зачинена!', confirmButtonColor: '#4F46E5' });
                return;
            }
            if (avail === 'teacher_busy') {
                info.revert();
                Swal.fire({ icon: 'error', title: 'Накладка', text: 'У вчителя вже є заняття в цей час.', confirmButtonColor: '#4F46E5' });
                return;
            }
            db.ref('events/' + ev.id).update({ start: newStart, end: newEnd })
                .then(() => Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Час оновлено!', showConfirmButton: false, timer: 1200 }))
                .catch(err => { info.revert(); Swal.fire('Помилка', err.message, 'error'); });
        },

        // Розтягування події (зміна тривалості)
        eventResize: (info) => {
            const ev = info.event;
            if (ev.extendedProps.type === EVENT_TYPES.TECH_BREAK) { info.revert(); return; }
            const isAuthor = ev.extendedProps.creator === sessionStorage.getItem('st_token');
            if (!isAuthor && currentUser.level !== ROLES.TECH) {
                info.revert();
                Swal.fire({ icon: 'warning', title: 'Немає прав', text: 'Змінювати можна лише власні уроки.', confirmButtonColor: '#4F46E5' });
                return;
            }
            const newStart = toLocalISOString(ev.start);
            const newEnd   = toLocalISOString(ev.end);
            const avail = checkSlotAvailability(ev.extendedProps.teacher, newStart, newEnd, ev.id);
            if (avail !== 'available') {
                info.revert();
                Swal.fire({ icon: 'error', title: 'Накладка', text: 'Новий час конфліктує з іншою подією.', confirmButtonColor: '#4F46E5' });
                return;
            }
            db.ref('events/' + ev.id).update({ start: newStart, end: newEnd })
                .then(() => Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Тривалість оновлено!', showConfirmButton: false, timer: 1200 }))
                .catch(err => { info.revert(); Swal.fire('Помилка', err.message, 'error'); });
        },

        select: (info) => {
            selectedSlot = info;
            document.getElementById('startTime').value = info.startStr.split('T')[1].substring(0, 5);
            document.getElementById('endTime').value = info.endStr.split('T')[1].substring(0, 5);
            // Скидаємо чекбокс і поля при відкритті
            document.getElementById('isTechBreak').checked = false;
            document.getElementById('bookingFields').style.opacity = '1';
            document.getElementById('techBreakReasonBlock').style.display = 'none';
            document.getElementById('techBreakReason').value = '';
            document.getElementById('techBreakCustom').style.display = 'none';
            document.getElementById('techBreakCustomInput').value = '';
            document.getElementById('modalOverlay').style.display = 'flex';
        },

        eventClick: (info) => {
            clickedEvent = info.event;
            const props = info.event.extendedProps;
            document.getElementById('statusModalOverlay').style.display = 'flex';

            // Показуємо назву + причину (для тех. перерви)
            let titleText = info.event.title;
            if (props.type === EVENT_TYPES.TECH_BREAK && props.reason) {
                titleText += `\n📝 ${props.reason}`;
            }
            document.getElementById('statusEventTitle').textContent = info.event.title;

            const reasonSub = document.getElementById('statusEventReason');
            if (props.type === EVENT_TYPES.TECH_BREAK && props.reason) {
                reasonSub.textContent = `📝 Причина: ${props.reason}`;
                reasonSub.style.display = 'block';
            } else {
                reasonSub.style.display = 'none';
            }

            // Ховаємо статус-select для тех.перерв
            const statusRow = document.getElementById('statusSelectRow');
            if (props.type === EVENT_TYPES.TECH_BREAK) {
                statusRow.style.display = 'none';
            } else {
                statusRow.style.display = 'block';
                const currentStatus = props.status || '🟢 Все за планом';
                document.getElementById('statusSelect').value = currentStatus;
            }

            // Логіка видалення (15 хв для викладача, завжди для техніка)
            const isAuthor = props.creator === sessionStorage.getItem('st_token');
            const diffMin = (Date.now() - props.createdAt) / 60000;
            const canDelete = (currentUser.level === ROLES.TECH) || (isAuthor && diffMin < 15);
            document.getElementById('btnDeleteEvent').style.display = canDelete ? 'block' : 'none';

            // КРОК 1: Кнопка редагування — тільки для уроків, тільки автор або технік
            const btnEdit = document.getElementById('btnEditEvent');
            if (btnEdit) {
                const canEdit = props.type === EVENT_TYPES.LESSON &&
                    ((isAuthor && diffMin < 15) || currentUser.level === ROLES.TECH);
                btnEdit.style.display = canEdit ? 'block' : 'none';
            }
        }
    });
    calendar.render();

    loadDynamicLists();
    initSettingsUI();
}

function loadDynamicLists() {
    db.ref('settings/subjects').on('value', snap => {
        const subjects = snap.val() || ["Математика", "Українська мова", "Англійська мова", "Історія України"];
        const list = document.getElementById('subjectsList');
        list.innerHTML = '';
        subjects.forEach(subj => {
            let opt = document.createElement('option');
            opt.value = subj;
            list.appendChild(opt);
        });
    });

    db.ref('settings/classes').on('value', snap => {
        const classes = snap.val() || ["10-А", "10-Б", "11-А", "11-Б", "11-В"];
        const list = document.getElementById('classesList');
        list.innerHTML = '';
        classes.forEach(cls => {
            let opt = document.createElement('option');
            opt.value = cls;
            list.appendChild(opt);
        });
    });
}

// ==========================================
// 4. ТЕХНІЧНА ПЕРЕРВА — логіка причини
// ==========================================
window.toggleTechBreak = (checked) => {
    document.getElementById('bookingFields').style.opacity = checked ? '0.2' : '1';
    document.getElementById('techBreakReasonBlock').style.display = checked ? 'block' : 'none';
    if (!checked) {
        document.getElementById('techBreakReason').value = '';
        document.getElementById('techBreakCustom').style.display = 'none';
        document.getElementById('techBreakCustomInput').value = '';
    }
};

window.onTechReasonChange = (val) => {
    const customBlock = document.getElementById('techBreakCustom');
    customBlock.style.display = (val === '✏️ Інша причина...') ? 'block' : 'none';
    if (val !== '✏️ Інша причина...') document.getElementById('techBreakCustomInput').value = '';
};

// ==========================================
// 5. ОПЕРАЦІЇ З ДАНИМИ
// ==========================================
window.confirmBooking = () => {
    // ЗАХИСТ від подвійного кліку
    const saveBtn = document.querySelector('#modalOverlay .btn-primary');
    if (saveBtn && saveBtn.disabled) return;
    if (saveBtn) saveBtn.disabled = true;

    const _releaseSaveBtn = () => { if (saveBtn) saveBtn.disabled = false; };
    const startTimeVal = document.getElementById('startTime').value;
    const endTimeVal = document.getElementById('endTime').value;

    if (startTimeVal >= endTimeVal) {
        Swal.fire({ icon: 'warning', title: 'Некоректний час', text: 'Час завершення має бути пізніше за початок!', confirmButtonColor: '#4F46E5' });
        _releaseSaveBtn(); return;
    }

    const isBreak = document.getElementById('isTechBreak').checked;
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = datePart + 'T' + startTimeVal + ':00';
    const end   = datePart + 'T' + endTimeVal   + ':00';

    if (!isBreak) {
        const teacherName = document.getElementById('eventTeacher').value;
        const avail = checkSlotAvailability(teacherName, start, end);
        if (avail === "tech_break") {
            Swal.fire({ icon: 'error', title: 'Технічна перерва', text: 'Запис неможливий: студія зачинена!', confirmButtonColor: '#4F46E5' });
            _releaseSaveBtn(); return;
        }
        if (avail === "teacher_busy") {
            Swal.fire({ icon: 'error', title: 'Накладка в розкладі', text: 'У викладача вже є заняття у цей проміжок.', confirmButtonColor: '#4F46E5' });
            _releaseSaveBtn(); return;
        }
    }

    // Технічна перерва — одиночний запис
    if (isBreak) {
        let reason = document.getElementById('techBreakReason').value;
        if (reason === '✏️ Інша причина...') {
            reason = document.getElementById('techBreakCustomInput').value.trim() || 'Не вказана';
        }
        if (!reason) {
            Swal.fire({ icon: 'info', title: 'Вкажіть причину', text: 'Будь ласка, оберіть або введіть причину технічної перерви.', confirmButtonColor: '#4F46E5' });
            _releaseSaveBtn(); return;
        }
        const id = Date.now().toString();
        const data = {
            id, start, end,
            title: "⛔ ТЕХНІЧНА ПЕРЕРВА",
            backgroundColor: "#6B7280",
            borderColor: "#6B7280",
            extendedProps: {
                id, type: EVENT_TYPES.TECH_BREAK, reason,
                createdAt: Date.now(),
                creator: sessionStorage.getItem('st_token')
            }
        };
        saveSingleEvent(data, `⛔ Тех.перерва: ${reason}\n📅 ${start.replace('T', ' ')}`);
        return; // _releaseSaveBtn не потрібен — saveSingleEvent сам розблокує через .then/.catch
    }

    // Урок — перевірка полів
    const subj = document.getElementById('eventSubject').value.trim();
    const cls  = document.getElementById('eventClass').value.trim();
    if (!subj || !cls) {
        Swal.fire({ icon: 'info', title: 'Увага', text: 'Заповніть предмет та клас!', confirmButtonColor: '#4F46E5' });
        _releaseSaveBtn(); return;
    }

    const teacher = document.getElementById('eventTeacher').value;
    const color = document.getElementById('eventColor').value;
    const lessonCount = parseInt(document.getElementById('eventCount').value) || 1;

    // Отримуємо тривалість уроку з налаштувань (default 45 хв)
    db.ref('settings/lessonDuration').once('value', snap => {
        const duration = snap.val() || 45;
        const events = [];

        let currentStart = new Date(start);
        let currentEnd   = new Date(end);

        for (let i = 0; i < lessonCount; i++) {
            const id = (Date.now() + i * 1000).toString();
            const lessonStart = new Date(currentStart);
            const lessonEnd   = (i === 0)
                ? new Date(currentEnd)
                : new Date(currentStart.getTime() + duration * 60000);

            // ВИПРАВЛЕНО: використовуємо локальний час замість UTC (.toISOString зсуває на UTC+0)
            const lessonStartStr = toLocalISOString(lessonStart);
            const lessonEndStr   = toLocalISOString(lessonEnd);

            // Перевірка накладок для кожного уроку
            const avail = checkSlotAvailability(teacher, lessonStartStr, lessonEndStr);
            if (avail === "tech_break" || avail === "teacher_busy") {
                Swal.fire({
                    icon: 'warning',
                    title: `Накладка на уроці ${i + 1}`,
                    text: avail === "tech_break"
                        ? `Урок ${i + 1} потрапляє на технічну перерву. Збережено ${i} з ${lessonCount} уроків.`
                        : `Урок ${i + 1}: у вчителя вже є заняття. Збережено ${i} з ${lessonCount} уроків.`,
                    confirmButtonColor: '#4F46E5'
                });
                break;
            }

            events.push({
                id,
                start: lessonStartStr,
                end: lessonEndStr,
                title: `${subj} (${cls})`,
                backgroundColor: color,
                borderColor: color,
                extendedProps: {
                    id, teacher, subject: subj, className: cls,
                    count: 1, type: EVENT_TYPES.LESSON,
                    createdAt: Date.now(),
                    creator: sessionStorage.getItem('st_token')
                }
            });

            currentStart = (i === 0) ? new Date(lessonEnd) : new Date(currentStart.getTime() + duration * 60000);
            currentEnd   = new Date(currentStart.getTime() + duration * 60000);
        }

        if (events.length === 0) { _releaseSaveBtn(); return; }

        Swal.fire({ title: 'Збереження...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const saves = events.map(ev => db.ref('events/' + ev.id).set(ev));
        Promise.all(saves).then(() => {
            sendTG(`🆕 ${events.length} уроків записано: ${subj} (${cls})\n👨‍🏫 ${teacher}\n📅 ${start.replace('T', ' ')}`);
            selectedSlot = null;
            closeModal();
            _releaseSaveBtn();
            Swal.fire({
                icon: 'success',
                title: events.length > 1 ? `${events.length} уроки збережено!` : 'Збережено!',
                showConfirmButton: false,
                timer: 1500
            });
        }).catch(() => {
            _releaseSaveBtn();
            Swal.fire('Помилка', 'Не вдалося зберегти дані', 'error');
        });
    });
};

function saveSingleEvent(data, tgMsg) {
    const saveBtn = document.querySelector('#modalOverlay .btn-primary');
    Swal.fire({ title: 'Збереження...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    db.ref('events/' + data.id).set(data).then(() => {
        sendTG(`🆕 ${tgMsg}`);
        selectedSlot = null;
        closeModal();
        if (saveBtn) saveBtn.disabled = false;
        Swal.fire({ icon: 'success', title: 'Збережено!', showConfirmButton: false, timer: 1500 });
    }).catch(() => {
        if (saveBtn) saveBtn.disabled = false;
        Swal.fire('Помилка', 'Не вдалося зберегти дані', 'error');
    });
}

window.applyStatus = () => {
    if (!clickedEvent) return;
    const newStatus = document.getElementById('statusSelect').value;
    const eventId = clickedEvent.id || clickedEvent.extendedProps.id;
    if (!eventId) { Swal.fire('Помилка', 'Не вдалося визначити ID події', 'error'); return; }

    // ВИПРАВЛЕНО: зберігаємо статус у Firebase (раніше він зникав після перезавантаження)
    db.ref('events/' + eventId).update({ status: newStatus }).then(() => {
        clickedEvent.setExtendedProp('status', newStatus);

        // Визначаємо новий колір через константи
        let newColor = clickedEvent.extendedProps.originalColor || '#4F46E5';
        for (const [key, color] of Object.entries(STATUS_COLORS)) {
            if (newStatus.includes(key)) { newColor = color; break; }
        }

        clickedEvent.setProp('backgroundColor', newColor);
        clickedEvent.setProp('borderColor', newColor);

        if (tgConfig && tgConfig.token && tgConfig.chatId) {
            const t = clickedEvent.extendedProps.teacher || 'Невідомий';
            const s = clickedEvent.extendedProps.subject || '';
            const c = clickedEvent.extendedProps.className || '';
            fetch(`https://api.telegram.org/bot${tgConfig.token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: tgConfig.chatId, text: `🔔 ЗМІНА СТАТУСУ\n👨‍🏫 ${t}\n📚 ${s} (${c})\n🆕 ${newStatus}` })
            }).catch(e => console.error(e));
        }

        closeStatusModal();
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Статус оновлено!', showConfirmButton: false, timer: 1500 });
    }).catch(error => Swal.fire({ icon: 'error', title: 'Помилка бази даних', text: error.message }));
};

window.handleDelete = () => {
    Swal.fire({
        title: 'Ви впевнені?', text: "Цю дію неможливо скасувати!", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#EF4444', cancelButtonColor: '#6B7280',
        confirmButtonText: 'Так, видалити', cancelButtonText: 'Скасувати'
    }).then(result => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Видалення...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const eventId = clickedEvent.id || clickedEvent.extendedProps.id;
            db.ref('events/' + eventId).remove()
                .then(() => {
                    sendTG(`🗑 Видалено: ${clickedEvent.title}`);
                    closeStatusModal();
                    Swal.fire({ title: 'Видалено!', icon: 'success', timer: 1500, showConfirmButton: false });
                })
                .catch(err => Swal.fire('Помилка видалення', err.message, 'error'));
        }
    });
};

// ==========================================
// 6. НАЛАШТУВАННЯ
// ==========================================
window.openSettings = () => {
    if (tgConfig) {
        document.getElementById('tgToken').value = tgConfig.token || '';
        document.getElementById('tgChatId').value = tgConfig.chatId || '';
    }
    // Завантажуємо тривалість уроку
    db.ref('settings/lessonDuration').once('value', snap => {
        document.getElementById('lessonDurationInput').value = snap.val() || 45;
    });
    document.getElementById('settingsModal').style.display = 'flex';
};

window.closeSettings = () => document.getElementById('settingsModal').style.display = 'none';

window.saveSettings = () => {
    const token = document.getElementById('tgToken').value.trim();
    const chat = document.getElementById('tgChatId').value.trim();

    if (!token || !chat) {
        return Swal.fire({ icon: 'warning', title: 'Увага', text: 'Заповніть обидва поля TG!', confirmButtonColor: '#4F46E5' });
    }

    const duration = parseInt(document.getElementById('lessonDurationInput').value) || 45;

    db.ref('settings_tg').set({ token, chatId: chat })
        .then(() => db.ref('settings/lessonDuration').set(duration))
        .then(() => {
            Swal.fire({ icon: 'success', title: 'Збережено!', text: 'Налаштування успішно збережено.', confirmButtonColor: '#4F46E5' });
            closeSettings();
        })
        .catch(error => Swal.fire('Помилка Firebase', error.message, 'error'));
};

// [НОВЕ] Попередження при зміні пароля адміна
window.changePassword = () => {
    const newCode = document.getElementById('newPassInput').value.trim();
    const roleValue = document.getElementById('roleSelect').value;

    if (newCode.length < 3) {
        return Swal.fire({ icon: 'warning', title: 'Занадто короткий код', text: 'Мінімум 3 символи!', confirmButtonColor: '#4F46E5' });
    }

    const roleMap = {
        "999": { role: "Викладач", level: ROLES.TEACHER, color: "#10B981" },
        "888": { role: "Адмін",    level: ROLES.ADMIN,   color: "#4F46E5" },
        "777": { role: "Технік",   level: ROLES.TECH,    color: "#6B7280" }
    };
    const selectedRole = roleMap[roleValue];
    if (!selectedRole) return;

    // [НОВЕ] Попередження якщо змінюється пароль адміна
    const doChange = () => {
        let tempUsers = { ...USERS };
        for (let c in tempUsers) {
            if (tempUsers[c].level === selectedRole.level) delete tempUsers[c];
        }
        tempUsers[newCode] = selectedRole;
        db.ref('users').set(tempUsers).then(() => {
            document.getElementById('newPassInput').value = '';
            Swal.fire({ icon: 'success', title: 'Пароль оновлено!', showConfirmButton: false, timer: 1500 });
        }).catch(error => Swal.fire('Помилка', error.message, 'error'));
    };

    if (selectedRole.level === ROLES.ADMIN) {
        Swal.fire({
            icon: 'warning',
            title: '⚠️ Зміна пароля Адміна',
            html: `Ви збираєтесь змінити пароль для ролі <b>Адмін</b>.<br><br>
                   Новий пароль: <b>${newCode}</b><br><br>
                   <span style="color:#EF4444;">Усі адміни втратять доступ до старого паролю!</span>`,
            showCancelButton: true,
            confirmButtonColor: '#EF4444',
            cancelButtonColor: '#6B7280',
            confirmButtonText: 'Розумію, змінити',
            cancelButtonText: 'Скасувати'
        }).then(result => { if (result.isConfirmed) doChange(); });
    } else {
        doChange();
    }
};

// ==========================================
// 7. ЗВІТНІСТЬ (з фільтром дат + автор)
// ==========================================
window.openReport = () => {
    // Встановлюємо дефолтний діапазон: поточний місяць
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    document.getElementById('reportDateFrom').value = firstDay.toISOString().split('T')[0];
    document.getElementById('reportDateTo').value = lastDay.toISOString().split('T')[0];

    renderReport();
    document.getElementById('reportOverlay').style.display = 'flex';
};

window.applyReportFilter = () => renderReport();

// КРОК 9: XSS-захист — екранування HTML у всіх даних від користувача
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderReport() {
    const dateFrom = document.getElementById('reportDateFrom').value;
    const dateTo = document.getElementById('reportDateTo').value;

    let allEvents = calendar.getEvents().filter(e => e.extendedProps.type === EVENT_TYPES.LESSON);

    // Фільтр за датами
    if (dateFrom) allEvents = allEvents.filter(e => e.start >= new Date(dateFrom));
    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59);
        allEvents = allEvents.filter(e => e.start <= toDate);
    }

    allEvents.sort((a, b) => a.start - b.start);

    const statsByMonth = {};
    const statsByTeacher = {};
    let rows = '';

    allEvents.forEach(e => {
        const count = parseInt(e.extendedProps.count) || 1;
        const teacher = e.extendedProps.teacher || 'Невідомий';
        const status = e.extendedProps.status || '🟢 Все за планом';

        // Автор запису — шукаємо в USERS за creator token
        const creatorToken = e.extendedProps.creator || '';
        const authorData = USERS[creatorToken];
        const authorLabel = authorData ? authorData.role : '—';

        let mKey = e.start.toLocaleString('uk-UA', { month: 'long', year: 'numeric' });
        mKey = mKey.charAt(0).toUpperCase() + mKey.slice(1);
        if (!statsByMonth[mKey]) statsByMonth[mKey] = 0;
        statsByMonth[mKey] += count;

        if (!statsByTeacher[teacher]) statsByTeacher[teacher] = { total: 0, done: 0, late: 0, canceled: 0 };
        statsByTeacher[teacher].total += count;
        if (status.includes('Проведено')) statsByTeacher[teacher].done += count;
        if (status.includes('Запізнююсь')) statsByTeacher[teacher].late += count;
        if (status.includes('Скасовано')) statsByTeacher[teacher].canceled += count;

        rows += `<tr>
            <td>${esc(teacher)}</td>
            <td>${esc(e.start.toLocaleDateString())}</td>
            <td>${esc(e.extendedProps.subject)}</td>
            <td>${esc(e.extendedProps.className)}</td>
            <td>${esc(count)}</td>
            <td style="font-size:12px;color:#6B7280;">${esc(authorLabel)}</td>
            <td style="border-bottom:1px solid #000;min-width:60px;"></td>
        </tr>`;
    });

    let summaryHtml = `<div style="font-size:13px;color:#6B7280;margin-bottom:12px;">Показано подій: <b>${allEvents.length}</b></div>`;
    summaryHtml += '<h4 style="margin:0 0 10px 0; color:#1F2937;">📅 Підсумок по місяцях:</h4><ul style="padding-left:20px; margin:0 0 15px 0; color:#4B5563;">';
    for (const [m, val] of Object.entries(statsByMonth)) {
        summaryHtml += `<li style="margin-bottom:4px;"><b>${m}:</b> ${val} уроків</li>`;
    }
    summaryHtml += '</ul>';

    if (currentUser && (currentUser.level === ROLES.ADMIN || currentUser.level === ROLES.TECH)) {
        summaryHtml += `<h4 style="margin:0 0 15px 0; color:#1F2937; border-top: 1px dashed #E5E7EB; padding-top: 15px;">📈 Аналітика по викладачах:</h4>`;
        summaryHtml += `<div style="display:flex; flex-wrap:wrap; gap:10px;">`;
        for (let tName in statsByTeacher) {
            let t = statsByTeacher[tName];
            summaryHtml += `
                <div style="background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px 15px; min-width: 150px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    <div style="font-weight: 600; color: #374151; margin-bottom: 8px;">👨‍🏫 ${esc(tName)}</div>
                    <div style="font-size: 0.85em; color: #6B7280; display: flex; flex-direction: column; gap: 4px;">
                        <span>Заплановано: <b>${t.total}</b></span>
                        <span style="color: #10B981;">✅ Проведено: <b>${t.done}</b></span>
                        ${t.late > 0 ? `<span style="color: #F59E0B;">🏃 Запізнення: <b>${t.late}</b></span>` : ''}
                        ${t.canceled > 0 ? `<span style="color: #EF4444;">❌ Скасовано: <b>${t.canceled}</b></span>` : ''}
                    </div>
                </div>`;
        }
        summaryHtml += `</div>`;
    }

    document.getElementById('reportSummary').innerHTML = summaryHtml;
    document.getElementById('reportTableBody').innerHTML = rows || '<tr><td colspan="7" style="text-align:center;color:#9CA3AF;padding:20px;">Немає записів за обраний період</td></tr>';
}

window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

// ==========================================
// 8. ЗАВАНТАЖЕННЯ ДАНИХ
// ==========================================
function loadData() {
    db.ref('settings_tg').on('value', snap => { tgConfig = snap.val(); });

    db.ref('teachers').on('value', snap => {
        const list = snap.val() || [];
        document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('filterList').innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
    });

    // ОПТИМІЗОВАНО: child_added/changed/removed замість on('value')
    // Тепер при зміні однієї події — не перезавантажується весь список
    db.ref('events').on('child_added', snap => {
        const ev = formatEventFromDB(snap.val());
        if (ev) {
            calendar.addEvent(ev);
            if (activeFilter) applyActiveFilter();
        }
    });

    db.ref('events').on('child_changed', snap => {
        const data = snap.val();
        if (!data) return;
        // Видаляємо стару версію і додаємо нову
        const existing = calendar.getEventById(snap.key);
        if (existing) existing.remove();
        const ev = formatEventFromDB(data);
        if (ev) {
            calendar.addEvent(ev);
            if (activeFilter) applyActiveFilter();
        }
    });

    db.ref('events').on('child_removed', snap => {
        const existing = calendar.getEventById(snap.key);
        if (existing) existing.remove();
    });
}

// Допоміжна: форматує подію з Firebase для FullCalendar + застосовує колір статусу
function formatEventFromDB(ev) {
    if (!ev) return null;
    if (!ev.extendedProps) ev.extendedProps = {};

    let finalColor = ev.backgroundColor || '#3B82F6';
    if (ev.extendedProps.status) {
        for (const [key, color] of Object.entries(STATUS_COLORS)) {
            if (ev.extendedProps.status.includes(key)) { finalColor = color; break; }
        }
    }

    ev.backgroundColor = finalColor;
    ev.borderColor     = finalColor;
    ev.extendedProps.originalColor = ev.backgroundColor;
    return ev;
}

function sendTG(msg) {
    if (tgConfig && tgConfig.token && tgConfig.chatId) {
        fetch(`https://api.telegram.org/bot${tgConfig.token}/sendMessage?chat_id=${tgConfig.chatId}&text=${encodeURIComponent(msg)}`);
    }
}

window.toggleFilter = (t) => {
    activeFilter = t;
    applyActiveFilter();
    document.querySelectorAll('.filter-item').forEach(el => el.classList.toggle('active', el.textContent === t));
};

window.resetFilters = () => {
    activeFilter = null;
    calendar.getEvents().forEach(e => e.setProp('display', 'auto'));
    document.querySelectorAll('.filter-item').forEach(el => el.classList.remove('active'));
};

function applyActiveFilter() {
    if (!activeFilter) return;
    calendar.getEvents().forEach(e => {
        if (e.extendedProps.type === EVENT_TYPES.TECH_BREAK) return;
        e.setProp('display', e.extendedProps.teacher === activeFilter ? 'auto' : 'none');
    });
}

// КРОК 6: Пошук по календарю
window.searchCalendar = (query) => {
    const q = query.trim().toLowerCase();
    const results = document.getElementById('searchResults');

    if (!q) {
        // Скидаємо пошук — повертаємо фільтр вчителя або показуємо всіх
        calendar.getEvents().forEach(e => {
            if (activeFilter && e.extendedProps.type !== EVENT_TYPES.TECH_BREAK) {
                e.setProp('display', e.extendedProps.teacher === activeFilter ? 'auto' : 'none');
            } else {
                e.setProp('display', 'auto');
            }
        });
        if (results) results.textContent = '';
        return;
    }

    let found = 0;
    calendar.getEvents().forEach(e => {
        if (e.extendedProps.type === EVENT_TYPES.TECH_BREAK) {
            e.setProp('display', 'none');
            return;
        }
        const subject  = (e.extendedProps.subject   || '').toLowerCase();
        const teacher  = (e.extendedProps.teacher   || '').toLowerCase();
        const cls      = (e.extendedProps.className || '').toLowerCase();
        const matches  = subject.includes(q) || teacher.includes(q) || cls.includes(q);
        e.setProp('display', matches ? 'auto' : 'none');
        if (matches) found++;
    });

    if (results) results.textContent = found ? `Знайдено: ${found}` : 'Нічого не знайдено';
};

window.clearSearch = () => {
    const input = document.getElementById('calendarSearch');
    if (input) { input.value = ''; searchCalendar(''); }
};

// КРОК 10: Закриття форми — з підтвердженням якщо є незбережені дані
window.closeModal = () => {
    const subj    = document.getElementById('eventSubject')?.value.trim();
    const cls     = document.getElementById('eventClass')?.value.trim();
    const isBreak = document.getElementById('isTechBreak')?.checked;
    const isDirty = !isBreak && (subj || cls);

    if (isDirty) {
        Swal.fire({
            title: 'Скасувати запис?',
            text: 'Введені дані буде втрачено.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#EF4444',
            cancelButtonColor: '#6B7280',
            confirmButtonText: 'Так, скасувати',
            cancelButtonText: 'Продовжити заповнення'
        }).then(result => { if (result.isConfirmed) _doCloseModal(); });
    } else {
        _doCloseModal();
    }
};

function _doCloseModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    selectedSlot = null;
    ['eventSubject', 'eventClass', 'techBreakCustomInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const cb = document.getElementById('isTechBreak');
    if (cb) { cb.checked = false; toggleTechBreak(false); }
}

window.closeStatusModal = () => {
    document.getElementById('statusModalOverlay').style.display = 'none';
    clickedEvent = null;
};

// КРОК 1: Відкриття форми редагування — заповнює поля поточними даними події
window.openEditModal = () => {
    if (!clickedEvent) return;
    const props = clickedEvent.extendedProps;

    // Закриваємо модалку статусу
    document.getElementById('statusModalOverlay').style.display = 'none';

    // Заповнюємо форму поточними даними
    const startDate = clickedEvent.start;
    const endDate   = clickedEvent.end || clickedEvent.start;

    const pad = n => String(n).padStart(2, '0');
    document.getElementById('startTime').value = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
    document.getElementById('endTime').value   = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
    document.getElementById('eventSubject').value = props.subject  || '';
    document.getElementById('eventClass').value   = props.className || '';
    document.getElementById('eventCount').value   = '1';

    // Встановлюємо вчителя
    const teacherSelect = document.getElementById('eventTeacher');
    if (teacherSelect) {
        for (let opt of teacherSelect.options) {
            if (opt.value === props.teacher) { opt.selected = true; break; }
        }
    }

    // Встановлюємо колір (шукаємо найближчий варіант)
    const colorSelect = document.getElementById('eventColor');
    if (colorSelect && clickedEvent.extendedProps.originalColor) {
        for (let opt of colorSelect.options) {
            if (opt.value === clickedEvent.extendedProps.originalColor) { opt.selected = true; break; }
        }
    }

    // Міняємо заголовок модалки і кнопку
    const header = document.querySelector('#modalOverlay .modal-header h3');
    if (header) header.textContent = '✏️ Редагування запису';

    const saveBtn = document.querySelector('#modalOverlay .btn-primary');
    if (saveBtn) {
        saveBtn.textContent = 'Зберегти зміни';
        saveBtn.onclick = () => saveEditedEvent(clickedEvent.id);
    }

    // Потрібно зберегти selectedSlot.startStr для datePart
    selectedSlot = {
        startStr: toLocalISOString(startDate)
    };

    document.getElementById('modalOverlay').style.display = 'flex';
};

// Зберігаємо відредаговану подію
function saveEditedEvent(eventId) {
    const saveBtn = document.querySelector('#modalOverlay .btn-primary');
    if (saveBtn && saveBtn.disabled) return;
    if (saveBtn) saveBtn.disabled = true;
    const _release = () => { if (saveBtn) saveBtn.disabled = false; };

    const startTimeVal = document.getElementById('startTime').value;
    const endTimeVal   = document.getElementById('endTime').value;
    if (startTimeVal >= endTimeVal) {
        Swal.fire({ icon: 'warning', title: 'Некоректний час', text: 'Час завершення має бути пізніше за початок!', confirmButtonColor: '#4F46E5' });
        _release(); return;
    }

    const subj    = document.getElementById('eventSubject').value.trim();
    const cls     = document.getElementById('eventClass').value.trim();
    const teacher = document.getElementById('eventTeacher').value;
    const color   = document.getElementById('eventColor').value;
    if (!subj || !cls) {
        Swal.fire({ icon: 'info', title: 'Увага', text: 'Заповніть предмет та клас!', confirmButtonColor: '#4F46E5' });
        _release(); return;
    }

    const datePart = selectedSlot.startStr.split('T')[0];
    const newStart = datePart + 'T' + startTimeVal + ':00';
    const newEnd   = datePart + 'T' + endTimeVal   + ':00';

    const avail = checkSlotAvailability(teacher, newStart, newEnd, eventId);
    if (avail === 'tech_break') {
        Swal.fire({ icon: 'error', title: 'Технічна перерва', text: 'Цей час студія зачинена!', confirmButtonColor: '#4F46E5' });
        _release(); return;
    }
    if (avail === 'teacher_busy') {
        Swal.fire({ icon: 'error', title: 'Накладка', text: 'У вчителя вже є заняття в цей час.', confirmButtonColor: '#4F46E5' });
        _release(); return;
    }

    const updates = {
        start: newStart, end: newEnd,
        title: `${subj} (${cls})`,
        backgroundColor: color, borderColor: color,
        'extendedProps/subject': subj,
        'extendedProps/className': cls,
        'extendedProps/teacher': teacher
    };

    Swal.fire({ title: 'Збереження...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    db.ref('events/' + eventId).update(updates).then(() => {
        _release();
        // Повертаємо заголовок і кнопку до початкового стану
        const header = document.querySelector('#modalOverlay .modal-header h3');
        if (header) header.textContent = 'Новий запис';
        if (saveBtn) { saveBtn.textContent = 'Зберегти'; saveBtn.onclick = confirmBooking; }
        _doCloseModal();
        Swal.fire({ icon: 'success', title: 'Зміни збережено!', showConfirmButton: false, timer: 1500 });
    }).catch(err => { _release(); Swal.fire('Помилка', err.message, 'error'); });
}

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const isOpen = sidebar.classList.contains('sidebar-open');
    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.add('sidebar-open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

window.closeSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('sidebar-open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
};

// Перейти на сьогодні в календарі (для bottom nav)
window.scrollToToday = () => {
    if (calendar) {
        calendar.today();
        // На мобільному — перемикаємо на денний вигляд
        if (window.innerWidth < 768) {
            calendar.changeView('timeGridDay');
        }
    }
};

// excludeId — щоб не конфліктувати з самою собою при майбутньому редагуванні
function checkSlotAvailability(teacherName, newStart, newEnd, excludeId = null) {
    const events = calendar.getEvents();
    const s = new Date(newStart).getTime();
    const e = new Date(newEnd).getTime();
    for (let ev of events) {
        if (excludeId && ev.id === excludeId) continue;
        const evS = ev.start.getTime();
        const evE = ev.end ? ev.end.getTime() : evS;
        if (s < evE && e > evS) {
            if (ev.extendedProps.type === EVENT_TYPES.TECH_BREAK) return "tech_break";
            if (ev.extendedProps.type === EVENT_TYPES.LESSON && ev.extendedProps.teacher === teacherName) return "teacher_busy";
        }
    }
    return "available";
}

// ==========================================
// 9. НАЛАШТУВАННЯ — Предмети, Класи, Вчителі
// ==========================================
function initSettingsUI() {
    if (!currentUser || currentUser.level !== ROLES.TECH) return;
    document.getElementById('techSettingsBlock').style.display = 'block';

    // Предмети
    db.ref('settings/subjects').on('value', snap => {
        const list = snap.val() || [];
        document.getElementById('settingsSubjectsList').innerHTML = list.map((item, i) => `
            <li>${item}<button class="btn btn-danger" onclick="removeSettingItem('subjects',${i})">❌</button></li>`).join('');
    });

    // Класи
    db.ref('settings/classes').on('value', snap => {
        const list = snap.val() || [];
        document.getElementById('settingsClassesList').innerHTML = list.map((item, i) => `
            <li>${item}<button class="btn btn-danger" onclick="removeSettingItem('classes',${i})">❌</button></li>`).join('');
    });

    // [НОВЕ] Вчителі
    db.ref('teachers').on('value', snap => {
        const list = snap.val() || [];
        document.getElementById('settingsTeachersList').innerHTML = list.map((item, i) => `
            <li>${item}<button class="btn btn-danger" onclick="removeTeacher(${i})">❌</button></li>`).join('');
    });
}

window.addSettingItem = (path, inputId) => {
    const input = document.getElementById(inputId);
    const val = input.value.trim();
    if (!val) return;
    db.ref(`settings/${path}`).once('value', snap => {
        let list = snap.val() || [];
        if (!list.includes(val)) {
            list.push(val);
            db.ref(`settings/${path}`).set(list).then(() => {
                input.value = '';
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Додано!', showConfirmButton: false, timer: 1500 });
            });
        } else {
            Swal.fire({ icon: 'error', title: 'Помилка', text: 'Такий запис вже існує!', confirmButtonColor: '#4F46E5' });
        }
    });
};

window.removeSettingItem = (path, index) => {
    Swal.fire({
        title: 'Видалити запис?', icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#EF4444', cancelButtonColor: '#6B7280',
        confirmButtonText: 'Так, видалити', cancelButtonText: 'Скасувати'
    }).then(result => {
        if (result.isConfirmed) {
            db.ref(`settings/${path}`).once('value', snap => {
                let list = snap.val() || [];
                list.splice(index, 1);
                db.ref(`settings/${path}`).set(list);
            });
        }
    });
};

// [НОВЕ] Додати вчителя
window.addTeacher = () => {
    const input = document.getElementById('newTeacherInput');
    const val = input.value.trim();
    if (!val) return;
    db.ref('teachers').once('value', snap => {
        let list = snap.val() || [];
        if (!list.includes(val)) {
            list.push(val);
            db.ref('teachers').set(list).then(() => {
                input.value = '';
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Вчителя додано!', showConfirmButton: false, timer: 1500 });
            });
        } else {
            Swal.fire({ icon: 'error', title: 'Помилка', text: 'Такий вчитель вже є у списку!', confirmButtonColor: '#4F46E5' });
        }
    });
};

// [НОВЕ] Видалити вчителя
window.removeTeacher = (index) => {
    Swal.fire({
        title: 'Видалити вчителя?',
        text: 'Усі його записи в календарі залишаться, але зі списку він зникне.',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#EF4444', cancelButtonColor: '#6B7280',
        confirmButtonText: 'Так, видалити', cancelButtonText: 'Скасувати'
    }).then(result => {
        if (result.isConfirmed) {
            db.ref('teachers').once('value', snap => {
                let list = snap.val() || [];
                list.splice(index, 1);
                db.ref('teachers').set(list);
            });
        }
    });
};

// ==========================================
// 10. МАСОВЕ ВИДАЛЕННЯ СТАРИХ ПОДІЙ (Технік)
// ==========================================
window.openBulkDelete = () => {
    const now = new Date();
    const defaultDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    document.getElementById('bulkDeleteDate').value = defaultDate;
    document.getElementById('bulkDeleteModal').style.display = 'flex';
};

window.closeBulkDelete = () => document.getElementById('bulkDeleteModal').style.display = 'none';

window.confirmBulkDelete = () => {
    const beforeDate = new Date(document.getElementById('bulkDeleteDate').value);
    if (isNaN(beforeDate)) {
        return Swal.fire({ icon: 'warning', title: 'Оберіть дату', confirmButtonColor: '#4F46E5' });
    }

    const toDelete = calendar.getEvents().filter(e => e.start < beforeDate);

    if (toDelete.length === 0) {
        return Swal.fire({ icon: 'info', title: 'Немає записів', text: 'Записів до цієї дати не знайдено.', confirmButtonColor: '#4F46E5' });
    }

    Swal.fire({
        icon: 'warning',
        title: `Видалити ${toDelete.length} записів?`,
        html: `Всі події <b>до ${beforeDate.toLocaleDateString('uk-UA')}</b> будуть видалені.<br><span style="color:#EF4444;">Цю дію неможливо скасувати!</span>`,
        showCancelButton: true,
        confirmButtonColor: '#EF4444', cancelButtonColor: '#6B7280',
        confirmButtonText: 'Так, видалити все', cancelButtonText: 'Скасувати'
    }).then(result => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Видалення...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const removes = toDelete.map(e => db.ref('events/' + (e.id || e.extendedProps.id)).remove());
            Promise.all(removes).then(() => {
                closeBulkDelete();
                Swal.fire({ icon: 'success', title: `${toDelete.length} записів видалено!`, showConfirmButton: false, timer: 2000 });
            }).catch(err => Swal.fire('Помилка', err.message, 'error'));
        }
    });
};

// ==========================================
// 11. ЕКСПОРТ В CSV
// ==========================================
window.exportToCSV = () => {
    const dateFrom = document.getElementById('reportDateFrom').value;
    const dateTo = document.getElementById('reportDateTo').value;

    let events = calendar.getEvents().filter(e => e.extendedProps.type === EVENT_TYPES.LESSON);
    if (dateFrom) events = events.filter(e => e.start >= new Date(dateFrom));
    if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59); events = events.filter(e => e.start <= d); }
    events.sort((a, b) => a.start - b.start);

    let csv = "\uFEFF";
    csv += "Вчитель;Дата;Час;Предмет;Клас;Уроків;Статус;Автор\n";

    events.forEach(e => {
        const creatorToken = e.extendedProps.creator || '';
        const authorData = USERS[creatorToken];
        const author = authorData ? authorData.role : '—';
        csv += `"${e.extendedProps.teacher||''}";"${e.start.toLocaleDateString()}";"${e.start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}";"${e.extendedProps.subject||''}";"${e.extendedProps.className||''}";"${e.extendedProps.count||1}";"${e.extendedProps.status||'Все за планом'}";"${author}"\n`;
    });

    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })));
    link.setAttribute("download", `Zvit_Liceum_${new Date().toLocaleDateString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Файл завантажено!', showConfirmButton: false, timer: 2000 });
};
