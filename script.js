// 1. CONFIG
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
// БАГ #7 ВИПРАВЛЕНО: окремий прапор, щоб checkAutoLogin не викликався повторно
let autoLoginChecked = false;

// ==========================================
// 2. АВТОРИЗАЦІЯ & АВТО-ВХІД
// ==========================================

// БАГ #7 ВИПРАВЛЕНО: checkAutoLogin тепер викликається лише один раз
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
        Swal.fire({
            icon: 'error',
            title: 'Помилка!',
            text: 'Невірний код доступу',
            confirmButtonColor: '#4F46E5'
        });
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

window.logout = () => {
    sessionStorage.clear();
    location.reload();
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    // БАГ #3 ВИПРАВЛЕНО: statusBar тепер правильно показується
    document.getElementById('statusBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';

    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    // БАГ #11 ВИПРАВЛЕНО: statusBar отримує осмислений текст
    const statusBar = document.getElementById('statusBar');
    statusBar.textContent = `Ви увійшли як: ${currentUser.role}`;
    statusBar.style.background = currentUser.color;

    // Права доступу
    if (currentUser.level === 'admin' || currentUser.level === 'tech') {
        document.getElementById('reportBtn').style.display = 'block';
    }
    if (currentUser.level === 'tech') {
        document.getElementById('settingsBtn').style.display = 'block';
        document.getElementById('techBlockOption').style.display = 'block';
    }

    if (!calendar) initCalendar();
    loadData();
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
            // БАГ #12 ВИПРАВЛЕНО: скидаємо чекбокс при відкритті модалки
            document.getElementById('isTechBreak').checked = false;
            document.getElementById('bookingFields').style.opacity = '1';
            document.getElementById('modalOverlay').style.display = 'flex';
        },

        eventClick: (info) => {
            clickedEvent = info.event;
            const props = info.event.extendedProps;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;

            // Встановлюємо поточний статус у select
            const currentStatus = props.status || '🟢 Все за планом';
            document.getElementById('statusSelect').value = currentStatus;

            // Логіка видалення (15 хв)
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
            let option = document.createElement('option');
            option.value = subj;
            list.appendChild(option);
        });
    });

    db.ref('settings/classes').on('value', snap => {
        const classes = snap.val() || ["10-А", "10-Б", "11-А", "11-Б", "11-В"];
        const list = document.getElementById('classesList');
        list.innerHTML = '';
        classes.forEach(cls => {
            let option = document.createElement('option');
            option.value = cls;
            list.appendChild(option);
        });
    });
}

// ==========================================
// 4. ОПЕРАЦІЇ З ДАНИМИ
// ==========================================
window.confirmBooking = () => {
    const startTimeVal = document.getElementById('startTime').value;
    const endTimeVal = document.getElementById('endTime').value;

    if (startTimeVal >= endTimeVal) {
        Swal.fire({
            icon: 'warning',
            title: 'Некоректний час',
            text: 'Час завершення уроку має бути пізніше за час його початку!',
            confirmButtonColor: '#4F46E5'
        });
        return;
    }

    const isBreak = document.getElementById('isTechBreak').checked;
    const id = Date.now().toString();
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = datePart + 'T' + startTimeVal + ':00';
    const end = datePart + 'T' + endTimeVal + ':00';

    if (!isBreak) {
        const teacherName = document.getElementById('eventTeacher').value;
        const availabilityStatus = checkSlotAvailability(teacherName, start, end);

        if (availabilityStatus === "tech_break") {
            Swal.fire({
                icon: 'error',
                title: 'Технічна перерва',
                text: 'Запис неможливий: на цей час студія зачинена!',
                confirmButtonColor: '#4F46E5'
            });
            return;
        } else if (availabilityStatus === "teacher_busy") {
            Swal.fire({
                icon: 'error',
                title: 'Накладка в розкладі',
                text: `У викладача ${teacherName} вже є заняття у цей часовий проміжок.`,
                confirmButtonColor: '#4F46E5'
            });
            return;
        }
    }

    // БАГ #4 & #5 ВИПРАВЛЕНО: id передається на верхній рівень для FullCalendar
    let data = {
        id,  // FullCalendar зчитує id саме звідси
        start, end,
        extendedProps: {
            id,  // дублюємо для зручності читання з props
            createdAt: Date.now(),
            creator: sessionStorage.getItem('st_token')
        }
    };

    if (isBreak) {
        data.title = "⛔ ТЕХНІЧНА ПЕРЕРВА";
        data.backgroundColor = "#6B7280";
        data.borderColor = "#6B7280";
        data.extendedProps.type = "tech";
    } else {
        const subj = document.getElementById('eventSubject').value;
        const cls = document.getElementById('eventClass').value;
        if (!subj || !cls) {
            Swal.fire({
                icon: 'info',
                title: 'Увага',
                text: 'Будь ласка, заповніть предмет та клас!',
                confirmButtonColor: '#4F46E5'
            });
            return;
        }

        const color = document.getElementById('eventColor').value;
        data.title = `${subj} (${cls})`;
        data.backgroundColor = color;
        data.borderColor = color;
        data.extendedProps = {
            ...data.extendedProps,
            teacher: document.getElementById('eventTeacher').value,
            subject: subj,
            className: cls,
            count: document.getElementById('eventCount').value,
            type: "lesson"
        };
    }

    Swal.fire({
        title: 'Збереження...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    db.ref('events/' + id).set(data).then(() => {
        sendTG(`🆕 Запис: ${data.title}\n📅 ${start.replace('T', ' ')}`);
        // БАГ #13 ВИПРАВЛЕНО: очищаємо selectedSlot після збереження
        selectedSlot = null;
        closeModal();
        Swal.fire({
            icon: 'success',
            title: 'Збережено!',
            showConfirmButton: false,
            timer: 1500
        });
    }).catch(() => {
        Swal.fire('Помилка', 'Не вдалося зберегти дані', 'error');
    });
};

