import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';

const CONFIG = {
  firebase: {
    apiKey: "AIzaSyACqmiKFVEbm-P1tCVmYXl-B5a-wum2XPQ",
    authDomain: "aniversario-dcdd8.firebaseapp.com",
    projectId: "aniversario-dcdd8",
    storageBucket: "aniversario-dcdd8.firebasestorage.app",
    messagingSenderId: "848233635514",
    appId: "1:848233635514:web:352f8de44f58ca86f7ec83"
  },
  notification: {
    timing: '1-day',
    sendTime: '09:00'
  }
};

const app = initializeApp(CONFIG.firebase);
const db = getFirestore(app);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const q = query(collection(db, 'birthdays'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const birthdays = [];
    querySnapshot.forEach((doc) => {
      birthdays.push({ id: doc.id, ...doc.data() });
    });

    const notificationQueue = birthdays.filter(birthday => {
      return shouldSendNotification(birthday, CONFIG.notification.timing);
    });

    return res.status(200).json({
      success: true,
      currentTime: new Date().toLocaleTimeString('pt-BR'),
      scheduledTime: CONFIG.notification.sendTime,
      timing: CONFIG.notification.timing,
      totalBirthdays: birthdays.length,
      inQueue: notificationQueue.length,
      queue: notificationQueue.map(b => ({
        graduation: b.graduation,
        name: b.name,
        age: calculateAge(b.date) + 1,
        relationship: b.relationship,
        unit: b.unit
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

function shouldSendNotification(birthday, timing) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const currentYear = today.getFullYear();
  const birthdayDate = new Date(birthday.date + 'T00:00:00');
  birthdayDate.setFullYear(currentYear);
  
  if (birthdayDate < today) {
    birthdayDate.setFullYear(currentYear + 1);
  }

  let notificationDate = new Date(birthdayDate);
  
  switch(timing) {
    case 'same-day': break;
    case '1-day': notificationDate.setDate(notificationDate.getDate() - 1); break;
    case '2-days': notificationDate.setDate(notificationDate.getDate() - 2); break;
    case '3-days': notificationDate.setDate(notificationDate.getDate() - 3); break;
    case '1-week': notificationDate.setDate(notificationDate.getDate() - 7); break;
    default: notificationDate.setDate(notificationDate.getDate() - 1);
  }

  const timeDiff = notificationDate.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  return daysDiff === 0;
}

function calculateAge(dateString) {
  const today = new Date();
  const birthDate = new Date(dateString + 'T00:00:00');
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age > 0 ? age : 0;
}