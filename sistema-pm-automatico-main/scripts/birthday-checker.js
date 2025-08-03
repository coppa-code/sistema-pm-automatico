// scripts/birthday-checker.js
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, addDoc } = require('firebase/firestore');
const fs = require('fs').promises;
const path = require('path');

// 🔧 CONFIGURAÇÕES
const CONFIG = {
    firebase: {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: "aniversario-dcdd8.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID || "aniversario-dcdd8",
        storageBucket: "aniversario-dcdd8.firebasestorage.app",
        messagingSenderId: "848233635514",
        appId: "1:848233635514:web:352f8de44f58ca86f7ec83",
        measurementId: "G-V8LDP9V7M1"
    },
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER,
        toNumber: process.env.TWILIO_TO_NUMBER
    },
    settings: {
        timezone: 'America/Sao_Paulo',
        testMode: process.env.TEST_MODE === 'true',
        forceSend: process.env.FORCE_SEND === 'true',
        defaultTiming: '1-day',
        defaultSendTime: '09:00'
    }
};

// 🎖️ CLASSE PRINCIPAL DO SISTEMA PM
class BirthdaySystemPM {
    constructor() {
        this.app = null;
        this.db = null;
        this.birthdays = [];
        this.executionId = `exec_${Date.now()}`;
        this.log = [];
    }

    // 📝 LOGGING
    logMessage(level, message, data = null) {
        const timestamp = new Date().toLocaleString('pt-BR', { 
            timeZone: CONFIG.settings.timezone 
        });
        const logEntry = {
            timestamp,
            level,
            executionId: this.executionId,
            message,
            data: data || {}
        };
        
        this.log.push(logEntry);
        
        const emoji = {
            'INFO': 'ℹ️',
            'SUCCESS': '✅',
            'WARNING': '⚠️',
            'ERROR': '❌',
            'WHATSAPP': '📱'
        }[level] || '📝';
        
        console.log(`${emoji} [${timestamp}] ${message}`);
        if (data) {
            console.log('   Dados:', JSON.stringify(data, null, 2));
        }
    }

    // 🔌 INICIALIZAR SISTEMA
    async initialize() {
        try {
            this.logMessage('INFO', '🎖️ Inicializando Sistema de Aniversários PM...');
            
            // Validar variáveis de ambiente
            this.validateEnvironmentVariables();
            
            // Inicializar Firebase
            this.app = initializeApp(CONFIG.firebase);
            this.db = getFirestore(this.app);
            
            this.logMessage('SUCCESS', '🔥 Firebase conectado com sucesso');
            
            // Testar conexão Twilio
            await this.testTwilioConnection();
            
            this.logMessage('SUCCESS', '🎖️ Sistema PM inicializado com sucesso');
            
        } catch (error) {
            this.logMessage('ERROR', 'Falha na inicialização', { error: error.message });
            throw error;
        }
    }

    // ✅ VALIDAR VARIÁVEIS
    validateEnvironmentVariables() {
        const required = [
            'FIREBASE_API_KEY',
            'FIREBASE_PROJECT_ID', 
            'TWILIO_ACCOUNT_SID',
            'TWILIO_AUTH_TOKEN',
            'TWILIO_FROM_NUMBER',
            'TWILIO_TO_NUMBER'
        ];
        
        const missing = required.filter(env => !process.env[env]);
        
        if (missing.length > 0) {
            throw new Error(`Variáveis de ambiente faltando: ${missing.join(', ')}`);
        }
        
        this.logMessage('SUCCESS', '✅ Todas as variáveis de ambiente configuradas');
    }