window.applyStatus = () => {
    if (!clickedEvent) return;

    const statusSelect = document.getElementById('statusSelect');
    if (!statusSelect) return;

    const newStatus = statusSelect.value;
    // БАГ #4 ВИПРАВЛЕНО: отримуємо id з extendedProps якщо потрібно
    const eventId = clickedEvent.id || clickedEvent.extendedProps.id;

    if (!eventId) {
        Swal.fire('Помилка', 'Не вдалося визначити ID події', 'error');
        return;
    }

    db.ref('events/' + eventId).update({ status: newStatus }).then(() => {
        clickedEvent.setExtendedProp('status', newStatus);

        let newColor = clickedEvent.extendedProps.originalColor || clickedEvent.backgroundColor;
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
            const tgMessage = `🔔 ЗМІНА СТАТУСУ УРОКУ\n\n👨‍🏫 Вчитель: ${t}\n📚 Предмет: ${s}\n🎓 Клас: ${c}\n\n🆕 Новий статус: ${newStatus}`;
            fetch(`https://api.telegram.org/bot${tgConfig.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: tgConfig.chatId, text: tgMessage })
            }).catch(e => console.error("Помилка відправки в TG:", e));
        }

        // БАГ #2 ВИПРАВЛЕНО: закриваємо правильний оверлей
        closeStatusModal();

        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `Статус оновлено!`,
            showConfirmButton: false,
            timer: 1500
        });
    }).catch(error => {
        Swal.fire({ icon: 'error', title: 'Помилка бази даних', text: error.message });
    });
};

window.handleDelete = () => {
    Swal.fire({
        title: 'Ви впевнені?',
        text: "Цю дію неможливо скасувати!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'Так, видалити',
        cancelButtonText: 'Скасувати'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'Видалення...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            // БАГ #4 ВИПРАВЛЕНО: отримуємо id з двох місць
            const eventId = clickedEvent.id || clickedEvent.extendedProps.id;
            db.ref('events/' + eventId).remove().then(() => {
                sendTG(`🗑 Видалено: ${clickedEvent.title}`);
                closeStatusModal();
                Swal.fire({
                    title: 'Видалено!',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
            });
        }
    });
};

// ==========================================
// 5. НАЛАШТУВАННЯ
// ==========================================
window.openSettings = () => {
    if (tgConfig) {
        document.getElementById('tgToken').value = tgConfig.token || '';
        document.getElementById('tgChatId').value = tgConfig.chatId || '';
    }
    document.getElementById('settingsModal').style.display = 'flex';
};

window.closeSettings = () => document.getElementById('settingsModal').style.display = 'none';

window.saveSettings = () => {
    const tokenElem = document.getElementById('tgToken');
    const chatElem = document.getElementById('tgChatId');

    if (!tokenElem || !chatElem) {
        return Swal.fire('Помилка', 'Не знайдено поля введення в HTML!', 'error');
    }

    const token = tokenElem.value.trim();
    const chat = chatElem.value.trim();

    if (!token || !chat) {
        return Swal.fire({
            icon: 'warning',
            title: 'Увага',
            text: 'Будь ласка, заповніть обидва поля (Token та Chat ID)!',
            confirmButtonColor: '#4F46E5'
        });
    }

    db.ref('settings_tg').set({ token, chatId: chat })
        .then(() => {
            Swal.fire({
                icon: 'success',
                title: 'Збережено!',
                text: 'Налаштування успішно збережено в хмару.',
                confirmButtonColor: '#4F46E5'
            });
            closeSettings();
        })
        .catch((error) => {
            Swal.fire('Помилка Firebase', error.message, 'error');
        });
};

// БАГ #1 & #8 ВИПРАВЛЕНО: функція changePassword тепер існує і правильно названа
window.changePassword = () => {
    const newCode = document.getElementById('newPassInput').value.trim();
    const roleValue = document.getElementById('roleSelect').value;

    if (newCode.length < 3) {
        return Swal.fire({
            icon: 'warning',
            title: 'Занадто короткий код',
            text: 'Мінімум 3 символи!',
            confirmButtonColor: '#4F46E5'
        });
    }

    // Визначаємо роль за числовим значенням із select
    const roleMap = {
        "999": { role: "Викладач", level: "teacher", color: "#10B981" },
        "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
        "777": { role: "Технік", level: "tech", color: "#6B7280" }
    };
    const selectedRole = roleMap[roleValue];
    if (!selectedRole) return;

    // Видаляємо старий код для цієї ролі, додаємо новий
    let tempUsers = { ...USERS };
    for (let c in tempUsers) {
        if (tempUsers[c].level === selectedRole.level) delete tempUsers[c];
    }
    tempUsers[newCode] = selectedRole;

    db.ref('users').set(tempUsers).then(() => {
        document.getElementById('newPassInput').value = '';
        Swal.fire({
            icon: 'success',
            title: 'Пароль оновлено!',
            showConfirmButton: false,
            timer: 1500
        });
    }).catch(error => {
        Swal.fire('Помилка', error.message, 'error');
    });
};

// ==========================================
// 6. ЗВІТНІСТЬ
// ==========================================
window.openReport = () => {
    const events = calendar.getEvents()
        .filter(e => e.extendedProps.type === 'lesson')
        .sort((a, b) => a.start - b.start);

    const statsByMonth = {};
    const statsByTeacher = {};
    let rows = '';

    events.forEach(e => {
        const count = parseInt(e.extendedProps.count) || 1;
        const teacher = e.extendedProps.teacher || 'Невідомий';
        const status = e.extendedProps.status || '🟢 Все за планом';

        let mKey = e.start.toLocaleString('uk-UA', { month: 'long', year: 'numeric' });
        mKey = mKey.charAt(0).toUpperCase() + mKey.slice(1);
        if (!statsByMonth[mKey]) statsByMonth[mKey] = 0;
        statsByMonth[mKey] += count;

        if (!statsByTeacher[teacher]) {
            statsByTeacher[teacher] = { total: 0, done: 0, late: 0, canceled: 0 };
        }
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
            <td style="border-bottom:1px solid #000;"></td>
        </tr>`;
    });

    let summaryHtml = '<h4 style="margin:0 0 10px 0; color:#1F2937;">📅 Підсумок по місяцях:</h4><ul style="padding-left:20px; margin:0 0 15px 0; color:#4B5563;">';
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
                        <span>Всього заплановано: <b>${t.total}</b></span>
                        <span style="color: #10B981;">✅ Проведено: <b>${t.done}</b></span>
                        ${t.late > 0 ? `<span style="color: #F59E0B;">🏃 Запізнення: <b>${t.late}</b></span>` : ''}
                        ${t.canceled > 0 ? `<span style="color: #EF4444;">❌ Скасовано: <b>${t.canceled}</b></span>` : ''}
                    </div>
                </div>`;
        }
        summaryHtml += `</div>`;
    }

    document.getElementById('reportSummary').innerHTML = summaryHtml;
    document.getElementById('reportTableBody').innerHTML = rows;
    document.getElementById('reportOverlay').style.display = 'flex';
};

window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

// ==========================================
// 7. ЗАВАНТАЖЕННЯ ДАНИХ
// ==========================================
function loadData() {
    db.ref('settings_tg').on('value', snap => { tgConfig = snap.val(); });

    db.ref('teachers').on('value', snap => {
        const list = snap.val() || ["Вчитель 1"];
        document.getElementById('eventTeacher').innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
        document.getElementById('filterList').innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
    });

    db.ref('events').on('value', snap => {
        calendar.removeAllEvents();
        const data = snap.val();
        if (data) Object.values(data).forEach(ev => {

            // БАГ #6 ВИПРАВЛЕНО: статус впливає лише на колір, не мутує title в пам'яті
            let finalColor = ev.backgroundColor || '#3B82F6';

            if (ev.extendedProps && ev.extendedProps.status) {
                const status = ev.extendedProps.status;
                if (status.includes('Проведено')) finalColor = '#10B981';
                if (status.includes('Запізнююсь')) finalColor = '#F59E0B';
                if (status.includes('Скасовано')) finalColor = '#EF4444';
            }

            ev.backgroundColor = finalColor;
            ev.borderColor = finalColor;

            // Зберігаємо оригінальний колір для скидання статусу
            if (!ev.extendedProps) ev.extendedProps = {};
            ev.extendedProps.originalColor = ev.backgroundColor;

            calendar.addEvent(ev);
        });
    });
}

function sendTG(msg) {
    if (tgConfig && tgConfig.token && tgConfig.chatId) {
        fetch(`https://api.telegram.org/bot${tgConfig.token}/sendMessage?chat_id=${tgConfig.chatId}&text=${encodeURIComponent(msg)}`);
    }
}

