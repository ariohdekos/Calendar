// ==========================================
// 1. КОНФІГУРАЦІЯ (ПЕРЕВІР СВОЇ ДАНІ!)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDZWcQ7INpnZj1Hbf0fICcsPs2Wndus8AM", // <-- ТУТ МАЮТЬ БУТИ ТВОЇ ДАНІ
    authDomain: "liceum-eit-manager.firebaseapp.com",
    databaseURL: "https://liceum-eit-manager-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "liceum-eit-manager",
    storageBucket: "liceum-eit-manager.firebasestorage.app",
    messagingSenderId: "854455059262",
    appId: "1:854455059262:web:e6282bed63182559c5a26f",
    measurementId: "G-NKS31DZ3MK"
};

// Ініціалізація
try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized");
} catch (e) {
    alert("Помилка ініціалізації Firebase: " + e.message);
}
const db = firebase.database();

// Глобальні змінні
let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEventId = null;
let isCustomSubject = false;
let appSettings = { tgToken: "", tgChatId: "" };

// ==========================================
// 2. ВХІД І ПРАВА
// ==========================================

// Завантаження налаштувань
db.ref('settings').on('value', (snapshot) => {
    const val = snapshot.val();
    if(val) appSettings = val;
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    const statusEl = document.getElementById('loginStatus');
    
    if(!pass) {
        statusEl.innerText = "⚠️ Введіть код!";
        return;
    }
    statusEl.innerText = "🔄 Підключення...";

    db.ref('users').once('value')
    .then(snapshot => {
        let users = snapshot.val();
        
        // --- АВТОМАТИЧНЕ СТВОРЕННЯ КОРИСТУВАЧІВ (ЯКЩО БАЗА ПУСТА) ---
        if (!users) {
            console.log("База користувачів пуста. Створюємо стандартних...");
            users = {
                "777": { role: "tech", name: "Технік" },
                "888": { role: "admin", name: "Адміністратор" },
                "999": { role: "teacher", name: "Викладач" }
            };
            db.ref('users').set(users);
        }

        // --- ПЕРЕВІРКА КОДУ ---
        if (users && users[pass]) {
            currentUser = { ...users[pass], id: pass };
            loginSuccess();
        } else {
            statusEl.innerText = "❌ Код не знайдено";
            console.log("Доступні коди:", Object.keys(users)); // Для налагодження (в консолі)
        }
    })
    .catch(error => {
        console.error(error);
        statusEl.innerText = "❌ Помилка з'єднання: " + error.message;
        alert("Перевірте інтернет або Правила (Rules) у Firebase Console!");
    });
};

function loginSuccess() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'block';
    
    document.getElementById('roleBadge').innerText = currentUser.name;
    
    const settingsBtn = document.getElementById('settingsBtn');
    const reportBtn = document.getElementById('reportBtn');

    // Логіка відображення кнопок
    if (currentUser.role === 'tech') {
        settingsBtn.style.display = 'block';
        if(reportBtn) reportBtn.style.display = 'block';
    } else if (currentUser.role === 'admin') {
        settingsBtn.style.display = 'none';
        if(reportBtn) reportBtn.style.display = 'block';
    } else {
        settingsBtn.style.display = 'none';
        if(reportBtn) reportBtn.style.display = 'none';
    }

    setTimeout(initCalendar, 100);
}

window.logout = () => location.reload();

// ==========================================
// 3. НАЛАШТУВАННЯ (ТЕХНІК)
// ==========================================
window.openSettings = () => {
    document.getElementById('tgTokenInput').value = appSettings.tgToken || "";
    document.getElementById('tgChatIdInput').value = appSettings.tgChatId || "";
    openModal('settingsModal');
};

window.saveSettings = () => {
    const token = document.getElementById('tgTokenInput').value.trim();
    const chat = document.getElementById('tgChatIdInput').value.trim();
    db.ref('settings').set({ tgToken: token, tgChatId: chat });
    alert("TG Налаштування збережено!");
    closeModal('settingsModal');
};

