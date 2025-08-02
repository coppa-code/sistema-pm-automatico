// scripts/check-birthdays.js
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// 🔧 CONFIGURAÇÃO
const CONFIG = {
    firebase: {
        apiKey: process.env.FIREBASE_API_KEY,
        projectId: process.env.FIREBASE_PROJECT_ID,
        // Outras configs do Firebase
    },
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER,
        toNumber: process.env.TWILIO_TO_NUMBER
    },
    notification: {
        timing: process.env.NOTIFICATION_TIMING || '1-day',
        sendTime: process.env.NOTIFICATION_TIME || '09:00'
    }
};

// 📋 LOGS
const LOG_DIR = 'logs';
let executionLog = [];

function log(message, type = 'INFO') {
    const timestamp = new Date().toLocaleString('pt-BR');
    const logEntry = `[${timestamp}] [${type}] ${message}`;
    console.log(logEntry);
    executionLog.push(logEntry);
}

// 🔥 INICIALIZAR FIREBASE
async function initializeFirebase() {
    try {
        // Para GitHub Actions, usar service account
        const serviceAccount = {
            type: "service_account",
            project_id: CONFIG.firebase.projectId,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
        };

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: CONFIG.firebase.projectId
        });

        log('✅ Firebase inicializado com sucesso');
        return admin.firestore();
    } catch (error) {
        log(`❌ Erro ao inicializar Firebase: ${error.message}`, 'ERROR');
        throw error;
    }
}

// 📅 CÁLCULOS DE DATA
function calculateDaysUntilNotification(dateString) {
    const timing = CONFIG.notification.timing;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const currentYear = today.getFullYear();
    const birthday = new Date(dateString + 'T00:00:00');
    birthday.setFullYear(currentYear);
    
    if (birthday < today) {
        birthday.setFullYear(currentYear + 1);
    }

    let notificationDate = new Date(birthday);
    
    switch(timing) {
        case 'same-day':
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
    }

    const timeDiff = notificationDate.getTime() - today.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
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

function shouldSendNotification(birthday) {
    const daysUntil = calculateDaysUntilNotification(birthday.date);
    return daysUntil === 0;
}

// 💬 CRIAR MENSAGEM
function createWhatsAppMessage(birthday) {
    const birthdayDate = new Date(birthday.date + 'T00:00:00');
    const currentYear = new Date().getFullYear();
    birthdayDate.setFullYear(currentYear);
    
    if (birthdayDate < new Date()) {
        birthdayDate.setFullYear(currentYear + 1);
    }
    
    const age = calculateAge(birthday.date);
    const nextAge = age + 1;
    
    const timing = CONFIG.notification.timing;
    let whenText = '';
    
    switch(timing) {
        case 'same-day':
            whenText = 'HOJE';
            break;
        case '1-day':
            whenText = 'AMANHÃ';
            break;
        default:
            const days = calculateDaysUntilNotification(birthday.date);
            whenText = `em ${days} dia(s)`;
    }
    
    return `🎉 *LEMBRETE DE ANIVERSÁRIO PM* 🎂

📅 *Data:* ${birthdayDate.toLocaleDateString('pt-BR')} (${whenText.toUpperCase()}!)
🎖️ *Graduação:* ${birthday.graduation}
👤 *Nome:* ${birthday.name}
🎈 *Idade:* ${nextAge} anos
📞 *Telefone:* ${birthday.phone}
👥 *Relacionamento:* ${birthday.relationship}
${birthday.unit ? `🏢 *Unidade:* ${birthday.unit}` : ''}

🎁 *Não esqueça de parabenizar nosso companheiro da PM!*
💐 *Sugestões:* Ligação, mensagem, presente ou visita

---
_Sistema Automático de Aniversários PM_ 🎖️
_${new Date().toLocaleString('pt-BR')}_
_Executado via GitHub Actions_`;
}

// 📱 ENVIAR WHATSAPP
async function sendWhatsAppMessage(to, message) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.twilio.accountSid}/Messages.json`;
    
    const body = new URLSearchParams({
        From: CONFIG.twilio.fromNumber,
        To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        Body: message
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${CONFIG.twilio.accountSid}:${CONFIG.twilio.authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Twilio Error: ${error.message || 'Erro desconhecido'}`);
    }

    return await response.json();
}

