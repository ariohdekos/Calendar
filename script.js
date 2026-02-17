// ==========================================
// 1. КОНФІГУРАЦІЯ (ВСТАВТЕ СВОЇ ДАНІ!)
// ==========================================
const firebaseConfig = {
   apiKey: "AIzaSyDZWcQ7INpnZj1Hbf0fICcsPs2Wndus8AM",
  authDomain: "liceum-eit-manager.firebaseapp.com",
  databaseURL: "https://liceum-eit-manager-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "liceum-eit-manager",
  storageBucket: "liceum-eit-manager.firebasestorage.app",
  messagingSenderId: "854455059262",
  appId: "1:854455059262:web:e6282bed63182559c5a26f",
  measurementId: "G-NKS31DZ3MK"
};

// Ініціалізація
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Глобальні змінні
let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEventId = null;
let isCustomSubject = false;
let appSettings = { tgToken: "", tgChatId: "" };

// ==========================================
// 2. ВХІД ТА РОЗПОДІЛ ПРАВ
// ==========================================

// Завантаження налаштувань
db.ref('settings').on('value', (snapshot) => {
    const val = snapshot.val();
    if(val) appSettings = val;
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    const statusEl = document.getElementById('loginStatus');
    
    if(!pass) return alert("Введіть код!");
    statusEl.innerText = "Перевірка...";

    db.ref('users').once('value').then(snapshot => {
        let users = snapshot.val();

        // 1. Якщо база користувачів пуста - створюємо стандартних
        if (!users) {
            users = {
                "777": { role: "tech", name: "Технік" },
                "888": { role: "admin", name: "Адміністратор" },
                "999": { role: "teacher", name: "Викладач" }
            };
            db.ref('users').set(users);
        }

        // 2. Перевірка коду
        if (users[pass]) {
            currentUser = { ...users[pass], id: pass };
            loginSuccess();
        } else {
            statusEl.innerText = "❌ Невірний код";
            alert("Код не знайдено!");
        }
    });
};

function loginSuccess() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'block';
    
    document.getElementById('roleBadge').innerText = currentUser.name;
    
    // --- РОЗПОДІЛ ПРАВ ---
    const settingsBtn = document.getElementById('settingsBtn');
    const reportBtn = document.getElementById('reportBtn'); // Якщо додали кнопку звіту
    
    // 1. ТЕХНІК (777): Бачить все
    if (currentUser.role === 'tech') {
        settingsBtn.style.display = 'block';
        if(reportBtn) reportBtn.style.display = 'block';
    } 
    // 2. АДМІН (888): Бачить звіт, але НЕ налаштування
    else if (currentUser.role === 'admin') {
        settingsBtn.style.display = 'none'; // Ховаємо налаштування
        if(reportBtn) reportBtn.style.display = 'block';
    } 
    // 3. ВИКЛАДАЧ (999): Не бачить нічого зайвого
    else {
        settingsBtn.style.display = 'none';
        if(reportBtn) reportBtn.style.display = 'none';
    }

    // Запускаємо календар
    setTimeout(initCalendar, 100);
}

window.logout = () => {
    location.reload();
};

// ==========================================
// 3. КАЛЕНДАР
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

        // СТВОРЕННЯ
        select: function(info) {
            selectedSlot = info;
            clickedEventId = null;
            openModal('eventModalOverlay', 'Створити урок');
        },

        // РЕДАГУВАННЯ
        eventClick: function(info) {
            clickedEventId = info.event.id;
            const props = info.event.extendedProps;
            
            // Заповнення полів
            document.getElementById('eventSubjectSelect').value = props.subject || "Інше";
            if(!['Математика','Укр. мова','Англійська','Історія','Фізика','Хімія','Біологія','Інформатика'].includes(props.subject)){
                 // Якщо предмет кастомний
                 isCustomSubject = true;
                 toggleSubjectMode();
                 document.getElementById('eventSubjectInput').value = props.subject;
            }

            document.getElementById('eventClass').value = props.sClass;
            document.getElementById('eventTitle').value = props.baseTitle || "";
            
            // Права на редагування/видалення
            // Технік/Адмін можуть все. Вчитель - тільки своє і тільки 15 хв.
            const isOwner = props.teacher === currentUser.name;
            const createdTime = new Date(props.start).getTime(); // Спрощено, краще брати createdAt
            // Тут можна додати логіку 15 хвилин, якщо треба

            openModal('eventModalOverlay', 'Редагувати урок', true);
        },

        eventDrop: (info) => updateEventTime(info.event),
        eventResize: (info) => updateEventTime(info.event),

        events: function(info, successCallback) {
            db.ref('events').on('value', snap => {
                const data = snap.val();
                const events = [];
                for(let id in data) {
                    // Фільтрація: Технік бачить все, Адмін все, Вчитель все
                    // Але можна додати фільтр, якщо треба
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
                successCallback(events);
            });
        }
    });
    calendar.render();
}

