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
let tgConfig = null; // Налаштування TG з бази

// ==========================================
// 2. АВТОРИЗАЦІЯ & АВТО-ВХІД
// ==========================================

// Слухаємо оновлення юзерів
db.ref('users').on('value', snap => {
    if (snap.val()) USERS = snap.val();
    checkAutoLogin(); // Перевіряємо вхід після завантаження бази
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
    if (currentUser) return; // Вже ввійшли
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
    document.getElementById('mainApp').style.display = 'grid';
    
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

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
            document.getElementById('startTime').value = info.startStr.split('T')[1].substring(0,5);
            document.getElementById('endTime').value = info.endStr.split('T')[1].substring(0,5);
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        
        eventClick: (info) => {
            clickedEvent = info.event;
            const props = info.event.extendedProps;
            document.getElementById('statusModalOverlay').style.display = 'flex';
            document.getElementById('statusEventTitle').textContent = info.event.title;
            
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
    // 1. Завантаження предметів
    db.ref('settings/subjects').on('value', snap => {
        // Якщо в базі ще нічого немає, даємо базовий масив
        const subjects = snap.val() || ["Математика", "Українська мова", "Англійська мова", "Історія України"]; 
        const list = document.getElementById('subjectsList');
        list.innerHTML = ''; // Очищаємо перед оновленням
        
        subjects.forEach(subj => {
            let option = document.createElement('option');
            option.value = subj;
            list.appendChild(option);
        });
    });

    // 2. Завантаження класів
    db.ref('settings/classes').on('value', snap => {
        // Базовий масив класів, якщо в базі пусто
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
    // Отримуємо час з форми
    const startTimeVal = document.getElementById('startTime').value;
    const endTimeVal = document.getElementById('endTime').value;

    // --- ДОДАНО: 1. Валідація правильного часу ---
    if (startTimeVal >= endTimeVal) {
        Swal.fire({
        icon: 'warning',
        title: 'Некоректний час',
        text: 'Час завершення уроку має бути пізніше за час його початку!',
        confirmButtonColor: '#4F46E5'
    });
        return; // Зупиняємо збереження
    }

    const isBreak = document.getElementById('isTechBreak').checked;
    const id = Date.now().toString();
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = datePart + 'T' + startTimeVal + ':00';
    const end = datePart + 'T' + endTimeVal + ':00';

// --- ДОДАНО: 2. Валідація накладок (Овербукінг) ---
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
            return; // Зупиняємо збереження
        } else if (availabilityStatus === "teacher_busy") {
           Swal.fire({
            icon: 'error',
            title: 'Накладка в розкладі',
            text: `У викладача ${teacherName} вже є заняття у цей часовий проміжок.`,
            confirmButtonColor: '#4F46E5'
        });
            return; // Зупиняємо збереження
        }
    }

    // Далі йде ваш стандартний код формування даних...
    let data = {
        id, start, end,
        extendedProps: { createdAt: Date.now(), creator: sessionStorage.getItem('st_token') }
    };

    if (isBreak) {
        data.title = "⛔ ТЕХНІЧНА ПЕРЕРВА";
        data.backgroundColor = "#6B7280";
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
        
        data.title = `${subj} (${cls})`;
        data.backgroundColor = document.getElementById('eventColor').value;
        data.extendedProps = {
            ...data.extendedProps,
            teacher: document.getElementById('eventTeacher').value, // Тут ми беремо вчителя
            subject: subj, className: cls,
            count: document.getElementById('eventCount').value,
            type: "lesson"
        };
    }

// Показываем спиннер перед отправкой в базу
    Swal.fire({
        title: 'Збереження...',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // Отправляем данные
    db.ref('events/' + id).set(data).then(() => {
        sendTG(`🆕 Запис: ${data.title}\n📅 ${start.replace('T',' ')}`);
        closeModal();
        
        // Показываем сообщение об успехе, которое само исчезнет через 1.5 секунды
        Swal.fire({
            icon: 'success',
            title: 'Збережено!',
            showConfirmButton: false,
            timer: 1500
        });
    }).catch((error) => {
        // На случай ошибки интернета
        Swal.fire('Помилка', 'Не вдалося зберегти дані', 'error');
    });
};

window.applyStatus = () => {
    const newStatus = document.getElementById('eventStatusSelect').value;
    
    // Включаем спиннер
    Swal.fire({
        title: 'Оновлення статусу...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    db.ref('events/' + clickedEvent.id + '/extendedProps/status').set(newStatus).then(() => {
        closeStatusModal();
        Swal.fire({
            title: 'Статус оновлено!',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });
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
            // Запускаем спиннер
            Swal.fire({
                title: 'Видалення...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            // Удаляем из Firebase
            db.ref('events/' + clickedEvent.id).remove().then(() => {
                sendTG(`🗑 Видалено: ${clickedEvent.title}`);
                closeStatusModal();
                
                // Успешное удаление
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
// 5. НАЛАШТУВАННЯ (Збереження в Хмару)
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
    console.log("Починаємо збереження..."); // Перевірка, чи кнопка працює
    
    const tokenElem = document.getElementById('tgToken');
    const chatElem = document.getElementById('tgChatId');

    if (!tokenElem || !chatElem) {
        return alert("Помилка: Не знайдено поля введення в HTML!");
    }

    const token = tokenElem.value.trim();
    const chat = chatElem.value.trim();
    
    console.log("Дані:", token, chat);

    if(!token || !chat) {
        return alert("⚠️ Будь ласка, заповніть обидва поля (Token та Chat ID)!");
    }
    
    // Спробуємо записати
    db.ref('settings_tg').set({
        token: token,
        chatId: chat
    })
    .then(() => {
        console.log("Успіх!");
        alert("✅ Налаштування успішно збережено в Хмару!");
        closeSettings();
    })
    .catch((error) => {
        console.error("Помилка Firebase:", error);
        alert("❌ Помилка запису в базу:\n" + error.message + "\n\nПеревірте вкладку 'Rules' у Firebase!");
    });
};

window.updatePassInDB = () => {
    const newCode = document.getElementById('newPassCode').value.trim();
    const roleKey = document.getElementById('passRoleSelector').value;
    if (newCode.length < 3) return alert("Мінімум 3 цифри!");

    let tempUsers = { ...USERS };
    for (let c in tempUsers) { if (tempUsers[c].level === roleKey) delete tempUsers[c]; }
    
    const roles = {
        "tech": { role: "Технік", level: "tech", color: "#6B7280" },
        "admin": { role: "Адмін", level: "admin", color: "#4F46E5" },
        "teacher": { role: "Викладач", level: "teacher", color: "#10B981" }
    };
    tempUsers[newCode] = roles[roleKey];
    db.ref('users').set(tempUsers).then(() => {
        alert("Пароль оновлено!");
        document.getElementById('newPassCode').value = '';
    });
};

// ==========================================
// 6. ЗВІТНІСТЬ (З ПІДРАХУНКОМ ПО МІСЯЦЯХ)
// ==========================================
window.openReport = () => {
    const events = calendar.getEvents()
        .filter(e => e.extendedProps.type === 'lesson')
        .sort((a, b) => a.start - b.start);

    // Змінні для підрахунку
    const statsByMonth = {};
    const statsByTeacher = {};
    let rows = '';

    events.forEach(e => {
        const count = parseInt(e.extendedProps.count) || 1;
        const teacher = e.extendedProps.teacher || 'Невідомий';
        const status = e.extendedProps.status || '🟢 Все за планом';

        // 1. Підрахунок по місяцях (як у вас і було)
        let mKey = e.start.toLocaleString('uk-UA', { month: 'long', year: 'numeric' });
        mKey = mKey.charAt(0).toUpperCase() + mKey.slice(1);
        if (!statsByMonth[mKey]) statsByMonth[mKey] = 0;
        statsByMonth[mKey] += count;

        // 2. Підрахунок по вчителях та статусах (Нова фішка)
        if (!statsByTeacher[teacher]) {
            statsByTeacher[teacher] = { total: 0, done: 0, late: 0, canceled: 0 };
        }
        statsByTeacher[teacher].total += count;
        if (status.includes('Проведено')) statsByTeacher[teacher].done += count;
        if (status.includes('Запізнююсь')) statsByTeacher[teacher].late += count;
        if (status.includes('Скасовано')) statsByTeacher[teacher].canceled += count;

        // 3. Формування рядків таблиці
        rows += `<tr>
            <td>${teacher}</td>
            <td>${e.start.toLocaleDateString()}</td>
            <td>${e.extendedProps.subject}</td>
            <td>${e.extendedProps.className}</td>
            <td>${count}</td>
            <td style="border-bottom:1px solid #000;"></td>
        </tr>`;
    });

    // Формуємо базовий HTML (Місяці)
    let summaryHtml = '<h4 style="margin:0 0 10px 0; color:#1F2937;">📅 Підсумок по місяцях:</h4><ul style="padding-left:20px; margin:0 0 15px 0; color:#4B5563;">';
    for (const [m, val] of Object.entries(statsByMonth)) {
        summaryHtml += `<li style="margin-bottom:4px;"><b>${m}:</b> ${val} уроків</li>`;
    }
    summaryHtml += '</ul>';

    // Додаємо красиві картки, ТІЛЬКИ якщо це Адмін або Технік
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
                </div>
            `;
        }
        summaryHtml += `</div>`;
    }

    document.getElementById('reportSummary').innerHTML = summaryHtml;
    document.getElementById('reportTableBody').innerHTML = rows;
    document.getElementById('reportOverlay').style.display = 'flex';
};

window.closeReport = () => document.getElementById('reportOverlay').style.display = 'none';

// ==========================================
// 7. ДОПОМІЖНІ
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
            if(ev.extendedProps.status) ev.title = `${ev.extendedProps.status} | ${ev.title}`;
            calendar.addEvent(ev);
        });
    });
}

function sendTG(msg) {
    if (tgConfig && tgConfig.token && tgConfig.chatId) {
        fetch(`https://api.telegram.org/bot${tgConfig.token}/sendMessage?chat_id=${tgConfig.chatId}&text=${encodeURIComponent(msg)}`);
    }
}

window.toggleFilter = (t) => {
    calendar.getEvents().forEach(e => {
        if(e.extendedProps.type === 'tech') return;
        e.setProp('display', (e.extendedProps.teacher === t) ? 'auto' : 'none');
    });
};
window.resetFilters = () => calendar.getEvents().forEach(e => e.setProp('display', 'auto'));

window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.toggleTechBreak = (v) => document.getElementById('bookingFields').style.opacity = v ? '0.2' : '1';
window.toggleSidebar = () => {
    const s = document.querySelector('.sidebar');
    s.style.display = (getComputedStyle(s).display === 'none') ? 'block' : 'none';
};

// Перевірка, чи вільний час (враховує і викладачів, і технічні перерви)
function checkSlotAvailability(teacherName, newStart, newEnd) {
    const events = calendar.getEvents(); 
    const startTimestamp = new Date(newStart).getTime();
    const endTimestamp = new Date(newEnd).getTime();

    for (let ev of events) {
        const evStart = ev.start.getTime();
        const evEnd = ev.end.getTime();

        // Перевіряємо, чи перетинається час
        if (startTimestamp < evEnd && endTimestamp > evStart) {
            if (ev.extendedProps.type === 'tech') {
                return "tech_break"; // Знайдено технічну перерву
            }
            if (ev.extendedProps.type === 'lesson' && ev.extendedProps.teacher === teacherName) {
                return "teacher_busy"; // Цей викладач вже зайнятий
            }
        }
    }
    return "available"; // Час вільний
}
// --- КЕРУВАННЯ ПРЕДМЕТАМИ ТА КЛАСАМИ В НАЛАШТУВАННЯХ ---

function initSettingsUI() {
    // Показуємо цей блок тільки якщо користувач - Технік (або Адмін)
    if (currentUser && (currentUser.level === 'tech' || currentUser.level === 'admin')) {
        document.getElementById('techSettingsBlock').style.display = 'block';

        // Слухаємо та малюємо список предметів
        db.ref('settings/subjects').on('value', snap => {
            const list = snap.val() || [];
            const ul = document.getElementById('settingsSubjectsList');
            ul.innerHTML = list.map((item, index) => `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #eee;">
                    ${item} 
                    <button class="btn btn-danger" style="padding: 2px 6px; font-size: 12px;" onclick="removeSettingItem('subjects', ${index})">❌</button>
                </li>
            `).join('');
        });

        // Слухаємо та малюємо список класів
        db.ref('settings/classes').on('value', snap => {
            const list = snap.val() || [];
            const ul = document.getElementById('settingsClassesList');
            ul.innerHTML = list.map((item, index) => `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #eee;">
                    ${item} 
                    <button class="btn btn-danger" style="padding: 2px 6px; font-size: 12px;" onclick="removeSettingItem('classes', ${index})">❌</button>
                </li>
            `).join('');
        });
    }
}

// Функція додавання нового елемента
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
                // Маленьке сповіщення про успіх
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'Додано!',
                    showConfirmButton: false,
                    timer: 1500
                });
            });
        } else {
            // Красива помилка замість старого alert
            Swal.fire({
                icon: 'error',
                title: 'Помилка',
                text: 'Такий запис вже існує!',
                confirmButtonColor: '#4F46E5'
            });
        }
    });
};

// Функція видалення елемента
window.removeSettingItem = (path, index) => {
    // Красиве підтвердження замість старого confirm
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
// --- ФУНКЦІЯ ЕКСПОРТУ В EXCEL (CSV) ---
window.exportToCSV = () => {
    // Беремо всі уроки з календаря
    const events = calendar.getEvents()
        .filter(e => e.extendedProps.type === 'lesson')
        .sort((a, b) => a.start - b.start);

    // Додаємо специфічний маркер \uFEFF, щоб Excel зрозумів українську мову (UTF-8)
    let csvContent = "\uFEFF"; 
    // Заголовки таблиці (використовуємо крапку з комою, бо Excel в Європі любить її більше)
    csvContent += "Вчитель;Дата;Час;Предмет;Клас;Статус\n"; 

    // Перебираємо уроки і формуємо рядки
    events.forEach(e => {
        const teacher = e.extendedProps.teacher || 'Невідомий';
        const date = e.start.toLocaleDateString();
        const time = e.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const subject = e.extendedProps.subject || '';
        const className = e.extendedProps.className || '';
        // Очищаємо статус від емодзі для чистоти документа (опціонально)
        const status = e.extendedProps.status || 'Все за планом';

        const row = `"${teacher}";"${date}";"${time}";"${subject}";"${className}";"${status}"`;
        csvContent += row + "\n";
    });

    // Створюємо файл і завантажуємо його
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Zvit_Liceum_${new Date().toLocaleDateString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Красиве сповіщення про успіх
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Файл успішно завантажено!',
        showConfirmButton: false,
        timer: 2000
    });
};