// 📊 SALVAR LOGS
async function saveLogs() {
    try {
        await fs.mkdir(LOG_DIR, { recursive: true });
        
        const logFileName = `execution-${new Date().toISOString().split('T')[0]}.log`;
        const logPath = path.join(LOG_DIR, logFileName);
        
        const logContent = executionLog.join('\n');
        await fs.writeFile(logPath, logContent, 'utf8');
        
        log(`📋 Logs salvos em: ${logPath}`);
    } catch (error) {
        log(`❌ Erro ao salvar logs: ${error.message}`, 'ERROR');
    }
}

// 🚀 FUNÇÃO PRINCIPAL
async function main() {
    const startTime = new Date();
    log('🎖️ === EXECUÇÃO AUTOMÁTICA SISTEMA PM ===');
    log(`⏰ Iniciado em: ${startTime.toLocaleString('pt-BR')}`);
    log(`🔧 Configuração: ${CONFIG.notification.timing}`);
    log(`📱 Para: ${CONFIG.twilio.toNumber}`);

    try {
        // 1. Inicializar Firebase
        const db = await initializeFirebase();
        
        // 2. Buscar aniversários
        log('📋 Buscando aniversários no Firebase...');
        const snapshot = await db.collection('birthdays').get();
        const birthdays = [];
        
        snapshot.forEach(doc => {
            birthdays.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        log(`📊 Total de aniversários: ${birthdays.length}`);
        
        // 3. Filtrar quais enviar hoje
        const toSend = birthdays.filter(birthday => shouldSendNotification(birthday));
        log(`🔔 Na fila para envio: ${toSend.length}`);
        
        if (toSend.length === 0) {
            log('ℹ️ Nenhuma notificação para enviar hoje');
            log('📅 Próximas verificações:');
            
            const upcoming = birthdays
                .map(b => ({
                    ...b,
                    daysUntil: calculateDaysUntilNotification(b.date)
                }))
                .filter(b => b.daysUntil > 0)
                .sort((a, b) => a.daysUntil - b.daysUntil)
                .slice(0, 3);
                
            upcoming.forEach(b => {
                log(`   - ${b.graduation} ${b.name}: ${b.daysUntil} dia(s)`);
            });
        } else {
            // 4. Enviar mensagens
            log('📱 Iniciando envios...');
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < toSend.length; i++) {
                const birthday = toSend[i];
                const nextAge = calculateAge(birthday.date) + 1;
                
                log(`📤 Enviando ${i + 1}/${toSend.length}: ${birthday.graduation} ${birthday.name} (${nextAge} anos)`);
                
                try {
                    const message = createWhatsAppMessage(birthday);
                    const result = await sendWhatsAppMessage(CONFIG.twilio.toNumber, message);
                    
                    log(`   ✅ Enviado - SID: ${result.sid} - Status: ${result.status}`);
                    successCount++;
                    
                    // Aguardar entre envios para evitar rate limiting
                    if (i < toSend.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        log('   ⏳ Aguardando 2s...');
                    }
                    
                } catch (error) {
                    log(`   ❌ Erro: ${error.message}`, 'ERROR');
                    errorCount++;
                }
            }
            
            // 5. Relatório final
            log('\n📊 === RELATÓRIO FINAL ===');
            log(`✅ Sucessos: ${successCount}`);
            log(`❌ Erros: ${errorCount}`);
            log(`📈 Taxa de sucesso: ${((successCount / toSend.length) * 100).toFixed(1)}%`);
        }
        
        const endTime = new Date();
        const duration = ((endTime - startTime) / 1000).toFixed(1);
        log(`⏱️ Tempo total: ${duration}s`);
        log('🎉 Execução concluída com sucesso!');
        
        // Salvar logs
        await saveLogs();
        
        // Exit code 0 = sucesso
        process.exit(0);
        
    } catch (error) {
        log(`💥 ERRO CRÍTICO: ${error.message}`, 'ERROR');
        log(`Stack trace: ${error.stack}`, 'ERROR');
        
        await saveLogs();
        
        // Exit code 1 = erro
        process.exit(1);
    }
}

// 🎯 EXECUTAR SE CHAMADO DIRETAMENTE
if (require.main === module) {
    main();
}

module.exports = { main };
