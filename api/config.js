// 📁 api/config.js - CONFIGURAÇÕES CENTRALIZADAS
// Este arquivo centraliza todas as configurações do sistema

export const CONFIG = {
  // 🔥 FIREBASE - Configurações do banco de dados
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyACqmiKFVEbm-P1tCVmYXl-B5a-wum2XPQ",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "aniversario-dcdd8.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "aniversario-dcdd8",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "aniversario-dcdd8.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "848233635514",
    appId: process.env.FIREBASE_APP_ID || "1:848233635514:web:352f8de44f58ca86f7ec83",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-V8LDP9V7M1"
  },

  // 📱 TWILIO - Configurações do WhatsApp
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACbdbb222bea4e9a291bf7b7fe53ed07c1',
    authToken: process.env.TWILIO_AUTH_TOKEN || 'b557d3dac419358af345f941f6449e93',
    fromNumber: process.env.TWILIO_FROM || 'whatsapp:+14155238886',
    toNumber: process.env.TWILIO_TO || '+557181478028'
  },

  // ⏰ NOTIFICAÇÕES - Configurações de timing
  notification: {
    timing: process.env.NOTIFICATION_TIMING || '1-day',
    sendTime: process.env.NOTIFICATION_TIME || '09:00',
    enabled: process.env.NOTIFICATIONS_ENABLED !== 'false',
    timezone: process.env.TIMEZONE || 'America/Sao_Paulo'
  },

  // 🛡️ SISTEMA - Configurações gerais
  system: {
    environment: process.env.NODE_ENV || 'production',
    logLevel: process.env.LOG_LEVEL || 'info',
    rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY) || 2000, // 2 segundos entre envios
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    timeout: parseInt(process.env.TIMEOUT) || 30000 // 30 segundos
  }
};

// 🔍 VALIDAÇÃO DAS CONFIGURAÇÕES
export function validateConfig() {
  const errors = [];

  // Validar Twilio
  if (!CONFIG.twilio.accountSid.startsWith('AC')) {
    errors.push('TWILIO_ACCOUNT_SID inválido');
  }

  if (!CONFIG.twilio.authToken || CONFIG.twilio.authToken.length < 32) {
    errors.push('TWILIO_AUTH_TOKEN inválido');
  }

  if (!CONFIG.twilio.fromNumber.startsWith('whatsapp:')) {
    errors.push('TWILIO_FROM deve começar com whatsapp:');
  }

  if (!CONFIG.twilio.toNumber.startsWith('+55')) {
    errors.push('TWILIO_TO deve ser um número brasileiro (+55...)');
  }

  // Validar Firebase
  if (!CONFIG.firebase.projectId) {
    errors.push('FIREBASE_PROJECT_ID é obrigatório');
  }

  // Validar notificações
  const validTimings = ['same-day', '1-day', '2-days', '3-days', '1-week'];
  if (!validTimings.includes(CONFIG.notification.timing)) {
    errors.push(`NOTIFICATION_TIMING deve ser um de: ${validTimings.join(', ')}`);
  }

  if (!/^\d{2}:\d{2}$/.test(CONFIG.notification.sendTime)) {
    errors.push('NOTIFICATION_TIME deve estar no formato HH:MM');
  }

  return errors;
}

// 📊 LOGS DE CONFIGURAÇÃO
export function logConfig() {
  console.log('⚙️ CONFIGURAÇÕES CARREGADAS:');
  console.log(`📱 Twilio From: ${CONFIG.twilio.fromNumber}`);
  console.log(`📱 Twilio To: ${CONFIG.twilio.toNumber}`);
  console.log(`⏰ Timing: ${CONFIG.notification.timing}`);
  console.log(`🕐 Horário: ${CONFIG.notification.sendTime}`);
  console.log(`🔔 Notificações: ${CONFIG.notification.enabled ? 'Ativadas' : 'Desativadas'}`);
  console.log(`🌍 Timezone: ${CONFIG.notification.timezone}`);
  console.log(`🔧 Ambiente: ${CONFIG.system.environment}`);
}

// 🚨 FUNÇÃO DE DEBUG
export function debugConfig() {
  return {
    hasFirebaseConfig: !!CONFIG.firebase.projectId,
    hasTwilioConfig: !!(CONFIG.twilio.accountSid && CONFIG.twilio.authToken),
    notificationsEnabled: CONFIG.notification.enabled,
    currentTiming: CONFIG.notification.timing,
    currentTime: CONFIG.notification.sendTime,
    environment: CONFIG.system.environment,
    validationErrors: validateConfig()
  };
}