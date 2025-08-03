
// scripts/health-check.js
const { BirthdaySystemPM, CONFIG } = require('./birthday-checker');

class HealthCheckPM {
    constructor() {
        this.system = new BirthdaySystemPM();
        this.results = {
            timestamp: new Date().toISOString(),
            overall: 'UNKNOWN',
            services: {},
            metrics: {},
            alerts: []
        };
    }

    async runHealthCheck() {
        try {
            console.log('🏥 INICIANDO HEALTH CHECK DO SISTEMA PM...\n');
            
            // Verificar todos os serviços
            await this.checkFirebase();
            await this.checkTwilio();
            await this.checkEnvironmentVariables();
            await this.checkSystemMetrics();
            await this.checkRecentExecutions();
            await this.checkDiskSpace();
            
            // Determinar status geral
            this.determineOverallHealth();
            
            // Gerar relatório
            const report = this.generateHealthReport();
            console.log(report);
            
            // Alertas críticos
            await this.handleCriticalAlerts();
            
            console.log('\n🏥 HEALTH CHECK CONCLUÍDO! ✅\n');
            
            return this.results;
            
        } catch (error) {
            console.error('❌ Erro no health check:', error);
            this.results.overall = 'CRITICAL';
            this.results.alerts.push({
                level: 'CRITICAL',
                message: `Health check falhou: ${error.message}`,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    async checkFirebase() {
        try {
            console.log('🔥 Testando Firebase...');
            
            await this.system.initialize();
            await this.system.loadBirthdays();
            
            this.results.services.firebase = {
                status: 'HEALTHY',
                responseTime: Date.now(),
                recordCount: this.system.birthdays.length,
                lastCheck: new Date().toISOString()
            };
            
            console.log(`✅ Firebase OK - ${this.system.birthdays.length} registros`);
            
        } catch (error) {
            this.results.services.firebase = {
                status: 'UNHEALTHY',
                error: error.message,
                lastCheck: new Date().toISOString()
            };
            
            this.results.alerts.push({
                level: 'CRITICAL',
                service: 'Firebase',
                message: `Firebase indisponível: ${error.message}`,
                timestamp: new Date().toISOString()
            });
            
            console.log(`❌ Firebase ERRO: ${error.message}`);
        }
    }

    async checkTwilio() {
        try {
            console.log('📱 Testando Twilio...');
            
            const startTime = Date.now();
            
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

            const responseTime = Date.now() - startTime;

            if (response.ok) {
                const data = await response.json();
                
                this.results.services.twilio = {
                    status: 'HEALTHY',
                    responseTime: responseTime,
                    accountStatus: data.status,
                    fromNumber: CONFIG.twilio.fromNumber,
                    toNumber: CONFIG.twilio.toNumber,
                    lastCheck: new Date().toISOString()
                };
                
                console.log(`✅ Twilio OK - ${responseTime}ms`);
                
                // Alerta se resposta lenta
                if (responseTime > 5000) {
                    this.results.alerts.push({
                        level: 'WARNING',
                        service: 'Twilio',
                        message: `Twilio resposta lenta: ${responseTime}ms`,
                        timestamp: new Date().toISOString()
                    });
                }
                
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
        } catch (error) {
            this.results.services.twilio = {
                status: 'UNHEALTHY',
                error: error.message,
                lastCheck: new Date().toISOString()
            };
            
            this.results.alerts.push({
                level: 'CRITICAL',
                service: 'Twilio',
                message: `Twilio indisponível: ${error.message}`,
                timestamp: new Date().toISOString()
            });
            
            console.log(`❌ Twilio ERRO: ${error.message}`);
        }
    }

    async checkEnvironmentVariables() {
        console.log('⚙️ Verificando variáveis de ambiente...');
        
        const required = [
            'FIREBASE_API_KEY',
            'FIREBASE_PROJECT_ID',
            'TWILIO_ACCOUNT_SID',
            'TWILIO_AUTH_TOKEN',
            'TWILIO_FROM_NUMBER',
            'TWILIO_TO_NUMBER'
        ];
        
        const missing = required.filter(env => !process.env[env]);
        const present = required.filter(env => process.env[env]);
        
        this.results.services.environment = {
            status: missing.length === 0 ? 'HEALTHY' : 'UNHEALTHY',
            totalRequired: required.length,
            present: present.length,
            missing: missing,
            lastCheck: new Date().toISOString()
        };
        
        if (missing.length > 0) {
            this.results.alerts.push({
                level: 'CRITICAL',
                service: 'Environment',
                message: `Variáveis faltando: ${missing.join(', ')}`,
                timestamp: new Date().toISOString()
            });
            console.log(`❌ Variáveis faltando: ${missing.join(', ')}`);
        } else {
            console.log('✅ Todas as variáveis de ambiente OK');
        }
    }

    async checkSystemMetrics() {
        console.log('📊 Coletando métricas do sistema...');
        
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        this.results.metrics = {
            memory: {
                used: Math.round(memUsage.heapUsed / 1024 / 1024),
                total: Math.round(memUsage.heapTotal / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024),
                rss: Math.round(memUsage.rss / 1024 / 1024)
            },
            uptime: Math.round(uptime),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
            timestamp: new Date().toISOString()
        };
        
        // Alertas de memória
        if (memUsage.heapUsed / memUsage.heapTotal > 0.9) {
            this.results.alerts.push({
                level: 'WARNING',
                service: 'System',
                message: `Uso de memória alto: ${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`,
                timestamp: new Date().toISOString()
            });
        }
        
        console.log(`✅ Métricas coletadas - Memória: ${this.results.metrics.memory.used}MB`);
    }

    async checkRecentExecutions() {
        console.log('🔍 Verificando execuções recentes...');
        
        try {
            const fs = require('fs').promises;
            const path = require('path');
            
            const logDir = path.join(process.cwd(), 'logs');
            const today = new Date().toISOString().split('T')[0];
            const logFile = path.join(logDir, `execution-${today}.log`);
            
            const logContent = await fs.readFile(logFile, 'utf-8').catch(() => '');
            
            if (logContent) {
                const executions = logContent.split('---').filter(Boolean);
                const errors = (logContent.match(/ERROR/g) || []).length;
                const warnings = (logContent.match(/WARNING/g) || []).length;
                const successes = (logContent.match(/SUCCESS/g) || []).length;
                
                let lastExecution = 'Nunca';
                if (executions.length > 0) {
                    const lastExec = executions[executions.length - 1];
                    const match = lastExec.match(/"brazilTime":"([^"]+)"/);
                    if (match) {
                        lastExecution = match[1];
                    }
                }
                
                this.results.services.executions = {
                    status: errors === 0 ? 'HEALTHY' : errors < 3 ? 'DEGRADED' : 'UNHEALTHY',
                    todayExecutions: executions.length,
                    todayErrors: errors,
                    todayWarnings: warnings,
                    todaySuccesses: successes,
                    lastExecution: lastExecution,
                    lastCheck: new Date().toISOString()
                };
                
                // Alertas baseados em execuções
                if (errors > 5) {
                    this.results.alerts.push({
                        level: 'CRITICAL',
                        service: 'Executions',
                        message: `Muitos erros hoje: ${errors}`,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Verificar se não há execuções recentes (mais de 2 horas)
                if (lastExecution !== 'Nunca') {
                    const lastTime = new Date(lastExecution);
                    const now = new Date();
                    const hoursDiff = (now - lastTime) / (1000 * 60 * 60);
                    
                    if (hoursDiff > 2) {
                        this.results.alerts.push({
                            level: 'WARNING',
                            service: 'Executions',
                            message: `Última execução há ${Math.round(hoursDiff)} horas`,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
                
                console.log(`✅ Execuções verificadas - Hoje: ${executions.length}, Erros: ${errors}`);
                
            } else {
                this.results.services.executions = {
                    status: 'WARNING',
                    message: 'Nenhum log encontrado hoje',
                    lastCheck: new Date().toISOString()
                };
                console.log('⚠️ Nenhum log de execução encontrado hoje');
            }
            
        } catch (error) {
            this.results.services.executions = {
                status: 'UNKNOWN',
                error: error.message,
                lastCheck: new Date().toISOString()
            };
            console.log(`❌ Erro ao verificar logs: ${error.message}`);
        }
    }

    async checkDiskSpace() {
        console.log('💽 Verificando espaço em disco...');
        
        try {
            // No ambiente GitHub Actions, o espaço não é uma preocupação crítica
            // Mas podemos verificar o tamanho dos logs
            const fs = require('fs').promises;
            const path = require('path');
            
            let totalLogSize = 0;
            let logCount = 0;
            
            try {
                const logDir = path.join(process.cwd(), 'logs');
                const files = await fs.readdir(logDir).catch(() => []);
                
                for (const file of files) {
                    const filePath = path.join(logDir, file);
                    const stats = await fs.stat(filePath);
                    totalLogSize += stats.size;
                    logCount++;
                }
            } catch (error) {
                // Diretório de logs não existe ainda
            }
            
            this.results.services.storage = {
                status: 'HEALTHY',
                logFiles: logCount,
                totalLogSize: Math.round(totalLogSize / 1024), // KB
                lastCheck: new Date().toISOString()
            };
            
            // Alerta se logs muito grandes (>50MB)
            if (totalLogSize > 50 * 1024 * 1024) {
                this.results.alerts.push({
                    level: 'WARNING',
                    service: 'Storage',
                    message: `Logs grandes: ${Math.round(totalLogSize / 1024 / 1024)}MB`,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log(`✅ Storage OK - ${logCount} logs, ${Math.round(totalLogSize / 1024)}KB`);
            
        } catch (error) {
            this.results.services.storage = {
                status: 'UNKNOWN',
                error: error.message,
                lastCheck: new Date().toISOString()
            };
            console.log(`❌ Erro ao verificar storage: ${error.message}`);
        }
    }

    determineOverallHealth() {
        const services = Object.values(this.results.services);
        const criticalAlerts = this.results.alerts.filter(a => a.level === 'CRITICAL').length;
        const unhealthyServices = services.filter(s => s.status === 'UNHEALTHY').length;
        const degradedServices = services.filter(s => s.status === 'DEGRADED').length;
        
        if (criticalAlerts > 0 || unhealthyServices > 0) {
            this.results.overall = 'UNHEALTHY';
        } else if (degradedServices > 0 || this.results.alerts.filter(a => a.level === 'WARNING').length > 2) {
            this.results.overall = 'DEGRADED';
        } else {
            this.results.overall = 'HEALTHY';
        }
    }

    generateHealthReport() {
        const emoji = {
            'HEALTHY': '✅',
            'DEGRADED': '⚠️',
            'UNHEALTHY': '❌',
            'UNKNOWN': '❓'
        };
        
        return `🏥 HEALTH CHECK SISTEMA PM ${emoji[this.results.overall]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 STATUS GERAL: ${this.results.overall}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Verificação: ${new Date().toLocaleString('pt-BR', { timeZone: CONFIG.settings.timezone })}

🔧 SERVIÇOS:
${Object.entries(this.results.services).map(([name, service]) => {
    const icon = emoji[service.status] || '❓';
    return `${icon} ${name.toUpperCase()}: ${service.status}`;
}).join('\n')}

📊 MÉTRICAS:
💾 Memória: ${this.results.metrics.memory?.used || 0}MB / ${this.results.metrics.memory?.total || 0}MB
🕐 Uptime: ${Math.round((this.results.metrics.uptime || 0) / 60)} minutos
🟢 Node.js: ${this.results.metrics.nodeVersion || 'N/A'}
💽 Logs: ${this.results.services.storage?.logFiles || 0} arquivos (${this.results.services.storage?.totalLogSize || 0}KB)

🔔 ALERTAS: ${this.results.alerts.length}
${this.results.alerts.length > 0 ? 
    this.results.alerts.map(alert => 
        `${alert.level === 'CRITICAL' ? '🚨' : '⚠️'} ${alert.service}: ${alert.message}`
    ).join('\n') : 
    '✅ Nenhum alerta ativo'
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DETALHES DOS SERVIÇOS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 FIREBASE: ${emoji[this.results.services.firebase?.status || 'UNKNOWN']}
${this.results.services.firebase?.recordCount ? `📊 Registros: ${this.results.services.firebase.recordCount}` : ''}
${this.results.services.firebase?.error ? `❌ Erro: ${this.results.services.firebase.error}` : ''}

📱 TWILIO: ${emoji[this.results.services.twilio?.status || 'UNKNOWN']}
${this.results.services.twilio?.responseTime ? `⚡ Resposta: ${this.results.services.twilio.responseTime}ms` : ''}
${this.results.services.twilio?.accountStatus ? `📊 Account: ${this.results.services.twilio.accountStatus}` : ''}
${this.results.services.twilio?.error ? `❌ Erro: ${this.results.services.twilio.error}` : ''}

⚙️ ENVIRONMENT: ${emoji[this.results.services.environment?.status || 'UNKNOWN']}
✅ Variáveis: ${this.results.services.environment?.present || 0}/${this.results.services.environment?.totalRequired || 0}
${this.results.services.environment?.missing?.length > 0 ? `❌ Faltando: ${this.results.services.environment.missing.join(', ')}` : ''}

🔍 EXECUÇÕES: ${emoji[this.results.services.executions?.status || 'UNKNOWN']}
${this.results.services.executions?.todayExecutions ? `📊 Hoje: ${this.results.services.executions.todayExecutions} execuções` : ''}
${this.results.services.executions?.todayErrors ? `❌ Erros: ${this.results.services.executions.todayErrors}` : ''}
${this.results.services.executions?.lastExecution ? `⏰ Última: ${this.results.services.executions.lastExecution}` : ''}

🎖️ SISTEMA PM MONITORADO 24/7! 🚀`;
    }

    async handleCriticalAlerts() {
        const criticalAlerts = this.results.alerts.filter(a => a.level === 'CRITICAL');
        
        if (criticalAlerts.length > 0 && !CONFIG.settings.testMode) {
            console.log(`🚨 ${criticalAlerts.length} ALERTAS CRÍTICOS DETECTADOS!`);
            
            try {
                const alertMessage = `🚨 ALERTA CRÍTICO - SISTEMA PM

⏰ ${new Date().toLocaleString('pt-BR', { timeZone: CONFIG.settings.timezone })}
🎖️ Status Geral: ${this.results.overall}

🔥 PROBLEMAS CRÍTICOS:
${criticalAlerts.map(alert => 
    `❌ ${alert.service}: ${alert.message}`
).join('\n')}

🔧 AÇÃO NECESSÁRIA:
- Verificar logs do sistema
- Validar configurações
- Contatar administrador se necessário

📊 Total de alertas: ${this.results.alerts.length}
🏥 Health check: ${this.results.timestamp}

🎖️ Sistema PM - Monitoramento Automático`;

                await this.system.sendWhatsAppMessage(CONFIG.twilio.toNumber, alertMessage);
                console.log('📱 Alertas críticos enviados por WhatsApp');
                
            } catch (error) {
                console.error('❌ Erro ao enviar alertas críticos:', error);
            }
        }
    }
}

// 🚀 EXECUÇÃO
async function main() {
    const healthCheck = new HealthCheckPM();
    
    try {
        const results = await healthCheck.runHealthCheck();
        
        // Definir exit code baseado na saúde
        const exitCode = results.overall === 'HEALTHY' ? 0 : 
                        results.overall === 'DEGRADED' ? 1 : 2;
        
        console.log(`\n🏥 Health check concluído - Status: ${results.overall}`);
        process.exit(exitCode);
        
    } catch (error) {
        console.error('❌ Health check falhou:', error);
        process.exit(2);
    }
}

if (require.main === module) {
    main();
}

module.exports = { HealthCheckPM };
