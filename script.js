// ==========================================
// 1. КОНФІГУРАЦІЯ
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

try { firebase.initializeApp(firebaseConfig); } catch(e) { console.error(e); }
const db = firebase.database();

// Глобальні змінні
let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEventId = null;
let isCustomSubject = false;
let appSettings = { tgToken: "", tgChatId: "" };

// ==========================================
// 2. ВХІД І АВТОРИЗАЦІЯ
// ==========================================
db.ref('settings').on('value', (snapshot) => {
    const val = snapshot.val();
    if(val) appSettings = val;
});

// ПЕРЕВІРКА ПРИ ЗАВАНТАЖЕННІ СТОРІНКИ (АВТО-ВХІД)
document.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('liceum_token');
    if (savedToken) {
        performLogin(savedToken, true); // true = тихий вхід
    }
});

window.manualLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    if(!pass) return alert("Введіть код!");
    performLogin(pass, false);
};

function performLogin(pass, isAuto) {
    const status = document.getElementById('loginStatus');
    if(!isAuto) status.innerText = "Перевірка...";

    db.ref('users').once('value').then(snapshot => {
        let users = snapshot.val();
        
        if (!users) {
            // Створення дефолтних юзерів, якщо база пуста
            users = {
                "777": { role: "tech", name: "Технік" },
                "888": { role: "admin", name: "Адміністратор" },
                "999": { role: "teacher", name: "Викладач" }
            };
            db.ref('users').set(users);
        }

        if (users[pass]) {
            currentUser = { ...users[pass], id: pass };
            localStorage.setItem('liceum_token', pass); // Зберігаємо токен
            loginSuccess();
        } else {
            if(!isAuto) {
                status.innerText = "❌ Невірний код";
                alert("Невірний код!");
            }
            if(isAuto) localStorage.removeItem('liceum_token'); // Якщо пароль змінився, видаляємо старий
        }
    }).catch(err => {
        if(!isAuto) status.innerText = "Помилка мережі";
        console.error(err);
    });
}

function loginSuccess() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'block';
    
    document.getElementById('roleBadge').innerText = currentUser.name;
    
    const settingsBtn = document.getElementById('settingsBtn');
    const reportBtn = document.getElementById('reportBtn');
    
    // Розподіл прав
    if (currentUser.role === 'tech') {
        settingsBtn.style.display = 'block';
        reportBtn.style.display = 'block';
    } else if (currentUser.role === 'admin') {
        settingsBtn.style.display = 'none';
        reportBtn.style.display = 'block';
    } else {
        settingsBtn.style.display = 'none';
        reportBtn.style.display = 'none';
    }

    setTimeout(initCalendar, 200);
}

window.logout = () => {
    localStorage.removeItem('liceum_token');
    location.reload();
};

// ==========================================
// 3. КАЛЕНДАР
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    const width = window.innerWidth;

    let initialView = 'timeGridWeek';
    let headerRight = 'dayGridMonth,timeGridWeek';
    let myTitleFormat = {};

    if (width < 768) {
        initialView = 'timeGridDay';
        headerRight = 'today';
        myTitleFormat = { month: 'short', day: 'numeric', weekday: 'short' };
    } else if (width >= 768 && width < 1100) {
        initialView = 'timeGridThreeDay';
        headerRight = 'timeGridThreeDay,timeGridWeek';
    }

    calendar = new FullCalendar.Calendar(calendarEl, {
        views: {
            timeGridThreeDay: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 дні' }
        },
        initialView: initialView,
        titleFormat: myTitleFormat,
        headerToolbar: {
            left: 'prev,next',
            center: 'title',
            right: headerRight
        },
        slotMinTime: '08:00:00',
        slotMaxTime: '21:00:00',
        slotDuration: width < 768 ? '01:00:00' : '00:30:00',
        locale: 'uk',
        firstDay: 1,
        allDaySlot: false,
        height: '100%',
        expandRows: true,
        selectable: true,
        editable: true,
        longPressDelay: 0,

        select: function(info) {
            selectedSlot = info;
            clickedEventId = null;
            openModal('eventModalOverlay', 'Створити урок');
        },

        eventClick: function(info) {
            clickedEventId = info.event.id;
            const props = info.event.extendedProps;
            
            const subjects = ['Математика','Укр. мова','Англійська','Історія','Фізика','Хімія','Біологія','Інформатика','Початкова школа','Підготовка до школи','Логопед'];
            
            if(!subjects.includes(props.subject)) {
                 isCustomSubject = true;
                 document.getElementById('eventSubjectSelect').style.display = 'none';
                 document.getElementById('eventSubjectInput').style.display = 'block';
                 document.getElementById('eventSubjectInput').value = props.subject;
            } else {
                 isCustomSubject = false;
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
                            title: data[id].subject,
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
            container.style.fontSize = width < 768 ? '11px' : '12px';
            container.style.lineHeight = '1.1';
            
            let innerHtml = `<b>${p.subject}</b>`;
            if (width >= 768) innerHtml += `<br>${p.sClass}`;
            if(p.status && p.status.includes("Скасовано")) innerHtml = "❌ " + innerHtml;
            
            container.innerHTML = innerHtml;
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
        'Математика': '#EF4444', 
        'Укр. мова': '#F59E0B', 
        'Англійська': '#3B82F6', 
        'Історія': '#8B5CF6'
    };
    return colors[subject] || '#6366F1';
}

function updateEventTime(event) {
    if(currentUser.role === 'teacher') {
        alert("Вчителі не можуть перетягувати. Тільки через редагування.");
        calendar.refetchEvents();
        return;
    }
    db.ref('events/' + event.id).update({
        start: event.start.toISOString(),
        end: event.end.toISOString()
    });
}

// ==========================================
// 4. ФУНКЦІОНАЛ
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
        } else {
            actions.style.display = 'none';
            saveBtn.innerText = "Створити";
            document.getElementById('eventClass').value = "";
            document.getElementById('eventTitle').value = "";
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
        sel.style.display = 'none'; inp.style.display = 'block'; inp.focus();
    } else {
        sel.style.display = 'block'; inp.style.display = 'none';
    }
};

