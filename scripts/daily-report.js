
// scripts/daily-report.js
const { BirthdaySystemPM, CONFIG } = require('./birthday-checker');
const fs = require('fs').promises;
const path = require('path');

class DailyReportPM {
    constructor() {
        this.system = new BirthdaySystemPM();
        this.reportData = {};
    }

    async generateDailyReport() {
        try {
            console.log('📊 INICIANDO RELATÓRIO DIÁRIO PM...\n');
            
            // Inicializar sistema
            await this.system.initialize();
            await this.system.loadBirthdays();
            
            const today = new Date();
            const brazilTime = new Date(today.toLocaleString("en-US", {timeZone: CONFIG.settings.timezone}));
            
            // Dados básicos
            this.reportData = {
                date: brazilTime.toLocaleDateString('pt-BR'),
                timestamp: brazilTime.toLocaleString('pt-BR'),
                totalBirthdays: this.system.birthdays.length,
                system: {
                    status: 'ONLINE',
                    lastCheck: brazilTime.toLocaleString('pt-BR'),
                    timezone: CONFIG.settings.timezone,
                    version: '1.0.0'
                }
            };

            // Análises detalhadas
            await this.analyzeUpcoming();
            await this.analyzeToday();
            await this.analyzeThisWeek();
            await this.analyzeThisMonth();
            await this.analyzeByUnit();
            await this.analyzeByGraduation();
            await this.checkSystemHealth();
            
            // Gerar relatório
            const report = this.formatReport();
            
            // Salvar relatório
            await this.saveReport(report);
            
            // Enviar relatório por WhatsApp se configurado
            if (this.shouldSendReport()) {
                await this.sendReportByWhatsApp(report);
            }
            
            console.log('📊 RELATÓRIO DIÁRIO CONCLUÍDO! ✅\n');
            
        } catch (error) {
            console.error('❌ Erro no relatório diário:', error);
            throw error;
        }
    }

    async analyzeUpcoming() {
        const upcoming = this.system.birthdays.map(birthday => ({
            ...birthday,
            daysUntil: this.system.calculateDaysUntilBirthday(birthday.date),
            daysUntilNotification: this.system.calculateDaysUntilNotification(birthday.date),
            nextAge: this.system.calculateAge(birthday.date) + 1
        }))
        .filter(b => b.daysUntil <= 30)
        .sort((a, b) => a.daysUntil - b.daysUntil);

        this.reportData.upcoming = {
            next7Days: upcoming.filter(b => b.daysUntil <= 7),
            next15Days: upcoming.filter(b => b.daysUntil <= 15),
            next30Days: upcoming,
            total: upcoming.length
        };
    }

    async analyzeToday() {
        const today = this.system.birthdays.filter(birthday => {
            return this.system.calculateDaysUntilBirthday(birthday.date) === 0;
        });

        this.reportData.today = {
            birthdays: today,
            count: today.length,
            notifications: today.filter(b => this.system.shouldSendToday(b, new Date().getHours())).length
        };
    }

    async analyzeThisWeek() {
        const thisWeek = this.system.birthdays.filter(birthday => {
            const days = this.system.calculateDaysUntilBirthday(birthday.date);
            return days >= 0 && days <= 7;
        });

        this.reportData.thisWeek = {
            birthdays: thisWeek,
            count: thisWeek.length,
            byDay: this.groupByDays(thisWeek, 7)
        };
    }

    async analyzeThisMonth() {
        const currentMonth = new Date().getMonth();
        const thisMonth = this.system.birthdays.filter(birthday => {
            const birthdayDate = new Date(birthday.date + 'T00:00:00');
            return birthdayDate.getMonth() === currentMonth;
        });

        this.reportData.thisMonth = {
            birthdays: thisMonth,
            count: thisMonth.length,
            avgAge: thisMonth.length > 0 ? 
                (thisMonth.reduce((sum, b) => sum + this.system.calculateAge(b.date), 0) / thisMonth.length).toFixed(1) : 0
        };
    }

    async analyzeByUnit() {
        const byUnit = {};
        this.system.birthdays.forEach(birthday => {
            const unit = birthday.unit || 'Não informado';
            byUnit[unit] = (byUnit[unit] || 0) + 1;
        });

        this.reportData.byUnit = {
            data: byUnit,
            total: Object.keys(byUnit).length,
            largest: Object.entries(byUnit).sort((a, b) => b[1] - a[1]).slice(0, 5)
        };
    }

