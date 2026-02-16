// 1. КОНФІГУРАЦІЯ FIREBASE
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

// Глобальні змінні з вшитими кодами для моментального входу
let USERS = {
    "777": { role: "Технік", level: "tech", color: "#6B7280" },
    "888": { role: "Адмін", level: "admin", color: "#4F46E5" },
    "999": { role: "Викладач", level: "teacher", color: "#10B981" }
};

let currentUser = null;
let calendar = null;
let selectedSlot = null;
let clickedEvent = null;
let activeFilter = null;
let reportChartInstance = null;
let currentTeachersList = [];

// ==========================================
// 2. ВХІД / ВИХІД
// ==========================================
window.tryLogin = () => {
    const pass = document.getElementById('passInput').value.trim();
    if (USERS[pass]) {
        currentUser = USERS[pass];
        sessionStorage.setItem('st_token', pass);
        startApp();
    } else {
        alert("Невірний код!");
    }
};

window.logout = () => {
    sessionStorage.removeItem('st_token');
    location.reload();
};

function startApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('topBar').style.display = 'flex';
    document.getElementById('statusBar').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'grid';
    
    document.getElementById('roleBadge').textContent = currentUser.role;
    document.getElementById('roleBadge').style.background = currentUser.color;

    if (currentUser.level === 'tech') {
        document.getElementById('passwordSettings').style.display = 'block';
    }

    initCalendar();
    syncEvents(); 
}

// ==========================================
// 3. КАЛЕНДАР ТА СИНХРОНІЗАЦІЯ
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
        locale: 'uk',
        slotMinTime: '08:00:00',
        slotMaxTime: '21:00:00',
        selectable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' },
        
        select: (info) => {
            selectedSlot = info;
            document.getElementById('startTimeInput').value = info.startStr.split('T')[1].substring(0,5);
            document.getElementById('endTimeInput').value = info.endStr.split('T')[1].substring(0,5);
            
            // Очищення полів
            document.getElementById('eventSubject').value = '';
            document.getElementById('eventClass').value = '';
            
            const adminOpts = document.getElementById('adminBlockOptions');
            if(adminOpts) adminOpts.style.display = (currentUser.level !== 'teacher') ? 'block' : 'none';
            
            document.getElementById('modalOverlay').style.display = 'flex';
        },

        eventClick: (info) => {
            clickedEvent = info.event;
            document.getElementById('statusEventTitle').textContent = clickedEvent.title;
            document.getElementById('statusModalOverlay').style.display = 'flex';
        }
    });
    calendar.render();
}

function syncEvents() {
    db.ref('events').on('value', (snap) => {
        const events = [];
        const data = snap.val();
        if (data) {
            Object.keys(data).forEach(key => {
                events.push({ id: key, ...data[key] });
            });
        }
        calendar.removeAllEvents();
        calendar.addEvents(events);
        filterEvents();
    });

    db.ref('teachers').on('value', (snap) => {
        currentTeachersList = snap.val() || [];
        renderTeachersUI(currentTeachersList);
    });

    // Підвантажуємо актуальні коди з бази поверх дефолтних
    db.ref('users').on('value', snap => {
        if(snap.val()) USERS = snap.val();
    });
}

// ==========================================
// 4. ЗБЕРЕЖЕННЯ (НОВА ЛОГІКА ПРЕДМЕТ + КЛАС)
// ==========================================
window.confirmBooking = () => {
    const isBlock = document.getElementById('isBlockTime').checked;
    const datePart = selectedSlot.startStr.split('T')[0];
    const start = `${datePart}T${document.getElementById('startTimeInput').value}:00`;
    const end = `${datePart}T${document.getElementById('endTimeInput').value}:00`;
    const eventId = "ev_" + Date.now();

    if (isBlock) {
        db.ref('events/' + eventId).set({
            title: "⛔ ТЕХНІЧНА ПЕРЕРВА", start, end,
            backgroundColor: "#9CA3AF",
            extendedProps: { type: 'block' }
        });
    } else {
        const subject = document.getElementById('eventSubject').value.trim();
        const className = document.getElementById('eventClass').value.trim();
        const teacher = document.getElementById('eventTeacher').value;
        const color = document.getElementById('eventColor').value;

        if (!subject || !className) return alert("Заповніть предмет та клас!");

        const fullTitle = `${subject} (${className})`;

        db.ref('events/' + eventId).set({
            title: fullTitle,
            start, end,
            backgroundColor: color,
            borderColor: color,
            extendedProps: {
                subject,
                className,
                teacher,
                type: 'lesson',
                count: document.getElementById('eventCount').value || 1,
                createdAt: Date.now(),
                creator: sessionStorage.getItem('st_token')
            }
        });
    }
    closeModal();
};

// Допоміжні функції
window.closeModal = () => document.getElementById('modalOverlay').style.display = 'none';
window.closeStatusModal = () => document.getElementById('statusModalOverlay').style.display = 'none';
window.toggleBlockUI = (val) => document.getElementById('bookingFields').style.display = val ? 'none' : 'block';

function renderTeachersUI(list) {
    const select = document.getElementById('eventTeacher');
    const filter = document.getElementById('filterList');
    if(select) select.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('');
    if(filter) filter.innerHTML = list.map(t => `<div class="filter-item" onclick="toggleFilter('${t}')">${t}</div>`).join('');
}

window.addTeacher = () => {
    const name = document.getElementById('newTeacherName').value.trim();
    if(!name) return;
    currentTeachersList.push(name);
    db.ref('teachers').set(currentTeachersList);
    document.getElementById('newTeacherName').value = '';
};

// Запуск при завантаженні
if (sessionStorage.getItem('st_token')) {
    setTimeout(() => {
        const token = sessionStorage.getItem('st_token');
        if(USERS[token]) { currentUser = USERS[token]; startApp(); }
    }, 500);
}