window.saveEvent = () => {
    const sel = document.getElementById('eventSubjectSelect');
    const subject = (sel.style.display === 'none') ? document.getElementById('eventSubjectInput').value : sel.value;
    const sClass = document.getElementById('eventClass').value;
    const title = document.getElementById('eventTitle').value;
    const duration = parseInt(document.getElementById('eventDuration').value);
    const type = document.getElementById('eventType').value;

    if(!subject || !sClass) return alert("Заповніть предмет і клас!");

    let finalSubject = subject;
    let finalStatus = "Заплановано";
    if(type === 'tech') { finalSubject = "tech"; finalStatus = "Технічна перерва"; }

    const eventData = {
        subject: finalSubject,
        sClass, baseTitle: title,
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

window.saveSettings = () => {
    const token = document.getElementById('tgTokenInput').value.trim();
    const chat = document.getElementById('tgChatIdInput').value.trim();
    db.ref('settings').set({ tgToken: token, tgChatId: chat });
    alert("Збережено!");
    closeModal('settingsModal');
};

window.openSettings = () => {
    document.getElementById('tgTokenInput').value = appSettings.tgToken || "";
    document.getElementById('tgChatIdInput').value = appSettings.tgChatId || "";
    openModal('settingsModal');
};

window.updateUserPass = () => {
    const role = document.getElementById('roleSelect').value;
    const code = document.getElementById('newPassInput').value.trim();
    if(code.length < 3) return alert("Мінімум 3 символи");

    db.ref('users').once('value').then(snap => {
        const users = snap.val() || {};
        const updates = {};
        for(let k in users) if(users[k].role === role) updates[k] = null; 
        
        const names = { "teacher": "Викладач", "admin": "Адміністратор", "tech": "Технік" };
        updates[code] = { role: role, name: names[role] };
        
        db.ref('users').update(updates).then(() => {
            alert(`Код оновлено!`);
            document.getElementById('newPassInput').value = "";
        });
    });
};

// --- ЗВІТНІСТЬ (НОВА ФУНКЦІЯ) ---
window.openReport = () => {
    const tableBody = document.getElementById('reportTableBody');
    tableBody.innerHTML = "<tr><td colspan='2'>Завантаження...</td></tr>";
    
    // Завантажуємо всі події
    db.ref('events').once('value').then(snap => {
        const data = snap.val();
        tableBody.innerHTML = "";
        if(!data) {
            tableBody.innerHTML = "<tr><td colspan='2'>Даних немає</td></tr>";
            return;
        }

        const stats = {};
        
        for(let id in data) {
            const ev = data[id];
            // Фільтрація: не рахуємо скасовані та технічні
            if(ev.subject === 'tech' || (ev.status && ev.status.includes("Скасовано"))) continue;
            
            const date = new Date(ev.start);
            // Ключ: Місяць Рік (uk-UA) -> "лютий 2024"
            const key = date.toLocaleString('uk-UA', { month: 'long', year: 'numeric' });
            
            if(!stats[key]) stats[key] = 0;
            stats[key]++;
        }
        
        if(Object.keys(stats).length === 0) {
            tableBody.innerHTML = "<tr><td colspan='2'>Уроків не знайдено</td></tr>";
        } else {
            for(let [month, count] of Object.entries(stats)) {
                tableBody.innerHTML += `
                    <tr>
                        <td style="text-transform: capitalize;">${month}</td>
                        <td style="font-weight:bold; color:#4F46E5;">${count}</td>
                    </tr>
                `;
            }
        }
    });

    openModal('reportModal');
};