// 📁 api/cron-scheduler.js - SCHEDULER AUTOMÁTICO PRINCIPAL
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import twilio from 'twilio';

// ⚙️ CONFIGURAÇÃO (pode usar env vars em produção)
const CONFIG = {
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyACqmiKFVEbm-P1tCVmYXl-B5a-wum2XPQ",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "aniversario-dcdd8.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "aniversario-dcdd8",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "aniversario-dcdd8.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "848233635514",
    appId: process.env.FIREBASE_APP_ID || "1:848233635514:web:352f8de44f58ca86f7ec83"
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACbdbb222bea4e9a291bf7b7fe53ed07c1',
    authToken: process.env.TWILIO_AUTH_TOKEN || 'b557d3dac419358af345f941f6449e93',
    fromNumber: process.env.TWILIO_FROM || 'whatsapp:+14155238886',
    toNumber: process.env.TWILIO_TO || '+557181478028'
  },
  notification: {
    timing: process.env.NOTIFICATION_TIMING || '1-day',
    sendTime: process.env.NOTIFICATION_TIME || '09:00',
    enabled: process.env.NOTIFICATIONS_ENABLED !== 'false'
  }
};

// 🔥 Inicializar Firebase
const app = initializeApp(CONFIG.firebase);
const db = getFirestore(app);

// 📱 Inicializar Twilio
const client = twilio(CONFIG.twilio.accountSid, CONFIG.twilio.authToken);

