// index.js
const { 
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore,
    jidDecode,
    downloadContentFromMessage,
    PHONENUMBER_MCC
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const chalk = require('chalk');
const readline = require('readline');
const { join } = require('path');
const fs = require('fs');
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Settings import
const settings = require('./settings');

async function startGisnaxd() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    const gisnaxd = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Qoupay Dev', 'Chrome', '1.0.0'],
        auth: state,
        mobile: false
    });
    
    store.bind(gisnaxd.ev);

    // Load plugins
    const pluginsFolder = join(__dirname, 'plugins');
    const plugins = fs.readdirSync(pluginsFolder).filter(file => file.endsWith('.js'));
    
    for (const plugin of plugins) {
        require(join(pluginsFolder, plugin))(gisnaxd);
    }

    gisnaxd.ev.on('messages.upsert', async chatUpdate => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message) return;
            
            const content = JSON.stringify(msg.message);
            const from = msg.key.remoteJid;
            const type = Object.keys(msg.message)[0];
            const body = (type === 'conversation') ? msg.message.conversation 
                : (type === 'imageMessage') ? msg.message.imageMessage.caption
                : (type === 'videoMessage') ? msg.message.videoMessage.caption
                : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
                : '';
            
            const prefix = settings.prefix.find(p => body.startsWith(p)) || '';
            if (!prefix) return;
            
            const command = body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase();
            const args = body.trim().split(/ +/).slice(1);
            
            // Handle commands through plugins
            gisnaxd.emit('command', { msg, from, command, args, prefix });
            
        } catch (e) {
            console.error(chalk.red('Error:'), e);
        }
    });

    gisnaxd.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🌟 Connecting to WhatsApp...'));
        }
        
        if (qr) {
            console.log(chalk.cyan('\n🔐 Pairing Code:'), chalk.white(qr));
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            console.log(chalk.red('⚠️ Connection closed due to:'), lastDisconnect.error);
            
            if (shouldReconnect) {
                console.log(chalk.yellow('🔄 Reconnecting...'));
                startGisnaxd();
            }
        }
        
        if (connection === 'open') {
            console.log(chalk.green('\n✅ Successfully connected to WhatsApp!'));
            console.log(chalk.cyan('👤 Bot User:'), chalk.white(gisnaxd.user.name));
            console.log(chalk.cyan('📱 Number:'), chalk.white(gisnaxd.user.id.split(':')[0]));
            console.log(chalk.cyan('⏰ Time:'), chalk.white(new Date().toLocaleString()));
            console.log(chalk.cyan('🔌 Status:'), chalk.green('Online'));
            console.log(chalk.cyan('🛠️ Developer:'), chalk.white('Qoupay Dev'));
        }
    });

    gisnaxd.ev.on('creds.update', saveCreds);
    
    return gisnaxd;
}

// Get phone number input
console.log(chalk.cyan('\n📱 Please enter your WhatsApp number:'));
console.log(chalk.yellow('Format: Country Code + Number (e.g., 62851234567)'));

rl.question('-> ', (number) => {
    const phoneNumber = number.replace(/[^0-9]/g, '');
    
    if (!phoneNumber.length) {
        console.log(chalk.red('❌ Please enter a valid number!'));
        process.exit(1);
    }
    
    console.log(chalk.yellow('\n⏳ Starting WhatsApp Bot...'));
    startGisnaxd().catch(e => console.error(chalk.red('Error:'), e));
});