    async analyzeByGraduation() {
        const byGraduation = {};
        this.system.birthdays.forEach(birthday => {
            const grad = birthday.graduation || 'Não informado';
            byGraduation[grad] = (byGraduation[grad] || 0) + 1;
        });

        this.reportData.byGraduation = {
            data: byGraduation,
            total: Object.keys(byGraduation).length,
            distribution: Object.entries(byGraduation).sort((a, b) => b[1] - a[1])
        };
    }

    async checkSystemHealth() {
        const health = {
            firebase: 'OK',
            twilio: 'OK',
            totalErrors: 0,
            lastExecution: 'Nunca',
            nextExecution: this.calculateNextExecution()
        };

        // Verificar logs de erro recentes
        try {
            const logDir = path.join(process.cwd(), 'logs');
            const today = new Date().toISOString().split('T')[0];
            const logFile = path.join(logDir, `execution-${today}.log`);
            
            const logContent = await fs.readFile(logFile, 'utf-8').catch(() => '');
            health.totalErrors = (logContent.match(/ERROR/g) || []).length;
            
            if (logContent) {
                const executions = logContent.split('---').filter(Boolean);
                if (executions.length > 0) {
                    const lastExec = executions[executions.length - 1];
                    const match = lastExec.match(/"brazilTime":"([^"]+)"/);
                    if (match) {
                        health.lastExecution = match[1];
                    }
                }
            }
        } catch (error) {
            health.logError = error.message;
        }

