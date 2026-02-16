// Конфігурація та ініціалізація Firebase (залиште свій apiKey)
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

let USERS = {};
let currentUser = null;
let calendar = null;
let selectedSlot = null;

// Завантаження налаштувань та кодів
db.ref('settings').on('value', snap => {
    const data = snap.val() || {};
    USERS = data.accessCodes || {
        "777": { role: "Технік", level: "tech", color: "#6B7280" },
        "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
        "999": { role: "Викладач", level: "teacher", color: "#10B981" }
    };
    document.getElementById('tgToken').value = data.tgToken || "";
    document.getElementById('tgChatId').value = data.tgChatId || "";
});

window.tryLogin = () => {
    const pass = document.getElementById('passInput').value;
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else alert("Невірний код");
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('statusBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    document.getElementById('roleBadge').textContent = currentUser.role;

    if (currentUser.level === 'admin' || currentUser.level === 'tech') document.getElementById('reportBtn').style.display = 'block';
    if (currentUser.level === 'tech') {
        document.getElementById('settingsBtn').style.display = 'block';
        document.getElementById('techBlockOption').style.display = 'block';
    }

    initCalendar();
    loadData();
}

function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk', 
        slotMinTime: '08:00:00', slotMaxTime: '21:00:00',
        selectable: true,
        select: (info) => {
            selectedSlot = info;
            // Автозаповнення часу з календаря
            document.getElementById('startTime').value = info.startStr.split('T')[1].substring(0,5);
            document.getElementById('endTime').value = info.endStr.split('T')[1].substring(0,5);
            document.getElementById('modalOverlay').style.display = 'flex';
        },
        eventClick: (info) => {
            // Логіка статусів та видалення (з попередньої версії)
        }
    });
    calendar.render();
}

window.confirmBooking = () => {
    const id = Date.now().toString();
    const isBreak = document.getElementById('isTechBreak').checked;
    
    // Ручний час
    const datePart = selectedSlot.startStr.split('T')[0];
    const sTime = document.getElementById('startTime').value;
    const eTime = document.getElementById('endTime').value;

    let eventData = {
        id, 
        start: `${datePart}T${sTime}:00`, 
        end: `${datePart}T${eTime}:00`,
        extendedProps: { createdAt: Date.now(), creator: sessionStorage.getItem('st_token') }
    };

    if (isBreak) {
        eventData.title = "🛠 ТЕХНІЧНА ПЕРЕРВА";
        eventData.color = "#6B7280";
        eventData.extendedProps.type = "tech";
    } else {
        const subj = document.getElementById('eventSubject').value;
        const cls = document.getElementById('eventName').value;
        if (!subj || !cls) return alert("Впишіть предмет та клас!");

        eventData.title = `${subj} (${cls})`;
        eventData.extendedProps = {
            ...eventData.extendedProps,
            type: 'lesson',
            subject: subj,
            className: cls,
            teacher: document.getElementById('eventTeacher').value,
            count: document.getElementById('eventCount').value || 1
        };
    }

    db.ref('events/' + id).set(eventData);
    closeModal();
};

window.openReport = () => {
    const events = calendar.getEvents().filter(e => e.extendedProps.type === 'lesson');
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = events.map(e => `
        <tr>
            <td style="border:1px solid black; padding:8px;">${e.extendedProps.teacher}</td>
            <td style="border:1px solid black; padding:8px;">${new Date(e.start).toLocaleDateString('uk-UA')}</td>
            <td style="border:1px solid black; padding:8px;">${e.extendedProps.subject}</td>
            <td style="border:1px solid black; padding:8px;">${e.extendedProps.className}</td>
            <td style="border:1px solid black; padding:8px; text-align:center;">${e.extendedProps.count}</td>
            <td style="border:1px solid black; width:100px;"></td>
        </tr>
    `).join('');
    document.getElementById('reportOverlay').style.display = 'flex';
};

// ... Решта функцій (loadData, saveSettings, updatePassInDB) залишаються без змін