// БАГ #9 ВИПРАВЛЕНО: фільтр зберігає стан і застосовується після оновлення
let activeFilter = null;

window.toggleFilter = (t) => {
    activeFilter = t;
    applyActiveFilter();
    // Позначаємо активний елемент
    document.querySelectorAll('.filter-item').forEach(el => {
        el.classList.toggle('active', el.textContent === t);
    });
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
        e.setProp('display', (e.extendedProps.teacher === activeFilter) ? 'auto' : 'none');
    });
}

window.closeModal = () => {
    document.getElementById('modalOverlay').style.display = 'none';
    // БАГ #13 ВИПРАВЛЕНО: очищаємо selectedSlot при закритті
    selectedSlot = null;
};

window.closeStatusModal = () => {
    document.getElementById('statusModalOverlay').style.display = 'none';
    clickedEvent = null;
};

window.toggleTechBreak = (v) => document.getElementById('bookingFields').style.opacity = v ? '0.2' : '1';

window.toggleSidebar = () => {
    const s = document.querySelector('.sidebar');
    s.style.display = (getComputedStyle(s).display === 'none') ? 'block' : 'none';
};

function checkSlotAvailability(teacherName, newStart, newEnd) {
    const events = calendar.getEvents();
    const startTimestamp = new Date(newStart).getTime();
    const endTimestamp = new Date(newEnd).getTime();

    for (let ev of events) {
        const evStart = ev.start.getTime();
        const evEnd = ev.end ? ev.end.getTime() : evStart;

        if (startTimestamp < evEnd && endTimestamp > evStart) {
            if (ev.extendedProps.type === 'tech') return "tech_break";
            if (ev.extendedProps.type === 'lesson' && ev.extendedProps.teacher === teacherName) return "teacher_busy";
        }
    }
    return "available";
}