// 🚀 HANDLER PRINCIPAL - EXECUTADO PELO CRON
export default async function handler(req, res) {
  const executionStart = new Date();
  const logPrefix = `[${executionStart.toISOString()}]`;
  
  console.log(`${logPrefix} 🤖 CRON SCHEDULER INICIADO`);
  
  // Configurar CORS para frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // 📊 VERIFICAR SE NOTIFICAÇÕES ESTÃO HABILITADAS
    if (!CONFIG.notification.enabled) {
      console.log(`${logPrefix} 📴 Notificações desabilitadas via config`);
      return res.status(200).json({ 
        success: true, 
        message: 'Notificações desabilitadas',
        enabled: false,
        timestamp: executionStart.toISOString()
      });
    }

    // ⏰ VERIFICAR HORÁRIO ATUAL (Fuso: America/Sao_Paulo)
    const now = new Date();
    const brasiliaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    
    const currentTime = brasiliaTime.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
    
    const scheduledTime = CONFIG.notification.sendTime;
    
    console.log(`${logPrefix} ⏰ Horário Brasília: ${currentTime}, Programado: ${scheduledTime}`);
    
    // 🎯 VERIFICAR SE ESTÁ NO HORÁRIO CORRETO (±30 min para cron jobs)
    const [schedHour, schedMinute] = scheduledTime.split(':').map(Number);
    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();
    
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const scheduledTotalMinutes = schedHour * 60 + schedMinute;
    const diffMinutes = Math.abs(currentTotalMinutes - scheduledTotalMinutes);
    
    console.log(`${logPrefix} 📊 Diferença de horário: ${diffMinutes} minutos`);
    
    // Se não está próximo do horário, apenas registra e sai
    if (diffMinutes > 30) {
      console.log(`${logPrefix} ⏰ Fora do horário programado. Aguardando...`);
      return res.status(200).json({ 
        success: true, 
        message: `Aguardando horário programado (${scheduledTime})`,
        currentTime,
        scheduledTime,
        diffMinutes,
        status: 'waiting',
        nextCheck: new Date(now.getTime() + 3600000).toISOString() // +1 hora
      });
    }

    // 📋 CARREGAR ANIVERSÁRIOS DO FIREBASE
    console.log(`${logPrefix} 📋 Carregando aniversários do Firebase...`);
    
    const q = query(collection(db, 'birthdays'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const birthdays = [];
    querySnapshot.forEach((doc) => {
      birthdays.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`${logPrefix} 📊 Total de aniversários carregados: ${birthdays.length}`);

    // 🔍 FILTRAR ANIVERSÁRIOS QUE DEVEM SER NOTIFICADOS HOJE
    const notificationQueue = birthdays.filter(birthday => {
      return shouldSendNotification(birthday, CONFIG.notification.timing);
    });

    console.log(`${logPrefix} 🎂 Aniversários na fila: ${notificationQueue.length}`);

    // Se não há nada na fila, registra e sai
    if (notificationQueue.length === 0) {
      console.log(`${logPrefix} ℹ️ Nenhuma notificação para enviar hoje`);
      return res.status(200).json({ 
        success: true, 
        message: 'Nenhuma notificação para enviar',
        currentTime,
        scheduledTime,
        checked: birthdays.length,
        queue: 0,
        status: 'no_notifications',
        timestamp: executionStart.toISOString()
      });
    }

    // 🚀 ENVIAR MENSAGENS WHATSAPP
    console.log(`${logPrefix} 📱 Iniciando envio de ${notificationQueue.length} mensagem(s)...`);
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < notificationQueue.length; i++) {
      const birthday = notificationQueue[i];
      const startTime = new Date();
      
      try {
        console.log(`${logPrefix} 📤 Enviando para: ${birthday.graduation} ${birthday.name}`);
        
        // Criar mensagem personalizada
        const message = createWhatsAppMessage(birthday, CONFIG.notification.timing);
        
        // Enviar via Twilio
        const result = await client.messages.create({
          from: CONFIG.twilio.fromNumber,
          to: CONFIG.twilio.toNumber,
          body: message
        });

        const endTime = new Date();
        const duration = endTime - startTime;

        results.push({
          birthday: `${birthday.graduation} ${birthday.name}`,
          age: calculateAge(birthday.date) + 1,
          relationship: birthday.relationship,
          unit: birthday.unit || '',
          status: 'success',
          sid: result.sid,
          price: result.price || '0.0000',
          duration: `${duration}ms`,
          timestamp: endTime.toISOString()
        });

        successCount++;
        console.log(`${logPrefix} ✅ Enviado: ${birthday.graduation} ${birthday.name} (SID: ${result.sid})`);
        
        // Aguardar 2 segundos entre envios para evitar rate limit
        if (i < notificationQueue.length - 1) {
          console.log(`${logPrefix} ⏳ Aguardando 2s antes do próximo envio...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        const endTime = new Date();
        const duration = endTime - startTime;
        
        results.push({
          birthday: `${birthday.graduation} ${birthday.name}`,
          age: calculateAge(birthday.date) + 1,
          relationship: birthday.relationship,
          unit: birthday.unit || '',
          status: 'error',
          error: error.message,
          code: error.code || 'UNKNOWN',
          duration: `${duration}ms`,
          timestamp: endTime.toISOString()
        });
        
        errorCount++;
        console.error(`${logPrefix} ❌ Erro ao enviar para ${birthday.graduation} ${birthday.name}:`, error.message);
      }
    }

    const executionEnd = new Date();
    const totalDuration = executionEnd - executionStart;
    const successRate = ((successCount / notificationQueue.length) * 100).toFixed(1);

    console.log(`${logPrefix} 📊 RELATÓRIO FINAL:`);
    console.log(`${logPrefix} ✅ Sucessos: ${successCount}`);
    console.log(`${logPrefix} ❌ Erros: ${errorCount}`);
    console.log(`${logPrefix} 📈 Taxa de sucesso: ${successRate}%`);
    console.log(`${logPrefix} ⏱️ Duração total: ${totalDuration}ms`);

    // 💾 SALVAR LOG DA EXECUÇÃO (opcional)
    const executionLog = {
      timestamp: executionStart.toISOString(),
      currentTime,
      scheduledTime,
      timing: CONFIG.notification.timing,
      totalBirthdays: birthdays.length,
      queueSize: notificationQueue.length,
      successCount,
      errorCount,
      successRate: parseFloat(successRate),
      duration: totalDuration,
      results,
      config: {
        timing: CONFIG.notification.timing,
        sendTime: CONFIG.notification.sendTime,
        toNumber: CONFIG.twilio.toNumber
      }
    };

    console.log(`${logPrefix} 🎉 EXECUÇÃO AUTOMÁTICA CONCLUÍDA COM SUCESSO!`);

    return res.status(200).json({
      success: true,
      message: `Processamento concluído: ${successCount}/${notificationQueue.length} enviados`,
      ...executionLog,
      status: 'completed'
    });

  } catch (error) {
    const executionEnd = new Date();
    const totalDuration = executionEnd - executionStart;
    
    console.error(`${logPrefix} ❌ ERRO CRÍTICO NO CRON SCHEDULER:`, error);
    console.error(`${logPrefix} Stack trace:`, error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN',
      duration: totalDuration,
      timestamp: executionStart.toISOString(),
      status: 'error'
    });
  }
}

// 🎂 VERIFICAR SE DEVE ENVIAR NOTIFICAÇÃO
function shouldSendNotification(birthday, timing) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const currentYear = today.getFullYear();
  const birthdayDate = new Date(birthday.date + 'T00:00:00');
  birthdayDate.setFullYear(currentYear);
  
  // Se o aniversário já passou este ano, considerar o próximo ano
  if (birthdayDate < today) {
    birthdayDate.setFullYear(currentYear + 1);
  }

  let notificationDate = new Date(birthdayDate);
  
  // Calcular quando deve notificar baseado na configuração
  switch(timing) {
    case 'same-day':
      // No mesmo dia
      break;
    case '1-day':
      notificationDate.setDate(notificationDate.getDate() - 1);
      break;
    case '2-days':
      notificationDate.setDate(notificationDate.getDate() - 2);
      break;
    case '3-days':
      notificationDate.setDate(notificationDate.getDate() - 3);
      break;
    case '1-week':
      notificationDate.setDate(notificationDate.getDate() - 7);
      break;
    default:
      // Padrão: 1 dia antes
      notificationDate.setDate(notificationDate.getDate() - 1);
  }

  // Verificar se hoje é o dia de notificar
  const timeDiff = notificationDate.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  return daysDiff === 0;
}

// 💬 CRIAR MENSAGEM WHATSAPP PERSONALIZADA
function createWhatsAppMessage(birthday, timing) {
  const birthdayDate = new Date(birthday.date + 'T00:00:00');
  const currentYear = new Date().getFullYear();
  birthdayDate.setFullYear(currentYear);
  
  // Se já passou este ano, usar próximo ano
  if (birthdayDate < new Date()) {
    birthdayDate.setFullYear(currentYear + 1);
  }
  
  const age = calculateAge(birthday.date);
  const nextAge = age + 1;
  
  // Determinar texto baseado no timing
  let whenText = '';
  let urgencyEmoji = '';
  
  switch(timing) {
    case 'same-day':
      whenText = 'HOJE';
      urgencyEmoji = '🚨';
      break;
    case '1-day':
      whenText = 'AMANHÃ';
      urgencyEmoji = '⚠️';
      break;
    case '2-days':
      whenText = 'EM 2 DIAS';
      urgencyEmoji = '📅';
      break;
    case '3-days':
      whenText = 'EM 3 DIAS';
      urgencyEmoji = '📅';
      break;
    case '1-week':
      whenText = 'EM 1 SEMANA';
      urgencyEmoji = '📅';
      break;
    default:
      const days = calculateDaysUntilBirthday(birthday.date);
      whenText = `EM ${days} DIA${days > 1 ? 'S' : ''}`;
      urgencyEmoji = '📅';
  }
  
  return `${urgencyEmoji} *LEMBRETE AUTOMÁTICO PM* 🎂

📅 *Data:* ${birthdayDate.toLocaleDateString('pt-BR')} (${whenText}!)
🎖️ *Graduação:* ${birthday.graduation}
👤 *Nome:* ${birthday.name}
🎈 *Idade:* ${nextAge} anos
📞 *Telefone:* ${birthday.phone}
👥 *Relacionamento:* ${birthday.relationship}
${birthday.unit ? `🏢 *Unidade:* ${birthday.unit}` : ''}

🎁 *Não esqueça de parabenizar nosso companheiro da PM!*
💐 *Sugestões:* Ligação, mensagem, presente ou visita

---
_Sistema Automático PM_ 🤖
_${new Date().toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'})}_`;
}

// 🧮 CALCULAR IDADE ATUAL
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

// 📅 CALCULAR DIAS ATÉ ANIVERSÁRIO
function calculateDaysUntilBirthday(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const currentYear = today.getFullYear();
  const birthday = new Date(dateString + 'T00:00:00');
  birthday.setFullYear(currentYear);
  
  if (birthday < today) {
    birthday.setFullYear(currentYear + 1);
  }
  
  const timeDiff = birthday.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  return daysDiff;
}