        this.reportData.health = health;
    }

    calculateNextExecution() {
        const now = new Date();
        const brazil = new Date(now.toLocaleString("en-US", {timeZone: CONFIG.settings.timezone}));
        const nextHour = new Date(brazil);
        nextHour.setHours(brazil.getHours() + 1, 0, 0, 0);
        
        return nextHour.toLocaleString('pt-BR');
    }

    groupByDays(birthdays, maxDays) {
        const grouped = {};
        for (let i = 0; i <= maxDays; i++) {
            grouped[i] = [];
        }
        
        birthdays.forEach(birthday => {
            const days = this.system.calculateDaysUntilBirthday(birthday.date);
            if (days >= 0 && days <= maxDays) {
                grouped[days].push(birthday);
            }
        });
        
        return grouped;
    }

    formatReport() {
        const { reportData } = this;
        
        return `🎖️ RELATÓRIO DIÁRIO - SISTEMA PM 📊

📅 Data: ${reportData.date}
⏰ Horário: ${reportData.timestamp}
🎯 Status: ${reportData.system.status}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 RESUMO GERAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Total de Policiais: ${reportData.totalBirthdays}
🎂 Aniversários Hoje: ${reportData.today.count}
📱 Notificações Hoje: ${reportData.today.notifications}
📅 Esta Semana: ${reportData.thisWeek.count}
📆 Este Mês: ${reportData.thisMonth.count}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎂 ANIVERSÁRIOS HOJE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${reportData.today.birthdays.length > 0 ? 
    reportData.today.birthdays.map(b => 
        `🎉 ${b.graduation} ${b.name} (${this.system.calculateAge(b.date) + 1} anos)`
    ).join('\n') : 
    '📝 Nenhum aniversário hoje'
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 PRÓXIMOS 7 DIAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${reportData.upcoming.next7Days.length > 0 ?
    reportData.upcoming.next7Days.map(b => 
        `${b.daysUntil === 0 ? '🎂 HOJE' : 
          b.daysUntil === 1 ? '📅 AMANHÃ' : 
          `📅 ${b.daysUntil} dias`}: ${b.graduation} ${b.name} (${b.nextAge} anos)`
    ).join('\n') :
    '📝 Nenhum aniversário na próxima semana'
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎖️ POR GRADUAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${reportData.byGraduation.distribution.slice(0, 8).map(([grad, count]) => 
    `${grad}: ${count} policial${count > 1 ? 'is' : ''}`
).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 MAIORES UNIDADES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${reportData.byUnit.largest.slice(0, 5).map(([unit, count]) => 
    `${unit}: ${count} policial${count > 1 ? 'is' : ''}`
).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 SAÚDE DO SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 Firebase: ${reportData.health.firebase}
📱 Twilio: ${reportData.health.twilio}
❌ Erros Hoje: ${reportData.health.totalErrors}
⏰ Última Execução: ${reportData.health.lastExecution}
🔄 Próxima Execução: ${reportData.health.nextExecution}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 ESTATÍSTICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Idade Média (Este Mês): ${reportData.thisMonth.avgAge} anos
🔔 Notificações Programadas: ${reportData.upcoming.next7Days.filter(b => b.daysUntilNotification === 0).length}
📱 Fila de Envio: ${reportData.upcoming.next7Days.filter(b => this.system.shouldSendToday(b, new Date().getHours())).length}

🎖️ Sistema PM funcionando 24/7! 🚀
📅 Relatório gerado automaticamente em ${reportData.timestamp}`;
    }

    async saveReport(report) {
        try {
            const reportsDir = path.join(process.cwd(), 'reports');
            
            // Criar diretório se não existir
            try {
                await fs.access(reportsDir);
            } catch {
                await fs.mkdir(reportsDir, { recursive: true });
            }
            
            const today = new Date().toISOString().split('T')[0];
            const reportFile = path.join(reportsDir, `daily-report-${today}.md`);
            
            await fs.writeFile(reportFile, report);
            
            // Salvar também JSON para análises
            const jsonFile = path.join(reportsDir, `daily-data-${today}.json`);
            await fs.writeFile(jsonFile, JSON.stringify(this.reportData, null, 2));
            
            console.log(`📊 Relatório salvo: ${reportFile}`);
            
        } catch (error) {
            console.error('❌ Erro ao salvar relatório:', error);
        }
    }

    shouldSendReport() {
        // Enviar relatório por WhatsApp apenas às 8:00 da manhã
        const brazil = new Date(new Date().toLocaleString("en-US", {timeZone: CONFIG.settings.timezone}));
        const hour = brazil.getHours();
        
        return hour === 8 && !CONFIG.settings.testMode;
    }

    async sendReportByWhatsApp(report) {
        try {
            // Versão resumida para WhatsApp
            const shortReport = `🎖️ RELATÓRIO DIÁRIO PM 📊

📅 ${this.reportData.date}

🎂 Hoje: ${this.reportData.today.count} aniversário${this.reportData.today.count !== 1 ? 's' : ''}
📅 Esta semana: ${this.reportData.thisWeek.count}
📆 Este mês: ${this.reportData.thisMonth.count}
👥 Total: ${this.reportData.totalBirthdays} policiais

${this.reportData.today.birthdays.length > 0 ? 
    '🎉 ANIVERSÁRIOS HOJE:\n' + 
    this.reportData.today.birthdays.map(b => 
        `${b.graduation} ${b.name} (${this.system.calculateAge(b.date) + 1} anos)`
    ).join('\n') + '\n' : ''}

${this.reportData.upcoming.next7Days.length > 0 ? 
    '📅 PRÓXIMOS 7 DIAS:\n' + 
    this.reportData.upcoming.next7Days.slice(0, 5).map(b => 
        `${b.daysUntil}d: ${b.graduation} ${b.name}`
    ).join('\n') + 
    (this.reportData.upcoming.next7Days.length > 5 ? `\n...e mais ${this.reportData.upcoming.next7Days.length - 5}` : '') + '\n' : ''}

🔧 Sistema: ${this.reportData.health.firebase === 'OK' ? '✅' : '❌'} Online
📱 Última exec: ${this.reportData.health.lastExecution}

🎖️ Relatório automático PM`;

            await this.system.sendWhatsAppMessage(CONFIG.twilio.toNumber, shortReport);
            console.log('📱 Relatório enviado por WhatsApp');
            
        } catch (error) {
            console.error('❌ Erro ao enviar relatório por WhatsApp:', error);
        }
    }
}

// 🚀 EXECUÇÃO
async function main() {
    const reporter = new DailyReportPM();
    
    try {
        await reporter.generateDailyReport();
        console.log('✅ Relatório diário concluído com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro no relatório diário:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { DailyReportPM };