// ==========================================
// 8. НАЛАШТУВАННЯ ПРЕДМЕТІВ І КЛАСІВ
// ==========================================
function initSettingsUI() {
    if (currentUser && (currentUser.level === 'tech' || currentUser.level === 'admin')) {
        document.getElementById('techSettingsBlock').style.display = 'block';

        db.ref('settings/subjects').on('value', snap => {
            const list = snap.val() || [];
            const ul = document.getElementById('settingsSubjectsList');
            ul.innerHTML = list.map((item, index) => `
                <li>
                    ${item}
                    <button class="btn btn-danger" onclick="removeSettingItem('subjects', ${index})">❌</button>
                </li>`).join('');
        });

        db.ref('settings/classes').on('value', snap => {
            const list = snap.val() || [];
            const ul = document.getElementById('settingsClassesList');
            ul.innerHTML = list.map((item, index) => `
                <li>
                    ${item}
                    <button class="btn btn-danger" onclick="removeSettingItem('classes', ${index})">❌</button>
                </li>`).join('');
        });
    }
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
        title: 'Видалити запис?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'Так, видалити',
        cancelButtonText: 'Скасувати'
    }).then((result) => {
        if (result.isConfirmed) {
            db.ref(`settings/${path}`).once('value', snap => {
                let list = snap.val() || [];
                list.splice(index, 1);
                db.ref(`settings/${path}`).set(list);
            });
        }
    });
};

// ==========================================
// 9. ЕКСПОРТ В CSV
// ==========================================
window.exportToCSV = () => {
    const events = calendar.getEvents()
        .filter(e => e.extendedProps.type === 'lesson')
        .sort((a, b) => a.start - b.start);

    let csvContent = "\uFEFF";
    // БАГ #10 ВИПРАВЛЕНО: додано колонку "Уроків" в CSV
    csvContent += "Вчитель;Дата;Час;Предмет;Клас;Уроків;Статус\n";

    events.forEach(e => {
        const teacher = e.extendedProps.teacher || 'Невідомий';
        const date = e.start.toLocaleDateString();
        const time = e.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const subject = e.extendedProps.subject || '';
        const className = e.extendedProps.className || '';
        // БАГ #10 ВИПРАВЛЕНО: count тепер є в CSV
        const count = e.extendedProps.count || 1;
        const status = e.extendedProps.status || 'Все за планом';

        csvContent += `"${teacher}";"${date}";"${time}";"${subject}";"${className}";"${count}";"${status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `Zvit_Liceum_${new Date().toLocaleDateString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Файл успішно завантажено!', showConfirmButton: false, timer: 2000 });
};