    // 🧪 TESTAR TWILIO
    async testTwilioConnection() {
        try {
            const response = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.twilio.accountSid}.json`,
                {
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(
                            `${CONFIG.twilio.accountSid}:${CONFIG.twilio.authToken}`
                        ).toString('base64')
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Twilio HTTP ${response.status}`);
            }

            const data = await response.json();
            this.logMessage('SUCCESS', '📱 Twilio conectado', { 
                status: data.status,
                from: CONFIG.twilio.fromNumber,
                to: CONFIG.twilio.toNumber
            });
            
        } catch (error) {
            this.logMessage('ERROR', 'Erro ao conectar Twilio', { error: error.message });
            throw error;
        }
    }

    // 📋 CARREGAR ANIVERSÁRIOS
    async loadBirthdays() {
        try {
            this.logMessage('INFO', '📋 Carregando aniversários do Firebase...');
            
            const querySnapshot = await getDocs(collection(this.db, 'birthdays'));
            this.birthdays = [];
            
            querySnapshot.forEach((doc) => {
                this.birthdays.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            this.logMessage('SUCCESS', `📊 ${this.birthdays.length} aniversários carregados`);
            return this.birthdays;
            
        } catch (error) {
            this.logMessage('ERROR', 'Erro ao carregar aniversários', { error: error.message });
            throw error;
        }
    }

    // ⏰ CALCULAR DIAS ATÉ NOTIFICAÇÃO
    calculateDaysUntilNotification(dateString, timing = CONFIG.settings.defaultTiming) {
        const today = new Date();
        // Usar timezone do Brasil
        const brazilTime = new Date(today.toLocaleString("en-US", {timeZone: CONFIG.settings.timezone}));
        brazilTime.setHours(0, 0, 0, 0);
        
        const currentYear = brazilTime.getFullYear();
        const birthday = new Date(dateString + 'T00:00:00');
        birthday.setFullYear(currentYear);
        
        // Se já passou este ano, usar próximo ano
        if (birthday < brazilTime) {
            birthday.setFullYear(currentYear + 1);
        }

        let notificationDate = new Date(birthday);
        
        // Aplicar configuração de timing
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

        const timeDiff = notificationDate.getTime() - brazilTime.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        
        return daysDiff;
    }

    // 🕐 VERIFICAR SE DEVE ENVIAR HOJE
    shouldSendToday(birthday, currentHour) {
        const timing = birthday.notificationTiming || CONFIG.settings.defaultTiming;
        const sendTime = birthday.sendTime || CONFIG.settings.defaultSendTime;
        const [sendHour] = sendTime.split(':').map(Number);
        
        const daysUntilNotification = this.calculateDaysUntilNotification(birthday.date, timing);
        
        // Deve enviar hoje E já passou do horário programado
        const shouldSend = daysUntilNotification === 0 && currentHour >= sendHour;
        
        // No modo força, enviar independente do horário
        if (CONFIG.settings.forceSend && daysUntilNotification === 0) {
            return true;
        }
        
        return shouldSend;
    }

    // 💬 CRIAR MENSAGEM WHATSAPP
    createWhatsAppMessage(birthday) {
        const birthdayDate = new Date(birthday.date + 'T00:00:00');
        const currentYear = new Date().getFullYear();
        birthdayDate.setFullYear(currentYear);
        
        if (birthdayDate < new Date()) {
            birthdayDate.setFullYear(currentYear + 1);
        }
        
        const age = this.calculateAge(birthday.date);
        const nextAge = age + 1;
        
        const timing = birthday.notificationTiming || CONFIG.settings.defaultTiming;
        let whenText = '';
        
        switch(timing) {
            case 'same-day':
                whenText = 'HOJE';
                break;
            case '1-day':
                whenText = 'AMANHÃ';
                break;
            default:
                const days = this.calculateDaysUntilBirthday(birthday.date);
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
_Sistema Automático PM_ 🎖️
_${new Date().toLocaleString('pt-BR', { timeZone: CONFIG.settings.timezone })}_
_Execução: ${this.executionId}_`;
    }

    // 📱 ENVIAR WHATSAPP
    async sendWhatsAppMessage(to, message) {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.twilio.accountSid}/Messages.json`;
        
        const body = new URLSearchParams({
            From: CONFIG.twilio.fromNumber,
            To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
            Body: message
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(
                    `${CONFIG.twilio.accountSid}:${CONFIG.twilio.authToken}`
                ).toString('base64'),
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

    // 🧮 CALCULAR IDADE
    calculateAge(dateString) {
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
    calculateDaysUntilBirthday(dateString) {
        const today = new Date();
        const brazilTime = new Date(today.toLocaleString("en-US", {timeZone: CONFIG.settings.timezone}));
        brazilTime.setHours(0, 0, 0, 0);
        
        const currentYear = brazilTime.getFullYear();
        const birthday = new Date(dateString + 'T00:00:00');
        birthday.setFullYear(currentYear);
        
        if (birthday < brazilTime) {
            birthday.setFullYear(currentYear + 1);
        }
        
        const timeDiff = birthday.getTime() - brazilTime.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        
        return daysDiff;
    }

    // 🎯 EXECUTAR VERIFICAÇÃO PRINCIPAL
    async executeCheck() {
        try {
            const brazilTime = new Date(new Date().toLocaleString("en-US", {timeZone: CONFIG.settings.timezone}));
            const currentHour = brazilTime.getHours();
            
            this.logMessage('INFO', `🕐 Executando verificação às ${brazilTime.toLocaleString('pt-BR')} (Hora ${currentHour})`);
            
            // Carregar aniversários
            await this.loadBirthdays();
            
            // Filtrar quem deve receber notificação hoje
            const toNotify = this.birthdays.filter(birthday => {
                const should = this.shouldSendToday(birthday, currentHour);
                
                if (should) {
                    this.logMessage('INFO', `📅 ${birthday.graduation} ${birthday.name} deve receber notificação`, {
                        birthday: birthday.date,
                        daysUntil: this.calculateDaysUntilNotification(birthday.date),
                        timing: birthday.notificationTiming || CONFIG.settings.defaultTiming
                    });
                }
                
                return should;
            });

            this.logMessage('INFO', `📊 ${toNotify.length} notificações para enviar hoje`);
            
            // No modo teste, apenas logar
            if (CONFIG.settings.testMode) {
                this.logMessage('WARNING', '🧪 MODO TESTE - Não enviando mensagens reais');
                toNotify.forEach(birthday => {
                    const message = this.createWhatsAppMessage(birthday);
                    this.logMessage('INFO', `🧪 [TESTE] Mensagem para ${birthday.graduation} ${birthday.name}`, {
                        message: message.substring(0, 200) + '...'
                    });
                });
                return { sent: 0, errors: 0, tested: toNotify.length };
            }

            // Enviar mensagens reais
            let sent = 0;
            let errors = 0;
            
            for (const birthday of toNotify) {
                try {
                    const message = this.createWhatsAppMessage(birthday);
                    const result = await this.sendWhatsAppMessage(CONFIG.twilio.toNumber, message);
                    
                    this.logMessage('WHATSAPP', `📱 Enviado para ${birthday.graduation} ${birthday.name}`, {
                        sid: result.sid,
                        status: result.status,
                        to: CONFIG.twilio.toNumber
                    });
                    
                    // Marcar como enviado no Firebase
                    await this.markAsSent(birthday.id);
                    
                    sent++;
                    
                    // Aguardar entre envios
                    if (toNotify.length > 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                } catch (error) {
                    this.logMessage('ERROR', `❌ Erro ao enviar para ${birthday.graduation} ${birthday.name}`, {
                        error: error.message
                    });
                    errors++;
                }
            }
            
            this.logMessage('SUCCESS', `✅ Verificação concluída: ${sent} enviados, ${errors} erros`);
            
            return { sent, errors, total: toNotify.length };
            
        } catch (error) {
            this.logMessage('ERROR', 'Erro na execução principal', { error: error.message });
            throw error;
        }
    }

    // ✅ MARCAR COMO ENVIADO
    async markAsSent(birthdayId) {
        try {
            await updateDoc(doc(this.db, 'birthdays', birthdayId), {
                lastNotificationSent: new Date().toISOString(),
                lastExecutionId: this.executionId,
                notificationCount: (await this.getBirthday(birthdayId))?.notificationCount + 1 || 1
            });
        } catch (error) {
            this.logMessage('WARNING', 'Erro ao marcar como enviado', { 
                birthdayId, 
                error: error.message 
            });
        }
    }

    // 📋 BUSCAR ANIVERSÁRIO
    async getBirthday(id) {
        return this.birthdays.find(b => b.id === id);
    }

    // 💾 SALVAR LOG
    async saveExecutionLog() {
        try {
            const logDir = path.join(process.cwd(), 'logs');
            
            // Criar diretório se não existir
            try {
                await fs.access(logDir);
            } catch {
                await fs.mkdir(logDir, { recursive: true });
            }
            
            // Salvar log diário
            const today = new Date().toISOString().split('T')[0];
            const logFile = path.join(logDir, `execution-${today}.log`);
            
            const logData = {
                executionId: this.executionId,
                timestamp: new Date().toISOString(),
                brazilTime: new Date().toLocaleString('pt-BR', { timeZone: CONFIG.settings.timezone }),
                config: {
                    testMode: CONFIG.settings.testMode,
                    forceSend: CONFIG.settings.forceSend,
                    timezone: CONFIG.settings.timezone
                },
                log: this.log,
                summary: {
                    totalBirthdays: this.birthdays.length,
                    logEntries: this.log.length,
                    errors: this.log.filter(l => l.level === 'ERROR').length,
                    warnings: this.log.filter(l => l.level === 'WARNING').length,
                    whatsappSent: this.log.filter(l => l.level === 'WHATSAPP').length
                }
            };
            
            const existingContent = await fs.readFile(logFile, 'utf-8').catch(() => '');
            const newContent = existingContent + '\n' + JSON.stringify(logData, null, 2) + '\n---\n';
            
            await fs.writeFile(logFile, newContent);
            
            this.logMessage('SUCCESS', `💾 Log salvo: ${logFile}`);
            
        } catch (error) {
            this.logMessage('ERROR', 'Erro ao salvar log', { error: error.message });
        }
    }

    // 📊 RELATÓRIO FINAL
    generateSummary(result) {
        const summary = {
            executionId: this.executionId,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: CONFIG.settings.timezone }),
            mode: CONFIG.settings.testMode ? 'TESTE' : 'PRODUÇÃO',
            totalBirthdays: this.birthdays.length,
            sent: result.sent || 0,
            errors: result.errors || 0,
            tested: result.tested || 0,
            success: (result.errors || 0) === 0
        };
        
        this.logMessage('INFO', '📊 RELATÓRIO FINAL PM', summary);
        
        return summary;
    }
}

// 🚀 EXECUÇÃO PRINCIPAL
async function main() {
    const system = new BirthdaySystemPM();
    
    try {
        // Inicializar
        await system.initialize();
        
        // Executar verificação
        const result = await system.executeCheck();
        
        // Gerar resumo
        const summary = system.generateSummary(result);
        
        // Salvar log
        await system.saveExecutionLog();
        
        // Output para GitHub Actions
        console.log(`::set-output name=sent::${result.sent || 0}`);
        console.log(`::set-output name=errors::${result.errors || 0}`);
        console.log(`::set-output name=total::${result.total || 0}`);
        
        // Sucesso
        console.log('\n🎖️ SISTEMA PM EXECUTADO COM SUCESSO! 🎉');
        process.exit(0);
        
    } catch (error) {
        system.logMessage('ERROR', '💥 FALHA CRÍTICA NO SISTEMA PM', { 
            error: error.message,
            stack: error.stack
        });
        
        await system.saveExecutionLog();
        
        console.log('::set-output name=error::' + error.message);
        process.exit(1);
    }
}

// 🔥 EXECUTAR SE CHAMADO DIRETAMENTE
if (require.main === module) {
    main();
}

module.exports = { BirthdaySystemPM, CONFIG };