// ЗМІНА ПАРОЛІВ
window.updateUserPass = () => {
    const targetRole = document.getElementById('roleSelect').value;
    const newCode = document.getElementById('newPassInput').value.trim();

    if(newCode.length < 3) return alert("Код має бути мінімум 3 символи!");

    db.ref('users').once('value').then(snapshot => {
        const users = snapshot.val() || {};
        const updates = {};
        let oldKey = null;

        // Видаляємо старий код цієї ролі
        for (const [key, user] of Object.entries(users)) {
            if (user.role === targetRole) {
                updates[key] = null;
                oldKey = key;
            }
        }

        // Перевірка на унікальність
        if (users[newCode] && users[newCode].role !== targetRole) {
            return alert(`Цей код (${newCode}) вже зайнятий!`);
        }

        const roleNames = { "teacher": "Викладач", "admin": "Адміністратор", "tech": "Технік" };
        
        updates[newCode] = {
            role: targetRole,
            name: roleNames[targetRole]
        };

        db.ref('users').update(updates).then(() => {
            alert(`✅ Пароль для "${roleNames[targetRole]}" змінено на "${newCode}"`);
            document.getElementById('newPassInput').value = "";
        }).catch(err => alert("Помилка: " + err));
    });
};

// ==========================================
// 4. КАЛЕНДАР
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    const isMobile = window.innerWidth < 768;

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: isMobile ? 'timeGridDay' : 'dayGridMonth,timeGridWeek'
        },
        slotMinTime: '08:00:00',
        slotMaxTime: '21:00:00',
        locale: 'uk',
        firstDay: 1,
        allDaySlot: false,
        height: '100%',
        selectable: true,
        editable: true,
        
        select: function(info) {
            selectedSlot = info;
            clickedEventId = null;
            openModal('eventModalOverlay', 'Створити урок');
        },

        eventClick: function(info) {
            clickedEventId = info.event.id;
            const props = info.event.extendedProps;
            
            // Заповнення полів
            const defaultSubjects = ['Математика','Укр. мова','Англійська','Історія','Фізика','Хімія','Біологія','Інформатика','Початкова школа'];
            
            if(!defaultSubjects.includes(props.subject)) {
                 isCustomSubject = true;
                 // Примусово показуємо input
                 document.getElementById('eventSubjectSelect').style.display = 'none';
                 document.getElementById('eventSubjectInput').style.display = 'block';
                 document.getElementById('eventSubjectInput').value = props.subject;
            } else {
                 isCustomSubject = false;
                 // Примусово показуємо select
                 document.getElementById('eventSubjectSelect').style.display = 'block';
                 document.getElementById('eventSubjectInput').style.display = 'none';
                 document.getElementById('eventSubjectSelect').value = props.subject;
            }

            document.getElementById('eventClass').value = props.sClass;
            document.getElementById('eventTitle').value = props.baseTitle || "";
            
            openModal('eventModalOverlay', 'Редагувати урок', true);
        },

        eventDrop: (info) => updateEventTime(info.event),
        eventResize: (info) => updateEventTime(info.event),

        events: function(info, successCallback) {
            db.ref('events').on('value', snap => {
                const data = snap.val();
                const events = [];
                if(data) {
                    for(let id in data) {
                        events.push({
                            id: id,
                            title: `${data[id].subject} (${data[id].sClass})`,
                            start: data[id].start,
                            end: data[id].end,
                            backgroundColor: getColor(data[id].subject, data[id].status),
                            borderColor: getColor(data[id].subject, data[id].status),
                            extendedProps: data[id]
                        });
                    }
                }
                successCallback(events);
            });
        },
        eventContent: function(arg) {
            const p = arg.event.extendedProps;
            let container = document.createElement('div');
            container.style.fontSize = '11px';
            container.innerHTML = `
                <div style="font-weight:bold">${p.subject}</div>
                <div>${p.sClass}</div>
                ${p.baseTitle ? `<div style="opacity:0.8; font-size:10px">${p.baseTitle}</div>` : ''}
            `;
            return { domNodes: [container] };
        }
    });
    calendar.render();
}

function getColor(subject, status) {
    if (status && status.includes("Скасовано")) return '#9CA3AF';
    if (status && status.includes("Проведено")) return '#10B981';
    if (subject === 'tech') return '#374151';

    const colors = {
        'Математика': '#EF4444', 'Укр. мова': '#F59E0B',
        'Англійська': '#3B82F6', 'Історія': '#8B5CF6',
        'Фізика': '#6366F1', 'Хімія': '#EC4899', 'Біологія': '#14B8A6'
    };
    return colors[subject] || '#6366F1';
}

