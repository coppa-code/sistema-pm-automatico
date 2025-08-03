
// scripts/setup.js
const fs = require('fs').promises;
const path = require('path');

class SystemSetup {
    constructor() {
        this.setupLog = [];
    }

    log(message, type = 'INFO') {
        const timestamp = new Date().toLocaleString('pt-BR');
        const logEntry = `[${timestamp}] ${type}: ${message}`;
        
        this.setupLog.push(logEntry);
        
        const emoji = {
            'INFO': 'ℹ️',
            'SUCCESS': '✅',
            'WARNING': '⚠️',
            'ERROR': '❌'
        }[type] || 'ℹ️';
        
        console.log(`${emoji} ${message}`);
    }

    async setupDirectories() {
        this.log('🔧 Criando estrutura de diretórios...');
        
        const directories = [
            'logs',
            'reports', 
            'scripts',
            'docs',
            '.github/workflows'
        ];

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
                this.log(`📁 Diretório criado: ${dir}`, 'SUCCESS');
            } catch (error) {
                this.log(`❌ Erro ao criar ${dir}: ${error.message}`, 'ERROR');
            }
        }
    }

    async validateEnvironment() {
        this.log('⚙️ Validando ambiente...');
        
        // Verificar Node.js
        const nodeVersion = process.version;
        this.log(`🟢 Node.js: ${nodeVersion}`);
        
        if (parseInt(nodeVersion.split('.')[0].substring(1)) < 18) {
            this.log('⚠️ Node.js 18+ recomendado', 'WARNING');
        }

        // Verificar npm
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const { stdout } = await execAsync('npm --version');
            this.log(`📦 npm: ${stdout.trim()}`);
        } catch (error) {
            this.log('❌ npm não encontrado', 'ERROR');
        }

        // Verificar git
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const { stdout } = await execAsync('git --version');
            this.log(`📋 ${stdout.trim()}`);
        } catch (error) {
            this.log('⚠️ Git não encontrado', 'WARNING');
        }
    }

    async installDependencies() {
        this.log('📦 Instalando dependências...');
        
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            // Verificar se package.json existe
            const packagePath = path.join(process.cwd(), 'scripts', 'package.json');
            try {
                await fs.access(packagePath);
                this.log('📄 package.json encontrado');
            } catch {
                this.log('❌ package.json não encontrado', 'ERROR');
                return;
            }

            // Instalar dependências
            const { stdout, stderr } = await execAsync('cd scripts && npm install');
            
            if (stderr && !stderr.includes('warn')) {
                this.log(`❌ Erro npm: ${stderr}`, 'ERROR');
            } else {
                this.log('✅ Dependências instaladas com sucesso', 'SUCCESS');
            }
            
        } catch (error) {
            this.log(`❌ Erro ao instalar dependências: ${error.message}`, 'ERROR');
        }
    }

    async createConfigFile() {
        this.log('⚙️ Criando arquivo de configuração...');
        
        const config = {
            system: {
                name: "Sistema de Aniversários PM",
                version: "1.0.0",
                timezone: "America/Sao_Paulo",
                environment: process.env.NODE_ENV || "production"
            },
            notifications: {
                defaultTiming: "1-day",
                defaultSendTime: "09:00",
                recipientPhone: process.env.TWILIO_TO_NUMBER || "+557181478028",
                enableWhatsApp: true,
                enableReports: true
            },
            firebase: {
                projectId: process.env.FIREBASE_PROJECT_ID || "aniversario-dcdd8",
                collection: "birthdays"
            },
            twilio: {
                fromNumber: process.env.TWILIO_FROM_NUMBER || "whatsapp:+14155238886",
                toNumber: process.env.TWILIO_TO_NUMBER || "+557181478028"
            },
            schedule: {
                checkInterval: "0 * * * *",  // A cada hora
                reportTime: "0 11 * * *",   // 8h Brasil (11h UTC)
                healthCheck: "0 */4 * * *"  // A cada 4 horas
            },
            features: {
                autoNotifications: true,
                dailyReports: true,
                healthMonitoring: true,
                logRetention: 30 // dias
            },
            createdAt: new Date().toISOString(),
            createdBy: "setup-script"
        };

        try {
            const configPath = path.join(process.cwd(), 'config.json');
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            this.log('✅ Arquivo config.json criado', 'SUCCESS');
        } catch (error) {
            this.log(`❌ Erro ao criar config: ${error.message}`, 'ERROR');
        }
    }

    async checkEnvironmentVariables() {
        this.log('🔍 Verificando variáveis de ambiente...');
        
        const required = [
            'FIREBASE_API_KEY',
            'FIREBASE_PROJECT_ID',
            'TWILIO_ACCOUNT_SID', 
            'TWILIO_AUTH_TOKEN',
            'TWILIO_FROM_NUMBER',
            'TWILIO_TO_NUMBER'
        ];

        const optional = [
            'NODE_ENV',
            'TEST_MODE',
            'FORCE_SEND'
        ];

        let hasRequired = 0;
        let hasOptional = 0;

        // Verificar obrigatórias
        for (const envVar of required) {
            if (process.env[envVar]) {
                this.log(`✅ ${envVar}: Configurada`, 'SUCCESS');
                hasRequired++;
            } else {
                this.log(`❌ ${envVar}: FALTANDO`, 'ERROR');
            }
        }

        // Verificar opcionais
        for (const envVar of optional) {
            if (process.env[envVar]) {
                this.log(`✅ ${envVar}: ${process.env[envVar]}`, 'SUCCESS');
                hasOptional++;
            } else {
                this.log(`ℹ️ ${envVar}: Não configurada (opcional)`);
            }
        }

        this.log(`📊 Variáveis obrigatórias: ${hasRequired}/${required.length}`);
        this.log(`📊 Variáveis opcionais: ${hasOptional}/${optional.length}`);

        if (hasRequired === required.length) {
            this.log('✅ Todas as variáveis obrigatórias configuradas!', 'SUCCESS');
            return true;
        } else {
            this.log('❌ Variáveis obrigatórias faltando!', 'ERROR');
            return false;
        }
    }

    async testConnections() {
        this.log('🧪 Testando conexões...');
        
        try {
            // Teste Firebase (básico)
            if (process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID) {
                this.log('🔥 Firebase: Credenciais encontradas', 'SUCCESS');
            } else {
                this.log('🔥 Firebase: Credenciais faltando', 'ERROR');
            }

            // Teste Twilio (básico)
            if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                try {
                    const response = await fetch(
                        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`,
                        {
                            headers: {
                                'Authorization': 'Basic ' + Buffer.from(
                                    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
                                ).toString('base64')
                            }
                        }
                    );

                    if (response.ok) {
                        this.log('📱 Twilio: Conexão OK', 'SUCCESS');
                    } else {
                        this.log(`📱 Twilio: Erro HTTP ${response.status}`, 'ERROR');
                    }
                } catch (error) {
                    this.log(`📱 Twilio: Erro de conexão - ${error.message}`, 'ERROR');
                }
            } else {
                this.log('📱 Twilio: Credenciais faltando', 'ERROR');
            }

        } catch (error) {
            this.log(`❌ Erro nos testes: ${error.message}`, 'ERROR');
        }
    }

    async createGitIgnore() {
        this.log('📝 Criando .gitignore...');
        
        const gitignoreContent = `# Dependencies
node_modules/
scripts/node_modules/

# Logs
*.log
logs/*.log
npm-debug.log*

# Environment variables
.env
.env.local
.env.production

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Temporary files
tmp/
temp/
*.tmp

# Firebase
.firebase/
firebase-debug.log

# Reports (opcional - remova se quiser versionar)
# reports/
# logs/

# Sistema PM específico
config.local.json
`;

        try {
            const gitignorePath = path.join(process.cwd(), '.gitignore');
            
            // Verificar se já existe
            let existingContent = '';
            try {
                existingContent = await fs.readFile(gitignorePath, 'utf-8');
            } catch {
                // Arquivo não existe
            }

            if (existingContent && existingContent.includes('# Sistema PM específico')) {
                this.log('📝 .gitignore já configurado');
            } else {
                await fs.writeFile(gitignorePath, existingContent + '\n' + gitignoreContent);
                this.log('✅ .gitignore criado/atualizado', 'SUCCESS');
            }
        } catch (error) {
            this.log(`❌ Erro ao criar .gitignore: ${error.message}`, 'ERROR');
        }
    }

    async generateSetupReport() {
        this.log('📊 Gerando relatório de setup...');
        
        const report = `# 🎖️ RELATÓRIO DE SETUP - SISTEMA PM

## 📅 Informações do Setup
- **Data**: ${new Date().toLocaleString('pt-BR')}
- **Node.js**: ${process.version}
- **Plataforma**: ${process.platform}
- **Arquitetura**: ${process.arch}

## 📋 Log do Setup
${this.setupLog.map(entry => `- ${entry}`).join('\n')}

## ✅ Próximos Passos

1. **Configure os GitHub Secrets**:
   - Vá em Settings > Secrets and variables > Actions
   - Adicione todas as variáveis obrigatórias listadas acima

2. **Commit e Push**:
   \`\`\`bash
   git add .
   git commit -m "🎖️ Setup inicial sistema PM"
   git push
   \`\`\`

3. **Ative GitHub Actions**:
   - Vá na aba Actions do repositório
   - O workflow começará automaticamente

4. **Monitore a primeira execução**:
   - Aguarde até 1 hora para primeira verificação
   - Verifique logs na aba Actions

## 🚨 Problemas Encontrados

${this.setupLog.filter(log => log.includes('ERROR')).length > 0 ? 
    this.setupLog.filter(log => log.includes('ERROR')).map(error => `- ${error}`).join('\n') :
    '✅ Nenhum problema encontrado!'
}

## 📞 Configurações Atuais

- **Horário de notificação**: 09:00 (Brasília)
- **Antecedência**: 1 dia antes
- **Destinatário**: ${process.env.TWILIO_TO_NUMBER || 'Não configurado'}
- **Timezone**: America/Sao_Paulo

---
*Relatório gerado automaticamente pelo setup do Sistema PM*
`;

        try {
            const reportPath = path.join(process.cwd(), 'SETUP-REPORT.md');
            await fs.writeFile(reportPath, report);
            this.log('✅ Relatório salvo em SETUP-REPORT.md', 'SUCCESS');
        } catch (error) {
            this.log(`❌ Erro ao salvar relatório: ${error.message}`, 'ERROR');
        }
    }

    async runCompleteSetup() {
        console.log('🎖️ INICIANDO SETUP DO SISTEMA PM...\n');
        
        try {
            await this.validateEnvironment();
            await this.setupDirectories();
            await this.installDependencies();
            await this.createConfigFile();
            await this.createGitIgnore();
            
            const envOk = await this.checkEnvironmentVariables();
            
            if (envOk) {
                await this.testConnections();
            }
            
            await this.generateSetupReport();
            
            console.log('\n🎉 SETUP CONCLUÍDO! 🎖️');
            
            if (envOk) {
                console.log('\n✅ SISTEMA PRONTO PARA USO!');
                console.log('\n📋 Próximos passos:');
                console.log('1. git add .');
                console.log('2. git commit -m "🎖️ Setup completo"');
                console.log('3. git push');
                console.log('4. Verificar Actions no GitHub');
            } else {
                console.log('\n⚠️ CONFIGURE AS VARIÁVEIS DE AMBIENTE NO GITHUB!');
                console.log('\nVá em: Settings > Secrets and variables > Actions');
                console.log('E adicione todas as variáveis obrigatórias listadas acima.');
            }
            
        } catch (error) {
            this.log(`💥 Erro fatal no setup: ${error.message}`, 'ERROR');
            console.log('\n❌ Setup falhou! Verifique os erros acima.');
            process.exit(1);
        }
    }
}

// 🚀 EXECUÇÃO
async function main() {
    const setup = new SystemSetup();
    await setup.runCompleteSetup();
}

if (require.main === module) {
    main();
}

module.exports = { SystemSetup };
