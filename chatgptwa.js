const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Ensure crypto is available globally (fixes the baileys issue)
global.crypto = crypto;

// Penyimpanan sesi untuk mengingat state chat
const sessions = {};
const chatGPTEnabled = {};

// API URL
const API_URL = "https://fastrestapis.fasturl.cloud/aillm/gpt-4";

// Path untuk menyimpan credentials dan media
const AUTH_FOLDER = './auth_info';
const MEDIA_FOLDER = './media';

// Membuat folder jika belum ada
if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER);
if (!fs.existsSync(MEDIA_FOLDER)) fs.mkdirSync(MEDIA_FOLDER);

// Store untuk menyimpan chat history
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
store.readFromFile('./store.json');
setInterval(() => {
    store.writeToFile('./store.json');
}, 10000);

// Fungsi untuk memeriksa apakah teks berisi kata-kata terlarang
function containsForbiddenWords(text) {
    const forbiddenWords = ['darmawati', 'darma', 'wati', 'hot', 'orang tua peter', 'wtii', 'peter kontol', 'peter tolol'];
    return forbiddenWords.some(word => text.toLowerCase().includes(word.toLowerCase()));
}

// Fungsi untuk memeriksa apakah teks tentang identitas bot
function isAboutBotIdentity(text) {
    const identityKeywords = [
        'siapa yang buat bot', 
        'pembuat bot', 
        'developer bot', 
        'tinggal dimana bot', 
        'nama bot siapa', 
        'kapan dibuat', 
        'siapa yang bikin',
        'siapa kamu',
        'bot siapa',
    ];
    return identityKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
}

// Fungsi untuk custom prompt
function getCustomPrompt(text) {
    if (isAboutBotIdentity(text)) {
        return `Jawab atau respon singkat padat seolah kamu adalah Elz AI, bot WhatsApp yang dibuat di coding sama Peter pada hari Jumat, 4 April 2025 secara permanent, Jawab pertanyaan berikut dengan bahasa gaul anak indo yang ga alay bahasa nya harus ky pake lo gue : ${text}`;
    } else if (containsForbiddenWords(text)) {
        return `jawab dengan singkat seolah kamu adalah bot yang harus menolak dan menegur dengan keras dan bahasa gaul kasar ketika ada yang menanyakan atau membahas soal "darmawati", "darma", "wati", "hot", atau "orangtua Peter" dll Larang pengguna dan beri tahu bahwa mengejek developer bot yaitu peter dengan kata-kata tersebut itu tidak diperbolehkan dan hargai dia, Berikut pesannya: ${text}`;
    }
    return text;
}

