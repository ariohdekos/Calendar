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

// Глобальні змінні
let USERS = {
    "777": { role: "Технік", level: "tech", color: "#6B7280" },
    "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
    "999": { role: "Викладач", level: "teacher", color: "#10B981" }
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

        if (currentUser.level === 'admin' || currentUser.level === 'tech') {
            document.getElementById('reportBtn').style.display = 'block';
        }
        if (currentUser.level === 'tech') {
            document.getElementById('settingsBtn').style.display = 'block';
            document.getElementById('techBlockOption').style.display = 'block';
            document.getElementById('bulkDeleteBtn').style.display = 'block';
        }

        if (!calendar) initCalendar();
        loadData();
    }, 400);
}

// ==========================================
// 3. КАЛЕНДАР
// ==========================================
function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', slotMinTime: '08:00:00', slotMaxTime: '21:00:00',
        selectable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },

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
            if (props.type === 'tech' && props.reason) {
                titleText += `\n📝 ${props.reason}`;
            }
            document.getElementById('statusEventTitle').textContent = info.event.title;

            // Підрядок з причиною тех.перерви
            const reasonSub = document.getElementById('statusEventReason');
            if (props.type === 'tech' && props.reason) {
                reasonSub.textContent = `📝 Причина: ${props.reason}`;
                reasonSub.style.display = 'block';
            } else {
                reasonSub.style.display = 'none';
            }

            // Ховаємо статус-select для тех.перерв
            const statusRow = document.getElementById('statusSelectRow');
            if (props.type === 'tech') {
                statusRow.style.display = 'none';
            } else {
                statusRow.style.display = 'block';
                const currentStatus = props.status || '🟢 Все за планом';
                document.getElementById('statusSelect').value = currentStatus;
            }

            // Логіка видалення (15 хв для викладача, завжди для техніка)
            const isAuthor = props.creator === sessionStorage.getItem('st_token');
            const diffMin = (Date.now() - props.createdAt) / 60000;
            const canDelete = (currentUser.level === 'tech') || (isAuthor && diffMin < 15);
            document.getElementById('btnDeleteEvent').style.display = canDelete ? 'block' : 'none';
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
    const startTimeVal = document.getElementById('startTime').value;
    const endTimeVal = document.getElementById('endTime').value;

    if (startTimeVal >= endTimeVal) {
        Swal.fire({ icon: 'warning', title: 'Некоректний час', text: 'Час завершення має бути пізніше за початок!', confirmButtonColor: '#4F46E5' });
        return;
    }

    const isBreak = document.getElementById('isTechBreak').checked;
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = datePart + 'T' + startTimeVal + ':00';
    const end = datePart + 'T' + endTimeVal + ':00';

    if (!isBreak) {
        const teacherName = document.getElementById('eventTeacher').value;
        const avail = checkSlotAvailability(teacherName, start, end);
        if (avail === "tech_break") {
            Swal.fire({ icon: 'error', title: 'Технічна перерва', text: 'Запис неможливий: студія зачинена!', confirmButtonColor: '#4F46E5' });
            return;
        }
        if (avail === "teacher_busy") {
            Swal.fire({ icon: 'error', title: 'Накладка в розкладі', text: `У викладача вже є заняття у цей проміжок.`, confirmButtonColor: '#4F46E5' });
            return;
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
            return;
        }
        const id = Date.now().toString();
        const data = {
            id, start, end,
            title: "⛔ ТЕХНІЧНА ПЕРЕРВА",
            backgroundColor: "#6B7280",
            borderColor: "#6B7280",
            extendedProps: {
                id, type: "tech", reason,
                createdAt: Date.now(),
                creator: sessionStorage.getItem('st_token')
            }
        };
        saveSingleEvent(data, `⛔ Тех.перерва: ${reason}\n📅 ${start.replace('T', ' ')}`);
        return;
    }

    // Урок — перевірка полів
    const subj = document.getElementById('eventSubject').value.trim();
    const cls = document.getElementById('eventClass').value.trim();
    if (!subj || !cls) {
        Swal.fire({ icon: 'info', title: 'Увага', text: 'Заповніть предмет та клас!', confirmButtonColor: '#4F46E5' });
        return;
    }

    const teacher = document.getElementById('eventTeacher').value;
    const color = document.getElementById('eventColor').value;
    const lessonCount = parseInt(document.getElementById('eventCount').value) || 1;

    // Отримуємо тривалість уроку з налаштувань (default 45 хв)
    db.ref('settings/lessonDuration').once('value', snap => {
        const duration = snap.val() || 45;
        const events = [];

        // Рахуємо час першого уроку з форми
        let currentStart = new Date(start);
        let currentEnd = new Date(end);
        const firstDuration = (currentEnd - currentStart) / 60000; // в хвилинах

        for (let i = 0; i < lessonCount; i++) {
            const id = (Date.now() + i * 1000).toString();
            const lessonStart = new Date(currentStart);
            // Перший урок — за часом з форми, наступні — автоматично
            const lessonEnd = (i === 0)
                ? new Date(currentEnd)
                : new Date(currentStart.getTime() + duration * 60000);

            const lessonStartStr = lessonStart.toISOString().replace('.000Z', '').substring(0, 19);
            const lessonEndStr = lessonEnd.toISOString().replace('.000Z', '').substring(0, 19);

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
                    count: 1, type: "lesson",
                    createdAt: Date.now(),
                    creator: sessionStorage.getItem('st_token')
                }
            });

            // Наступний урок починається після кінця попереднього
            currentStart = (i === 0) ? new Date(lessonEnd) : new Date(currentStart.getTime() + duration * 60000);
            currentEnd = new Date(currentStart.getTime() + duration * 60000);
        }

        if (events.length === 0) return;

        Swal.fire({ title: 'Збереження...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // Зберігаємо всі уроки паралельно
        const saves = events.map(ev => db.ref('events/' + ev.id).set(ev));
        Promise.all(saves).then(() => {
            sendTG(`🆕 ${events.length} уроків записано: ${subj} (${cls})\n👨‍🏫 ${teacher}\n📅 ${start.replace('T', ' ')}`);
            selectedSlot = null;
            closeModal();
            Swal.fire({
                icon: 'success',
                title: events.length > 1 ? `${events.length} уроки збережено!` : 'Збережено!',
                showConfirmButton: false,
                timer: 1500
            });
        }).catch(() => Swal.fire('Помилка', 'Не вдалося зберегти дані', 'error'));
    });
};