function getColor(subject, status) {
    if (status && status.includes("Скасовано")) return '#9CA3AF'; // Сірий для скасованих
    if (status && status.includes("Проведено")) return '#10B981'; // Зелений галочка
    
    const colors = {
        'Математика': '#EF4444',
        'Укр. мова': '#F59E0B',
        'Англійська': '#3B82F6',
        'Історія': '#8B5CF6',
        'tech': '#374151' // Тех. перерва темна
    };
    return colors[subject] || '#6366F1';
}

function updateEventTime(event) {
    // Тільки адмін і технік можуть рухати будь-що
    if(currentUser.role === 'teacher') {
        alert("Вчитель не може перетягувати уроки. Будь ласка, змініть час через редагування.");
        calendar.refetchEvents(); // Повернути назад
        return;
    }
    db.ref('events/' + event.id).update({
        start: event.event.start.toISOString(),
        end: event.event.end.toISOString()
    });
}

// ==========================================
// 4. UI ТА ФУНКЦІОНАЛ
// ==========================================
window.openModal = (id, title, isEdit = false) => {
    document.getElementById(id).style.display = 'flex';
    if(title) document.getElementById('modalTitle').innerText = title;
    
    if(id === 'eventModalOverlay') {
        const actions = document.getElementById('editActions');
        const saveBtn = document.getElementById('saveBtn');
        
        if(isEdit) {
            actions.style.display = 'block';
            saveBtn.innerText = "Зберегти зміни";
            
            // Ховаємо кнопку видалення для вчителів (або додаємо логіку 15 хв)
            // Для спрощення тут дозволяємо, але в реалі треба перевірку
        } else {
            actions.style.display = 'none';
            saveBtn.innerText = "Створити";
            document.getElementById('eventClass').value = "";
            document.getElementById('eventTitle').value = "";
        }
    }
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';

window.toggleSubjectMode = () => {
    isCustomSubject = !isCustomSubject;
    const sel = document.getElementById('eventSubjectSelect');
    const inp = document.getElementById('eventSubjectInput');
    if(isCustomSubject) { sel.style.display='none'; inp.style.display='block'; inp.focus(); }
    else { sel.style.display='block'; inp.style.display='none'; }
};

window.saveEvent = () => {
    const subject = isCustomSubject 
        ? document.getElementById('eventSubjectInput').value 
        : document.getElementById('eventSubjectSelect').value;
    const sClass = document.getElementById('eventClass').value;
    const title = document.getElementById('eventTitle').value;
    const duration = parseInt(document.getElementById('eventDuration').value);
    const type = document.getElementById('eventType').value;

    if(!subject || !sClass) return alert("Заповніть предмет і клас!");

    // Якщо це тех. перерва
    let finalSubject = subject;
    let finalStatus = "Заплановано";
    
    if(type === 'tech') {
        finalSubject = "tech"; // Спеціальний маркер
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
        // Оновлення
        db.ref('events/' + clickedEventId).update(eventData);
    } else if (selectedSlot) {
        // Створення
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

    const text = `📅 *Новий запис*\n👨‍🏫 ${eventData.teacher}\n📚 ${eventData.subject}\n🎓 ${eventData.sClass}\n🕒 ${new Date(eventData.start).toLocaleString('uk-UA', {hour:'2-digit', minute:'2-digit', day:'numeric', month:'numeric'})}`;
    
    fetch(`https://api.telegram.org/bot${appSettings.tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: appSettings.tgChatId, text: text, parse_mode: 'Markdown' })
    });
}

// ==========================================
// 5. НАЛАШТУВАННЯ (ТІЛЬКИ ДЛЯ 777)
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
    alert("Збережено!");
    closeModal('settingsModal');
};

window.updateUserPass = () => {
    const role = document.getElementById('roleSelect').value;
    const newCode = document.getElementById('newPassInput').value.trim();
    if(newCode.length < 3) return alert("Код закороткий");

    const names = { "teacher": "Викладач", "admin": "Адміністратор" };
    
    db.ref('users/' + newCode).set({
        role: role,
        name: names[role]
    });
    alert(`Код ${newCode} додано для ролі ${names[role]}`);
};

// Видалення / Статус
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

// Звітність (проста версія)
window.openReport = () => {
    alert("Тут буде вікно звітності (функціонал можна взяти з попередніх версій)");
};