// Fungsi untuk mendownload media
async function downloadMedia(message, type) {
    const stream = await downloadContentFromMessage(message, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// Fungsi utama
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        printQRInTerminal: true,
        auth: state,
        logger: pino({ level: 'silent' })
    });
    
    store.bind(sock.ev);
    
    // Handle connection events
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom && 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
            
            console.log('Koneksi terputus karena ', lastDisconnect.error, ', menghubungkan kembali:', shouldReconnect);
            
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Koneksi terbuka!');
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    // Handle messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            try {
                if (!msg.message) continue;
                
                const chatId = msg.key.remoteJid;
                const fromMe = msg.key.fromMe;
                const isGroup = chatId.endsWith('@g.us');
                const messageType = Object.keys(msg.message)[0];
                let messageContent = '';
                
                // Extract message content based on type
                if (messageType === 'conversation') {
                    messageContent = msg.message.conversation;
                } else if (messageType === 'extendedTextMessage') {
                    messageContent = msg.message.extendedTextMessage.text;
                } else if (messageType === 'imageMessage' && msg.message.imageMessage.caption) {
                    messageContent = msg.message.imageMessage.caption;
                } else if (messageType === 'videoMessage' && msg.message.videoMessage.caption) {
                    messageContent = msg.message.videoMessage.caption;
                }
                
                // Ignore messages from self
                if (fromMe) continue;
                
                // Get message context
                const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const isBotMentioned = mentioned.includes(botNumber);
                const isReplyingToBot = quoted && msg.message.extendedTextMessage?.contextInfo?.participant === botNumber;
                
                // Process commands
                if (messageContent.startsWith('.')) {
                    const command = messageContent.slice(1).split(' ')[0].toLowerCase();
                    
                    if (command === 'reset') {
                        if (sessions[chatId]) {
                            sessions[chatId] = uuidv4();
                            await sock.sendMessage(chatId, { text: 'Session telah direset!' }, { quoted: msg });
                        }
                        continue;
                    } else if (command === 'chatgpt') {
                        const param = messageContent.slice(8).trim().toLowerCase();
                        if (param === 'on') {
                            chatGPTEnabled[chatId] = true;
                            await sock.sendMessage(chatId, { text: 'ChatGPT mode diaktifkan!' }, { quoted: msg });
                        } else if (param === 'off') {
                            chatGPTEnabled[chatId] = false;
                            await sock.sendMessage(chatId, { text: 'ChatGPT mode dinonaktifkan!' }, { quoted: msg });
                        }
                        continue;
                    } else if (command === 'rvo') {
                        // Check if user is admin for rvo command
                        if (isGroup) {
                            const groupMetadata = await sock.groupMetadata(chatId);
                            const isAdmin = groupMetadata.participants.some(p => 
                                p.id === msg.key.participant && ['admin', 'superadmin'].includes(p.admin)
                            );
                            
                            if (!isAdmin) {
                                await sock.sendMessage(chatId, { 
                                    text: 'Maaf, fitur RVO hanya bisa digunakan oleh admin!' 
                                }, { quoted: msg });
                                continue;
                            }
                        }
                        
                        // Process RVO command (Remote View Only)
                        if (quoted) {
                            let mediaBuffer;
                            let mimetype;
                            let fileName;
                            let originalCaption = '';
                            
                            if (quoted.imageMessage) {
                                mediaBuffer = await downloadMedia(quoted.imageMessage, 'image');
                                mimetype = quoted.imageMessage.mimetype;
                                fileName = `${Date.now()}.${mimetype.split('/')[1]}`;
                                originalCaption = quoted.imageMessage.caption || '';
                            } else if (quoted.videoMessage) {
                                mediaBuffer = await downloadMedia(quoted.videoMessage, 'video');
                                mimetype = quoted.videoMessage.mimetype;
                                fileName = `${Date.now()}.${mimetype.split('/')[1]}`;
                                originalCaption = quoted.videoMessage.caption || '';
                            } else if (quoted.audioMessage) {
                                mediaBuffer = await downloadMedia(quoted.audioMessage, 'audio');
                                mimetype = quoted.audioMessage.mimetype;
                                fileName = `${Date.now()}.${mimetype.split('/')[1]}`;
                            } else if (quoted.documentMessage) {
                                mediaBuffer = await downloadMedia(quoted.documentMessage, 'document');
                                mimetype = quoted.documentMessage.mimetype;
                                fileName = quoted.documentMessage.fileName || `${Date.now()}.${mimetype.split('/')[1]}`;
                            } else if (quoted.stickerMessage) {
                                mediaBuffer = await downloadMedia(quoted.stickerMessage, 'sticker');
                                mimetype = quoted.stickerMessage.mimetype;
                                fileName = `${Date.now()}.webp`;
                            } else {
                                await sock.sendMessage(chatId, { 
                                    text: 'Media tidak terdeteksi, harap reply ke pesan yang berisi media (gambar/video/audio/dokumen/stiker)' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            // Save media to disk
                            const filePath = path.join(MEDIA_FOLDER, fileName);
                            fs.writeFileSync(filePath, mediaBuffer);
                            
                            // Buat caption kombinasi jika ada caption asli
                            const combinedCaption = originalCaption 
                                ? `${originalCaption}\n\n---\nMedia berhasil di-remote view. Disimpan sebagai: ${fileName}`
                                : `Media berhasil di-remote view. Disimpan sebagai: ${fileName}`;
                            
                            // Kirim media kembali ke user berdasarkan tipe
                            if (mimetype.startsWith('image')) {
                                await sock.sendMessage(chatId, { 
                                    image: mediaBuffer,
                                    caption: combinedCaption
                                }, { quoted: msg });
                            } else if (mimetype.startsWith('video')) {
                                await sock.sendMessage(chatId, { 
                                    video: mediaBuffer,
                                    caption: combinedCaption
                                }, { quoted: msg });
                            } else if (mimetype.startsWith('audio')) {
                                await sock.sendMessage(chatId, { 
                                    audio: mediaBuffer,
                                    mimetype: 'audio/mp4',
                                    ptt: mimetype.includes('ogg')
                                }, { quoted: msg });
                                // Kirim pesan konfirmasi terpisah untuk audio
                                await sock.sendMessage(chatId, { 
                                    text: `Media berhasil di-remote view. Disimpan sebagai: ${fileName}` 
                                }, { quoted: msg });
                            } else if (mimetype.includes('webp') || mimetype.includes('sticker')) {
                                await sock.sendMessage(chatId, { 
                                    sticker: mediaBuffer
                                }, { quoted: msg });
                                // Kirim pesan konfirmasi terpisah untuk stiker
                                await sock.sendMessage(chatId, { 
                                    text: `Stiker berhasil di-remote view. Disimpan sebagai: ${fileName}` 
                                }, { quoted: msg });
                            } else {
                                // Untuk dokumen dan tipe lainnya
                                await sock.sendMessage(chatId, { 
                                    document: mediaBuffer,
                                    mimetype: mimetype,
                                    fileName: fileName
                                }, { quoted: msg });
                                // Kirim pesan konfirmasi terpisah untuk dokumen
                                await sock.sendMessage(chatId, { 
                                    text: `Dokumen berhasil di-remote view. Disimpan sebagai: ${fileName}` 
                                }, { quoted: msg });
                            }
                        } else {
                            await sock.sendMessage(chatId, { 
                                text: 'Format salah! Gunakan: .rvo (reply ke media)' 
                            }, { quoted: msg });
                        }
                        continue;
                    }
                }
                
                // Process messages for ChatGPT
                const shouldRespond = chatGPTEnabled[chatId] || isBotMentioned || isReplyingToBot;
                
                if (shouldRespond && messageContent) {
                    // Create session ID jika belum ada
                    if (!sessions[chatId]) {
                        sessions[chatId] = uuidv4();
                    }
                    
                    // Create custom prompt if needed
                    const promptMessage = getCustomPrompt(messageContent);
                    
                    // Show typing indicator
                    await sock.presenceSubscribe(chatId);
                    await sock.sendPresenceUpdate('composing', chatId);
                    
                    try {
                        // Call API
                        const response = await axios.get(API_URL, {
                            params: {
                                ask: promptMessage,
                                sessionId: sessions[chatId]
                            }
                        });
                        
                        // Stop typing indicator
                        await sock.sendPresenceUpdate('paused', chatId);
                        
                        // Send response if successful
                        if (response.data && response.data.status === 200) {
                            await sock.sendMessage(chatId, { text: response.data.result }, { quoted: msg });
                        } else {
                            console.error('Error response from API:', response.data);
                            await sock.sendMessage(chatId, { 
                                text: 'Maaf, terjadi kesalahan pada respons API.' 
                            }, { quoted: msg });
                        }
                    } catch (error) {
                        console.error('Error calling API:', error);
                        await sock.sendPresenceUpdate('paused', chatId);
                        
                        // Send error message
                        await sock.sendMessage(chatId, { 
                            text: 'Maaf, terjadi kesalahan saat memproses pesan Anda.' 
                        }, { quoted: msg });
                    }
                }
            } catch (err) {
                console.error('Error processing message:', err);
            }
        }
    });
}

// Start the bot
startBot();