function saveSingleEvent(data, tgMsg) {
    Swal.fire({ title: 'Збереження...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    db.ref('events/' + data.id).set(data).then(() => {
        sendTG(`🆕 ${tgMsg}`);
        selectedSlot = null;
        closeModal();
        Swal.fire({ icon: 'success', title: 'Збережено!', showConfirmButton: false, timer: 1500 });
    }).catch(() => Swal.fire('Помилка', 'Не вдалося зберегти дані', 'error'));
}

window.applyStatus = () => {
    if (!clickedEvent) return;
    const newStatus = document.getElementById('statusSelect').value;
    const eventId = clickedEvent.id || clickedEvent.extendedProps.id;
    if (!eventId) { Swal.fire('Помилка', 'Не вдалося визначити ID події', 'error'); return; }

    db.ref('events/' + eventId).update({ status: newStatus }).then(() => {
        clickedEvent.setExtendedProp('status', newStatus);

        let newColor = clickedEvent.extendedProps.originalColor || '#4F46E5';
        if (newStatus.includes('Проведено')) newColor = '#10B981';
        if (newStatus.includes('Запізнююсь')) newColor = '#F59E0B';
        if (newStatus.includes('Скасовано')) newColor = '#EF4444';
        if (newStatus.includes('Все за планом')) newColor = clickedEvent.extendedProps.originalColor || '#4F46E5';

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
            db.ref('events/' + eventId).remove().then(() => {
                sendTG(`🗑 Видалено: ${clickedEvent.title}`);
                closeStatusModal();
                Swal.fire({ title: 'Видалено!', icon: 'success', timer: 1500, showConfirmButton: false });
            });
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
        "999": { role: "Викладач", level: "teacher", color: "#10B981" },
        "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
        "777": { role: "Технік", level: "tech", color: "#6B7280" }
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

    if (selectedRole.level === 'admin') {
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

function renderReport() {
    const dateFrom = document.getElementById('reportDateFrom').value;
    const dateTo = document.getElementById('reportDateTo').value;

    let allEvents = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson');

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
            <td>${teacher}</td>
            <td>${e.start.toLocaleDateString()}</td>
            <td>${e.extendedProps.subject}</td>
            <td>${e.extendedProps.className}</td>
            <td>${count}</td>
            <td style="font-size:12px;color:#6B7280;">${authorLabel}</td>
            <td style="border-bottom:1px solid #000;min-width:60px;"></td>
        </tr>`;
    });

    let summaryHtml = `<div style="font-size:13px;color:#6B7280;margin-bottom:12px;">Показано подій: <b>${allEvents.length}</b></div>`;
    summaryHtml += '<h4 style="margin:0 0 10px 0; color:#1F2937;">📅 Підсумок по місяцях:</h4><ul style="padding-left:20px; margin:0 0 15px 0; color:#4B5563;">';
    for (const [m, val] of Object.entries(statsByMonth)) {
        summaryHtml += `<li style="margin-bottom:4px;"><b>${m}:</b> ${val} уроків</li>`;
    }
    summaryHtml += '</ul>';

    if (currentUser && (currentUser.level === 'admin' || currentUser.level === 'tech')) {
        summaryHtml += `<h4 style="margin:0 0 15px 0; color:#1F2937; border-top: 1px dashed #E5E7EB; padding-top: 15px;">📈 Аналітика по викладачах:</h4>`;
        summaryHtml += `<div style="display:flex; flex-wrap:wrap; gap:10px;">`;
        for (let tName in statsByTeacher) {
            let t = statsByTeacher[tName];
            summaryHtml += `
                <div style="background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px 15px; min-width: 150px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    <div style="font-weight: 600; color: #374151; margin-bottom: 8px;">👨‍🏫 ${tName}</div>
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

    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const data = snap.val();
        if (data) Object.values(data).forEach(ev => {
            let finalColor = ev.backgroundColor || '#3B82F6';
            if (ev.extendedProps && ev.extendedProps.status) {
                const status = ev.extendedProps.status;
                if (status.includes('Проведено')) finalColor = '#10B981';
                if (status.includes('Запізнююсь')) finalColor = '#F59E0B';
                if (status.includes('Скасовано')) finalColor = '#EF4444';
            }
            ev.backgroundColor = finalColor;
            ev.borderColor = finalColor;
            if (!ev.extendedProps) ev.extendedProps = {};
            ev.extendedProps.originalColor = ev.backgroundColor;
            calendar.addEvent(ev);
        });
        // Відновлюємо фільтр після оновлення
        if (activeFilter) applyActiveFilter();
    });
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
        if (e.extendedProps.type === 'tech') return;
        e.setProp('display', e.extendedProps.teacher === activeFilter ? 'auto' : 'none');
    });
}

window.closeModal = () => {
    document.getElementById('modalOverlay').style.display = 'none';
    selectedSlot = null;
};

window.closeStatusModal = () => {
    document.getElementById('statusModalOverlay').style.display = 'none';
    clickedEvent = null;
};

window.toggleSidebar = () => {
    const s = document.querySelector('.sidebar');
    s.style.display = (getComputedStyle(s).display === 'none') ? 'block' : 'none';
};

function checkSlotAvailability(teacherName, newStart, newEnd) {
    const events = calendar.getEvents();
    const s = new Date(newStart).getTime();
    const e = new Date(newEnd).getTime();
    for (let ev of events) {
        const evS = ev.start.getTime();
        const evE = ev.end ? ev.end.getTime() : evS;
        if (s < evE && e > evS) {
            if (ev.extendedProps.type === 'tech') return "tech_break";
            if (ev.extendedProps.type === 'lesson' && ev.extendedProps.teacher === teacherName) return "teacher_busy";
        }
    }
    return "available";
}

// ==========================================
// 9. НАЛАШТУВАННЯ — Предмети, Класи, Вчителі
// ==========================================
function initSettingsUI() {
    if (!currentUser || currentUser.level !== 'tech') return;
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

    let events = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson');
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