function updateEventTime(event) {
    if(currentUser.role === 'teacher') {
        alert("Вчителі не можуть перетягувати уроки. Використовуйте редагування.");
        calendar.refetchEvents();
        return;
    }
    db.ref('events/' + event.id).update({
        start: event.start.toISOString(),
        end: event.end.toISOString()
    });
}

// ==========================================
// 5. МОДАЛКИ
// ==========================================
window.openModal = (id, title, isEdit = false) => {
    document.getElementById(id).style.display = 'flex';
    if(title && document.getElementById('modalTitle')) 
        document.getElementById('modalTitle').innerText = title;
    
    if(id === 'eventModalOverlay') {
        const actions = document.getElementById('editActions');
        const saveBtn = document.getElementById('saveBtn');
        if(isEdit) {
            actions.style.display = 'block';
            saveBtn.innerText = "Зберегти зміни";
        } else {
            actions.style.display = 'none';
            saveBtn.innerText = "Створити";
            // Очистка
            document.getElementById('eventClass').value = "";
            document.getElementById('eventTitle').value = "";
            // Скидання на дефолтний предмет
            document.getElementById('eventSubjectSelect').style.display = 'block';
            document.getElementById('eventSubjectInput').style.display = 'none';
            isCustomSubject = false;
        }
    }
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';

window.toggleSubjectMode = () => {
    isCustomSubject = !isCustomSubject;
    const sel = document.getElementById('eventSubjectSelect');
    const inp = document.getElementById('eventSubjectInput');
    
    if(isCustomSubject) {
        sel.style.display = 'none';
        inp.style.display = 'block';
        inp.focus();
    } else {
        sel.style.display = 'block';
        inp.style.display = 'none';
    }
};

window.saveEvent = () => {
    const sel = document.getElementById('eventSubjectSelect');
    const subject = (sel.style.display === 'none') 
        ? document.getElementById('eventSubjectInput').value 
        : sel.value;

    const sClass = document.getElementById('eventClass').value;
    const title = document.getElementById('eventTitle').value;
    const duration = parseInt(document.getElementById('eventDuration').value);
    const type = document.getElementById('eventType').value;

    if(!subject || !sClass) return alert("Заповніть предмет і клас!");

    let finalSubject = subject;
    let finalStatus = "Заплановано";
    
    if(type === 'tech') {
        finalSubject = "tech";
        finalStatus = "Технічна перерва";
    }

    const eventData = {
        subject: finalSubject,
        sClass, 
        baseTitle: title,
        teacher: currentUser.name,
        status: finalStatus
    };

    if(clickedEventId) {
        db.ref('events/' + clickedEventId).update(eventData);
    } else if (selectedSlot) {
        const start = new Date(selectedSlot.startStr);
        const end = new Date(start.getTime() + duration * 60000);
        eventData.start = start.toISOString();
        eventData.end = end.toISOString();
        eventData.createdAt = firebase.database.ServerValue.TIMESTAMP;

        db.ref('events').push(eventData).then(() => {
            if(type !== 'tech') sendTelegramNotification(eventData);
        });
    }
    closeModal('eventModalOverlay');
};

function sendTelegramNotification(eventData) {
    if (!appSettings.tgToken || !appSettings.tgChatId) return;
    const text = `📅 *Новий запис*\n👨‍🏫 ${eventData.teacher}\n📚 ${eventData.subject}\n🎓 ${eventData.sClass}\n🕒 ${new Date(eventData.start).toLocaleString('uk-UA')}`;
    fetch(`https://api.telegram.org/bot${appSettings.tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: appSettings.tgChatId, text: text, parse_mode: 'Markdown' })
    });
}

window.deleteEvent = () => {
    if(confirm("Видалити?")) {
        db.ref('events/' + clickedEventId).remove();
        closeModal('eventModalOverlay');
    }
};

window.updateStatus = (st) => {
    db.ref('events/' + clickedEventId).update({ status: st });
    closeModal('eventModalOverlay');
};

window.openReport = () => {
    alert("Модуль звітності");
};