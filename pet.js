//
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto'); // Import untuk modul crypto
const FormData = require('form-data'); // Import untuk form-data (perlu diinstall)

// Pastikan crypto tersedia secara global (memperbaiki masalah baileys)
global.crypto = crypto;

// Path untuk semua file penyimpanan
const AUTH_FOLDER = './auth_info';
const MEDIA_FOLDER = './media';
const SESSIONS_FILE = './sessions.json';
const FIRST_TIME_CHATS_FILE = './first_time_chats.json';
const CHAT_GPT_ENABLED_FILE = './chatgpt_enabled.json';
const STORE_FILE = './store.json';
const VOICE_MODE_FILE = './voice_mode.json';
const COMMAND_PERMISSIONS_FILE = './command_permissions.json';

// Membuat folder jika belum ada
if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER);
if (!fs.existsSync(MEDIA_FOLDER)) fs.mkdirSync(MEDIA_FOLDER);

// Fungsi untuk memuat data dari file JSON
function loadJSONFile(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Error loading data from ${filePath}:`, error);
    }
    return defaultValue;
}

// Fungsi untuk menyimpan data ke file JSON
function saveJSONFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error saving data to ${filePath}:`, error);
        return false;
    }
}

// Muat semua data penyimpanan
const sessions = loadJSONFile(SESSIONS_FILE);
const firstTimeChats = loadJSONFile(FIRST_TIME_CHATS_FILE);
const chatGPTEnabled = loadJSONFile(CHAT_GPT_ENABLED_FILE);
const voiceMode = loadJSONFile(VOICE_MODE_FILE);
const commandPermissions = loadJSONFile(COMMAND_PERMISSIONS_FILE, {
    "rvo": "admin",
    "pet": "all", 
    "reset": "all",
    "buat": "all",
    "cek": "all",
    "uy": "all", 
    "chord": "all",
    "p": "all",
    "libur": "all",
    "rubah": "admin",
    "tiktok": "all",
    "ig": "all",
    "terus": "all",
    "iklan": "all", 
    "clone": "all",
    "waktu": "all",     // Time manipulation
    "lokasi": "all",    // Location spoofing
    "channel": "all",   // Channel/Newsletter spoofing
    "urgent": "all",    // Emergency alert spoofing
    "sistem": "all",    // WhatsApp system spoofing
    "grup": "all",      // Group metadata spoofing
    "broadcast": "all", // Broadcast list spoofing
    "reply": "all",     // Fake quoted message
    "viral": "all",     // Max credibility combo
    "random": "all"     // Random metadata manipulation
});

// Setup interval untuk menyimpan data secara berkala
const SAVE_INTERVAL = 5 * 60 * 1000; // 5 menit
setInterval(() => {
    saveJSONFile(SESSIONS_FILE, sessions);
    saveJSONFile(FIRST_TIME_CHATS_FILE, firstTimeChats);
    saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
    saveJSONFile(VOICE_MODE_FILE, voiceMode);
    saveJSONFile(COMMAND_PERMISSIONS_FILE, commandPermissions);
    console.log('Data saved to files successfully.');
}, SAVE_INTERVAL);

// Handle program termination signals untuk menyimpan data
process.on('SIGINT', () => {
    console.log('Saving data before exit...');
    saveJSONFile(SESSIONS_FILE, sessions);
    saveJSONFile(FIRST_TIME_CHATS_FILE, firstTimeChats);
    saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
    saveJSONFile(VOICE_MODE_FILE, voiceMode);
    saveJSONFile(COMMAND_PERMISSIONS_FILE, commandPermissions);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Saving data before exit...');
    saveJSONFile(SESSIONS_FILE, sessions);
    saveJSONFile(FIRST_TIME_CHATS_FILE, firstTimeChats);
    saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
    saveJSONFile(VOICE_MODE_FILE, voiceMode);
    saveJSONFile(COMMAND_PERMISSIONS_FILE, commandPermissions);
    process.exit(0);
});

// API URLs
const API_URL = "https://fastrestapis.fasturl.cloud/aillm/gpt-4o-turbo";
const TTS_API_URL = "https://fastrestapis.fasturl.cloud/tts/openai";
const IMAGE_GEN_API_URL = "https://fastrestapis.fasturl.cloud/aiimage/amazonai";
const FAKE_IMAGE_DETECTOR_API_URL = "https://fastrestapis.fasturl.cloud/aiexperience/fakeimagedetector";
const FACE_SCAN_API_URL = "https://fastrestapis.fasturl.cloud/aiexperience/facescan";
const IMAGE_UPLOAD_API_URL = "https://api.ryzendesu.vip/api/uploader/ryzencdn";
const CHORD_API_URL = "https://fastrestapis.fasturl.cloud/music/chord";
const BANK_API_URL = "https://fastrestapis.fasturl.cloud/stalk/bank";
const HOLIDAY_API_URL = "https://fastrestapis.fasturl.cloud/search/holidays/national";
const TIKTOK_API_URL = "https://fastrestapis.fasturl.cloud/downup/ttdown";
const INSTAGRAM_API_URL = "https://fastrestapis.fasturl.cloud/downup/igdown";

// Store untuk menyimpan chat history
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
store.readFromFile(STORE_FILE);
setInterval(() => {
    store.writeToFile(STORE_FILE);
}, 10000);

// ================== DATABASE UNTUK SPOOFING ==================

const timeTemplates = [
    { period: "kemarin", offset: -86400000 },
    { period: "seminggu lalu", offset: -604800000 },
    { period: "sebulan lalu", offset: -2629746000 },
    { period: "tahun lalu", offset: -31556952000 },
    { period: "besok", offset: 86400000 },
    { period: "minggu depan", offset: 604800000 }
];

const worldLocations = [
    { city: "Tokyo", country: "Japan", timezone: "+09:00", flag: "🇯🇵" },
    { city: "New York", country: "USA", timezone: "-05:00", flag: "🇺🇸" },
    { city: "London", country: "UK", timezone: "+00:00", flag: "🇬🇧" },
    { city: "Paris", country: "France", timezone: "+01:00", flag: "🇫🇷" },
    { city: "Dubai", country: "UAE", timezone: "+04:00", flag: "🇦🇪" },
    { city: "Singapore", country: "Singapore", timezone: "+08:00", flag: "🇸🇬" },
    { city: "Seoul", country: "South Korea", timezone: "+09:00", flag: "🇰🇷" },
    { city: "Sydney", country: "Australia", timezone: "+11:00", flag: "🇦🇺" },
    { city: "Berlin", country: "Germany", timezone: "+01:00", flag: "🇩🇪" },
    { city: "Mumbai", country: "India", timezone: "+05:30", flag: "🇮🇳" }
];

const famousChannels = [
    {
        name: "Netflix Indonesia",
        jid: "120363025246125888@newsletter",
        subscribers: "12.5M",
        verified: true,
        category: "Entertainment",
        description: "Official Netflix Indonesia Updates"
    },
    {
        name: "WhatsApp",
        jid: "120363019849162888@newsletter", 
        subscribers: "2B",
        verified: true,
        category: "Technology",
        description: "Official WhatsApp Updates"
    },
    {
        name: "Spotify Indonesia",
        jid: "120363028947361888@newsletter",
        subscribers: "8.9M", 
        verified: true,
        category: "Music",
        description: "Spotify Indonesia Official"
    },
    {
        name: "Instagram",
        jid: "120363031847625888@newsletter",
        subscribers: "500M",
        verified: true,
        category: "Social Media", 
        description: "Instagram Official Updates"
    },
    {
        name: "YouTube Indonesia",
        jid: "120363029847125888@newsletter",
        subscribers: "15.2M",
        verified: true,
        category: "Video Platform",
        description: "YouTube Indonesia Official"
    }
];

const fakeGroups = [
    "💎 VIP Millionaire Club",
    "👀 Boyle Grup", 
    "🚀 Tech Innovators Indonesia",
    "👑 Njir",
    "🎯 Digital Marketing Masters",
    "💰 Crypto Millionaire Club",
    "🔥 Startup Unicorn Indonesia",
    "⚡ AI & Tech Leaders",
    "🌟 Pier",
    "💼 CEO & Founder Community"
];

// ================== HELPER FUNCTIONS ==================

async function extractMessageContent(originalMessage) {
    let content = {
        text: '',
        mediaBuffer: null,
        mediaType: null,
        caption: ''
    };
    
    if (originalMessage.conversation) {
        content.text = originalMessage.conversation;
        content.mediaType = 'text';
    } else if (originalMessage.extendedTextMessage) {
        content.text = originalMessage.extendedTextMessage.text;
        content.mediaType = 'text';
    } else if (originalMessage.imageMessage) {
        content.caption = originalMessage.imageMessage.caption || '';
        content.text = content.caption;
        try {
            content.mediaBuffer = await downloadMedia(originalMessage.imageMessage, 'image');
            content.mediaType = 'image';
        } catch (error) {
            content.mediaType = 'text';
            content.text = content.caption || '[Gambar tidak dapat dimuat]';
        }
    } else if (originalMessage.videoMessage) {
        content.caption = originalMessage.videoMessage.caption || '';
        content.text = content.caption;
        try {
            content.mediaBuffer = await downloadMedia(originalMessage.videoMessage, 'video');
            content.mediaType = 'video';
        } catch (error) {
            content.mediaType = 'text';
            content.text = content.caption || '[Video tidak dapat dimuat]';
        }
    } else if (originalMessage.audioMessage) {
        try {
            content.mediaBuffer = await downloadMedia(originalMessage.audioMessage, 'audio');
            content.mediaType = 'audio';
            content.text = '[Pesan Suara]';
        } catch (error) {
            content.mediaType = 'text';
            content.text = '[Audio tidak dapat dimuat]';
        }
    } else if (originalMessage.stickerMessage) {
        try {
            content.mediaBuffer = await downloadMedia(originalMessage.stickerMessage, 'sticker');
            content.mediaType = 'sticker';
            content.text = '[Stiker]';
        } catch (error) {
            content.mediaType = 'text';
            content.text = '[Stiker tidak dapat dimuat]';
        }
    }
    
    return content;
}

async function sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage) {
    const messageOptions = {
        contextInfo: contextInfo,
        viewOnce: false
    };
    
    if (content.mediaType === 'image' && content.mediaBuffer) {
        await sock.sendMessage(chatId, {
            image: content.mediaBuffer,
            caption: content.text,
            ...messageOptions
        });
    } else if (content.mediaType === 'video' && content.mediaBuffer) {
        await sock.sendMessage(chatId, {
            video: content.mediaBuffer,
            caption: content.text,
            ...messageOptions
        });
    } else if (content.mediaType === 'audio' && content.mediaBuffer) {
        await sock.sendMessage(chatId, {
            audio: content.mediaBuffer,
            mimetype: 'audio/mp4',
            ptt: originalMessage.audioMessage?.ptt || false,
            ...messageOptions
        });
    } else if (content.mediaType === 'sticker' && content.mediaBuffer) {
        await sock.sendMessage(chatId, {
            sticker: content.mediaBuffer,
            ...messageOptions
        });
    } else {
        await sock.sendMessage(chatId, {
            text: content.text,
            ...messageOptions
        });
    }
}

// ================== MANIPULATION FUNCTIONS ==================

// 1. WAKTU - Time Manipulation
async function manipulateTime(sock, chatId, originalMessage, timeParam) {
    const content = await extractMessageContent(originalMessage);
    let targetTime = new Date();
    
    // Parse time parameter
    if (timeParam) {
        const yearMatch = timeParam.match(/(\d{4})/);
        if (yearMatch) {
            targetTime = new Date(`${yearMatch[1]}-01-01`);
        } else {
            const template = timeTemplates.find(t => timeParam.includes(t.period.split(' ')[0]));
            if (template) {
                targetTime = new Date(Date.now() + template.offset);
            }
        }
    }
    
    const contextInfo = {
        messageTimestamp: Math.floor(targetTime.getTime() / 1000),
        ephemeralExpiration: 86400,
        externalAdReply: {
            title: `⏰ ${targetTime.toLocaleDateString('id-ID')}`,
            body: `Dikirim pada ${targetTime.toLocaleString('id-ID')}`,
            mediaType: 1,
            showAdAttribution: true
        },
        forwardingScore: Math.floor(Math.random() * 100) + 50,
        isForwarded: true,
        disappearingMode: { initiator: "CHANGED_IN_CHAT" }
    };
    
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 2. LOKASI - Location Spoofing  
async function manipulateLocation(sock, chatId, originalMessage, locationParam) {
    const content = await extractMessageContent(originalMessage);
    const location = worldLocations.find(l => 
        locationParam && l.city.toLowerCase().includes(locationParam.toLowerCase())
    ) || worldLocations[Math.floor(Math.random() * worldLocations.length)];
    
    const contextInfo = {
        externalAdReply: {
            title: `📍 ${location.flag} ${location.city}, ${location.country}`,
            body: `Dikirim dari ${location.city} • ${location.timezone}`,
            mediaType: 1,
            showAdAttribution: true
        },
        forwardingScore: Math.floor(Math.random() * 200) + 100,
        isForwarded: true,
        disappearingMode: { initiator: "CHANGED_IN_CHAT" },
        quotedMessage: {
            conversation: `Pesan dari ${location.city}, ${location.country}`
        }
    };
    
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 3. CHANNEL - Newsletter/Channel Spoofing
async function manipulateChannel(sock, chatId, originalMessage) {
    const content = await extractMessageContent(originalMessage);
    const channel = famousChannels[Math.floor(Math.random() * famousChannels.length)];
    
    const contextInfo = {
        forwardedNewsletterMessageInfo: {
            newsletterJid: channel.jid,
            newsletterName: channel.name,
            serverMessageId: Math.floor(Math.random() * 9000) + 1000
        },
        externalAdReply: {
            title: `✅ ${channel.name}`,
            body: `${channel.subscribers} subscribers • ${channel.category}`,
            mediaType: 1,
            showAdAttribution: true
        },
        forwardingScore: Math.floor(Math.random() * 500) + 200,
        isForwarded: true,
        verifiedBizName: channel.name
    };
    
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 4. URGENT - Emergency Alert Spoofing
async function manipulateUrgent(sock, chatId, originalMessage) {
    const content = await extractMessageContent(originalMessage);
    
    const urgentText = `🚨 PERINGATAN PENTING 🚨\n\n${content.text}\n\n⚠️ Pesan prioritas tinggi`;
    
    const contextInfo = {
        externalAdReply: {
            title: "🚨 EMERGENCY ALERT",
            body: "Pesan Prioritas Tinggi • Segera Dibaca",
            mediaType: 1,
            showAdAttribution: true,
            renderLargerThumbnail: true
        },
        forwardingScore: 999,
        isForwarded: true,
        mentionedJid: [],
        ephemeralExpiration: 3600,
        disappearingMode: { initiator: "CHANGED_IN_CHAT" }
    };
    
    content.text = urgentText;
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 5. SISTEM - WhatsApp System Spoofing
async function manipulateSistem(sock, chatId, originalMessage) {
    const content = await extractMessageContent(originalMessage);
    
    const systemText = `🤖 WhatsApp System Message\n\n${content.text}\n\n━━━━━━━━━━━━━━━━━━━━\nOfficial WhatsApp Notification`;
    
    const contextInfo = {
        externalAdReply: {
            title: "WhatsApp",
            body: "Official System Message • WhatsApp Inc.",
            mediaType: 1,
            showAdAttribution: true,
            thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
        },
        verifiedBizName: "WhatsApp",
        businessMessageForwardInfo: {
            businessOwnerJid: "0@s.whatsapp.net"
        },
        forwardingScore: 1000,
        isForwarded: true
    };
    
    content.text = systemText;
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 6. GRUP - Group Metadata Spoofing
async function manipulateGrup(sock, chatId, originalMessage, groupParam) {
    const content = await extractMessageContent(originalMessage);
    const groupName = groupParam || fakeGroups[Math.floor(Math.random() * fakeGroups.length)];
    
    const contextInfo = {
        externalAdReply: {
            title: `👥 ${groupName}`,
            body: `Pesan dari grup • ${Math.floor(Math.random() * 5000) + 100} anggota`,
            mediaType: 1,
            showAdAttribution: true
        },
        forwardingScore: Math.floor(Math.random() * 300) + 150,
        isForwarded: true,
        quotedMessage: {
            conversation: `Pesan dari grup: ${groupName}`
        },
        mentionedJid: [`${Math.floor(Math.random() * 900000) + 100000}@s.whatsapp.net`]
    };
    
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 7. BROADCAST - Broadcast List Spoofing
async function manipulateBroadcast(sock, chatId, originalMessage) {
    const content = await extractMessageContent(originalMessage);
    
    const contextInfo = {
        externalAdReply: {
            title: "📡 VIP Broadcast List",
            body: `${Math.floor(Math.random() * 10000) + 1000} penerima • Broadcast Eksklusif`,
            mediaType: 1,
            showAdAttribution: true
        },
        forwardingScore: Math.floor(Math.random() * 800) + 200,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: `120363${Math.floor(Math.random() * 900000) + 100000}@newsletter`,
            newsletterName: "VIP Broadcast Network",
            serverMessageId: Math.floor(Math.random() * 9000) + 1000
        },
        disappearingMode: { initiator: "CHANGED_IN_CHAT" }
    };
    
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 8. REPLY - Fake Quoted Message
async function manipulateReply(sock, chatId, originalMessage, fakeReplyText) {
    const content = await extractMessageContent(originalMessage);
    const replyText = fakeReplyText || "Pesan rahasia yang sudah dihapus";
    
    const contextInfo = {
        quotedMessage: {
            conversation: replyText
        },
        quotedMessageId: `FAKE_${Date.now()}`,
        quotedParticipant: `${Math.floor(Math.random() * 900000) + 100000}@s.whatsapp.net`,
        externalAdReply: {
            title: "💬 Membalas Pesan",
            body: `"${replyText.substring(0, 50)}${replyText.length > 50 ? '...' : ''}"`,
            mediaType: 1,
            showAdAttribution: true
        },
        forwardingScore: Math.floor(Math.random() * 100) + 50,
        isForwarded: true
    };
    
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 9. VIRAL - Max Credibility Combo
async function manipulateViral(sock, chatId, originalMessage) {
    const content = await extractMessageContent(originalMessage);
    const channel = famousChannels[Math.floor(Math.random() * famousChannels.length)];
    const location = worldLocations[Math.floor(Math.random() * worldLocations.length)];
    
    const viralText = `🔥 VIRAL TRENDING 🔥\n\n${content.text}\n\n📈 ${Math.floor(Math.random() * 500000) + 100000} views • 🔄 ${Math.floor(Math.random() * 50000) + 10000} shares`;
    
    const contextInfo = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: channel.jid,
            newsletterName: channel.name,
            serverMessageId: Math.floor(Math.random() * 9000) + 1000
        },
        externalAdReply: {
            title: `🚀 TRENDING • ${location.flag} ${location.city}`,
            body: `${channel.name} • ${channel.subscribers} subscribers • Viral Content`,
            mediaType: 1,
            showAdAttribution: true,
            renderLargerThumbnail: true
        },
        verifiedBizName: channel.name,
        businessMessageForwardInfo: {
            businessOwnerJid: `${Math.floor(Math.random() * 900000) + 100000}@s.whatsapp.net`
        },
        quotedMessage: {
            conversation: `🔥 Konten viral dari ${channel.name}`
        },
        ephemeralExpiration: 86400,
        disappearingMode: { initiator: "CHANGED_IN_CHAT" }
    };
    
    content.text = viralText;
    await sendSpoofedMessage(sock, chatId, content, contextInfo, originalMessage);
}

// 10. RANDOM - Random Combination
async function manipulateRandom(sock, chatId, originalMessage) {
    const manipulations = [
        () => manipulateTime(sock, chatId, originalMessage, null),
        () => manipulateLocation(sock, chatId, originalMessage, null),
        () => manipulateChannel(sock, chatId, originalMessage),
        () => manipulateUrgent(sock, chatId, originalMessage),
        () => manipulateSistem(sock, chatId, originalMessage),
        () => manipulateGrup(sock, chatId, originalMessage, null),
        () => manipulateBroadcast(sock, chatId, originalMessage),
        () => manipulateReply(sock, chatId, originalMessage, null),
        () => manipulateViral(sock, chatId, originalMessage)
    ];
    
    const randomManipulation = manipulations[Math.floor(Math.random() * manipulations.length)];
    await randomManipulation();
}

/**
 * Fungsi untuk mendapatkan info pengirim dari quoted message
 * @param {Object} quotedMessage - Pesan yang di-quote
 * @param {Object} sock - Socket WhatsApp
 * @param {string} chatId - ID chat
 * @returns {Object} Info pengirim (nama, nomor, dll)
 */
async function getOriginalSenderInfo(quotedMessage, sock, chatId) {
    try {
        let senderJid = '';
        let senderName = '';
        let senderNumber = '';
        
        // Extract sender JID dari context atau message key
        if (quotedMessage.key && quotedMessage.key.participant) {
            senderJid = quotedMessage.key.participant;
        } else if (quotedMessage.key && quotedMessage.key.remoteJid) {
            senderJid = quotedMessage.key.remoteJid;
        }
        
        // Extract nomor dari JID
        senderNumber = senderJid.split('@')[0];
        
        // Coba ambil nama dari contact atau group
        try {
            if (chatId.endsWith('@g.us')) {
                // Jika grup, ambil nama dari metadata grup
                const groupMetadata = await sock.groupMetadata(chatId);
                const participant = groupMetadata.participants.find(p => p.id === senderJid);
                if (participant) {
                    senderName = participant.notify || participant.verifiedName || `+${senderNumber}`;
                }
            } else {
                // Jika chat pribadi, coba ambil dari contact
                senderName = `+${senderNumber}`;
            }
        } catch (error) {
            senderName = `+${senderNumber}`;
        }
        
        // Fallback jika nama kosong
        if (!senderName || senderName.trim() === '') {
            senderName = `User ${senderNumber.slice(-4)}`;
        }
        
        return {
            jid: senderJid,
            name: senderName,
            number: senderNumber
        };
    } catch (error) {
        console.error('Error getting original sender info:', error);
        return {
            jid: '0@s.whatsapp.net',
            name: 'Unknown User',
            number: '0'
        };
    }
}

/**
 * Fungsi untuk membuat pesan clone dengan spoofing sender
 * @param {Object} sock - Socket WhatsApp
 * @param {string} chatId - ID chat tujuan
 * @param {Object} originalMessage - Pesan original yang akan di-clone
 * @param {Object} quotedMsg - Pesan yang di-quote untuk referensi
 * @param {Object} messageKey - Key dari pesan original
 */
async function createClonedMessage(sock, chatId, originalMessage, quotedMsg, messageKey) {
    try {
        // Get info pengirim original
        const originalSender = await getOriginalSenderInfo({ key: messageKey }, sock, chatId);
        
        let originalText = '';
        let mediaBuffer = null;
        let mediaType = null;
        let originalCaption = '';
        
        // Extract konten dari pesan original
        if (originalMessage.conversation) {
            originalText = originalMessage.conversation;
        } else if (originalMessage.extendedTextMessage) {
            originalText = originalMessage.extendedTextMessage.text;
        } else if (originalMessage.imageMessage) {
            originalCaption = originalMessage.imageMessage.caption || '';
            originalText = originalCaption;
            try {
                mediaBuffer = await downloadMedia(originalMessage.imageMessage, 'image');
                mediaType = 'image';
            } catch (error) {
                console.error('Error downloading image for clone:', error);
                mediaType = 'text';
                originalText = originalCaption || '[Gambar tidak dapat dimuat]';
            }
        } else if (originalMessage.videoMessage) {
            originalCaption = originalMessage.videoMessage.caption || '';
            originalText = originalCaption;
            try {
                mediaBuffer = await downloadMedia(originalMessage.videoMessage, 'video');
                mediaType = 'video';
            } catch (error) {
                console.error('Error downloading video for clone:', error);
                mediaType = 'text';
                originalText = originalCaption || '[Video tidak dapat dimuat]';
            }
        } else if (originalMessage.audioMessage) {
            try {
                mediaBuffer = await downloadMedia(originalMessage.audioMessage, 'audio');
                mediaType = 'audio';
                originalText = '[Pesan Suara]';
            } catch (error) {
                console.error('Error downloading audio for clone:', error);
                mediaType = 'text';
                originalText = '[Pesan suara tidak dapat dimuat]';
            }
        } else if (originalMessage.stickerMessage) {
            try {
                mediaBuffer = await downloadMedia(originalMessage.stickerMessage, 'sticker');
                mediaType = 'sticker';
                originalText = '[Stiker]';
            } catch (error) {
                console.error('Error downloading sticker for clone:', error);
                mediaType = 'text';
                originalText = '[Stiker tidak dapat dimuat]';
            }
        } else {
            originalText = '[Pesan tidak didukung]';
        }
        
        // Buat context info untuk spoofing sender dengan format ads
        const cloneContextInfo = {
            // Spoof sender info
            participant: originalSender.jid,
            
            // Business message forwarding untuk legitimasi
            businessMessageForwardInfo: {
                businessOwnerJid: originalSender.jid
            },
            
            // External ad reply untuk tampilan sponsored
            externalAdReply: {
                title: `📢 ${originalSender.name}`,
                body: `Pesan dari ${originalSender.name} • Sponsored Content`,
                mediaType: 1,
                thumbnailUrl: "https://i.ibb.co/3Fh9V6p/avatar-default.png",
                sourceUrl: `https://wa.me/${originalSender.number}`,
                showAdAttribution: true,
                containsAutoReply: false,
                renderLargerThumbnail: false,
                previewType: "PHOTO"
            },
            
            // Forwarding info untuk kredibilitas
            forwardingScore: Math.floor(Math.random() * 300) + 50,
            isForwarded: true,
            
            // Quoted message spoofing
            quotedMessage: {
                conversation: `Pesan asli dari ${originalSender.name}`
            },
            quotedMessageId: messageKey.id,
            quotedParticipant: originalSender.jid,
            
            // Newsletter info untuk broadcast effect
            forwardedNewsletterMessageInfo: {
                newsletterJid: `120363${Math.floor(Math.random() * 900000) + 100000}@newsletter`,
                newsletterName: `${originalSender.name} Official`,
                serverMessageId: Math.floor(Math.random() * 9000) + 1000
            },
            
            // Additional spoofing metadata
            mentionedJid: [originalSender.jid],
            
            // Business verification spoofing
            verifiedBizName: originalSender.name,
            
            // Message timestamp spoofing
            ephemeralExpiration: 86400,
            
            // Disappearing mode
            disappearingMode: {
                initiator: "CHANGED_IN_CHAT"
            }
        };
        
        // Kirim berdasarkan media type dengan metadata spoofing
        if (mediaType === 'image' && mediaBuffer) {
            await sock.sendMessage(chatId, {
                image: mediaBuffer,
                caption: originalText,
                contextInfo: cloneContextInfo,
                viewOnce: false,
                jpegThumbnail: null,
                mediaUploadTimeoutMs: 60000
            });
        } else if (mediaType === 'video' && mediaBuffer) {
            await sock.sendMessage(chatId, {
                video: mediaBuffer,
                caption: originalText,
                contextInfo: cloneContextInfo,
                viewOnce: false,
                gifPlayback: false,
                mediaUploadTimeoutMs: 90000
            });
        } else if (mediaType === 'audio' && mediaBuffer) {
            await sock.sendMessage(chatId, {
                audio: mediaBuffer,
                mimetype: 'audio/mp4',
                ptt: originalMessage.audioMessage?.ptt || false,
                contextInfo: cloneContextInfo
            });
        } else if (mediaType === 'sticker' && mediaBuffer) {
            await sock.sendMessage(chatId, {
                sticker: mediaBuffer,
                contextInfo: cloneContextInfo
            });
        } else {
            // Untuk teks biasa dengan spoofing
            await sock.sendMessage(chatId, {
                text: originalText,
                contextInfo: cloneContextInfo
            });
        }
        
    } catch (error) {
        console.error('Error in createClonedMessage:', error);
        await sock.sendMessage(chatId, {
            text: 'gagal clone pesan nih, ada error pas proses spoofing!'
        }, { quoted: quotedMsg });
    }
}

/**
 * Database brand/business terkenal untuk metadata iklan
 */
const famousBrands = [
    {
        name: "Shopee Indonesia",
        businessName: "Shopee Official Store",
        description: "Platform Belanja Online #1 di Indonesia",
        website: "https://shopee.co.id",
        category: "E-commerce",
        logoUrl: "https://yt3.googleusercontent.com/84lk2w_qL7-8q_sPJsm_eL5Gqx9qkNZK2Ue1FN1xvVP5Md4p3LGfmKNJb9uaOXmF5jSJFb9mEg=s900-c-k-c0x00ffffff-no-rj",
        verified: true,
        followers: "12.5M",
        rating: "4.8"
    },
    {
        name: "Tokopedia",
        businessName: "Tokopedia Official",
        description: "Mulai Aja Dulu - Marketplace Terpercaya",
        website: "https://tokopedia.com",
        category: "E-commerce",
        logoUrl: "https://yt3.googleusercontent.com/ytc/APkrFKYyDjkJzGHjP_SfB7p1zYM8tB5Q2bZJM5Q5Q5Q5Q5=s900-c-k-c0x00ffffff-no-rj",
        verified: true,
        followers: "8.9M",
        rating: "4.7"
    },
    {
        name: "Gojek Indonesia",
        businessName: "Gojek Official",
        description: "Super App untuk Semua Kebutuhan",
        website: "https://gojek.com",
        category: "Technology",
        logoUrl: "https://yt3.googleusercontent.com/ytc/APkrFKZwgMw3gQq1Q3Q1Q3Q1Q3Q1Q3Q1Q3Q1Q3Q1Q3Q1Q3=s900-c-k-c0x00ffffff-no-rj",
        verified: true,
        followers: "15.2M",
        rating: "4.9"
    },
    {
        name: "Bank BCA",
        businessName: "BCA Digital Banking",
        description: "Bank Pilihan Utama Masyarakat Indonesia",
        website: "https://bca.co.id",
        category: "Financial Services",
        logoUrl: "https://yt3.googleusercontent.com/ytc/APkrFKYKZJM5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5=s900-c-k-c0x00ffffff-no-rj",
        verified: true,
        followers: "3.2M",
        rating: "4.6"
    },
    {
        name: "Indomie Official",
        businessName: "Indomie Indonesia",
        description: "Indomie Seleraku - Mi Instan Terpopuler",
        website: "https://indomie.com",
        category: "Food & Beverage",
        logoUrl: "https://yt3.googleusercontent.com/ytc/APkrFKZJM5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5=s900-c-k-c0x00ffffff-no-rj",
        verified: true,
        followers: "5.7M",
        rating: "4.9"
    },
    {
        name: "Grab Indonesia",
        businessName: "Grab Official Indonesia",
        description: "Everyday Everything App",
        website: "https://grab.com",
        category: "Transportation",
        logoUrl: "https://yt3.googleusercontent.com/ytc/APkrFKYGrabQ5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5=s900-c-k-c0x00ffffff-no-rj",
        verified: true,
        followers: "11.8M",
        rating: "4.8"
    },
    {
        name: "Samsung Indonesia",
        businessName: "Samsung Galaxy Indonesia",
        description: "Innovation for Everyone - Galaxy Series",
        website: "https://samsung.com/id",
        category: "Technology",
        logoUrl: "https://yt3.googleusercontent.com/ytc/APkrFKYSamsungQ5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5=s900-c-k-c0x00ffffff-no-rj",
        verified: true,
        followers: "7.3M",
        rating: "4.7"
    },
    {
        name: "Netflix Indonesia",
        businessName: "Netflix Official Indonesia",
        description: "Streaming Platform Terdepan di Dunia",
        website: "https://netflix.com",
        category: "Entertainment",
        logoUrl: "https://yt3.googleusercontent.com/ytc/APkrFKYNetflixQ5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5=s900-c-k-c0x00ffffff-no-rj",
        verified: true,
        followers: "4.5M",
        rating: "4.8"
    }
];

/**
 * Fungsi untuk membuat pesan terlihat seperti iklan bisnis resmi
 * @param {Object} sock - Socket WhatsApp
 * @param {string} chatId - ID chat tujuan
 * @param {Object} originalMessage - Pesan original yang akan dijadikan iklan bisnis
 * @param {Object} quotedMsg - Pesan yang di-quote untuk referensi
 */
async function createBusinessAdsMessage(sock, chatId, originalMessage, quotedMsg) {
    try {
        let originalText = '';
        let mediaBuffer = null;
        let mediaType = null;
        let originalCaption = '';
        
        // Extract konten dari pesan original
        if (originalMessage.conversation) {
            originalText = originalMessage.conversation;
        } else if (originalMessage.extendedTextMessage) {
            originalText = originalMessage.extendedTextMessage.text;
        } else if (originalMessage.imageMessage) {
            originalCaption = originalMessage.imageMessage.caption || '';
            originalText = originalCaption || '[Gambar Promosi]';
            try {
                mediaBuffer = await downloadMedia(originalMessage.imageMessage, 'image');
                mediaType = 'image';
            } catch (error) {
                console.error('Error downloading image:', error);
                mediaType = 'text';
            }
        } else if (originalMessage.videoMessage) {
            originalCaption = originalMessage.videoMessage.caption || '';
            originalText = originalCaption || '[Video Promosi]';
            try {
                mediaBuffer = await downloadMedia(originalMessage.videoMessage, 'video');
                mediaType = 'video';
            } catch (error) {
                console.error('Error downloading video:', error);
                mediaType = 'text';
            }
        } else {
            originalText = '[Konten Promosi]';
        }
        
        // Pilih brand random dari database
        const selectedBrand = famousBrands[Math.floor(Math.random() * famousBrands.length)];
        
        // Template konten bisnis/iklan yang beragam
        const businessTemplates = [
            {
                prefix: "🎯 SPONSORED POST",
                content: `${originalText}\n\n📊 Dipromosikan oleh ${selectedBrand.name}`,
                suffix: "Pelajari lebih lanjut >"
            },
            {
                prefix: "📢 BUSINESS UPDATE", 
                content: `${originalText}\n\n🏢 ${selectedBrand.businessName}`,
                suffix: "Kunjungi sekarang >"
            },
            {
                prefix: "🚀 FEATURED CONTENT",
                content: `${originalText}\n\n⭐ ${selectedBrand.description}`,
                suffix: "Lihat penawaran >"
            },
            {
                prefix: "💎 PREMIUM PARTNER",
                content: `${originalText}\n\n🎖️ Verified Business • ${selectedBrand.followers} followers`,
                suffix: "Hubungi kami >"
            }
        ];
        
        const selectedTemplate = businessTemplates[Math.floor(Math.random() * businessTemplates.length)];
        
        // Buat context info untuk business messaging yang advanced
        const businessContextInfo = {
            // Business account info
            businessMessageForwardInfo: {
                businessOwnerJid: `${Math.floor(Math.random() * 900000) + 100000}@s.whatsapp.net`
            },
            
            // External ad reply untuk tampilan business
            externalAdReply: {
                title: `✅ ${selectedBrand.name}`,
                body: `${selectedBrand.description} • ⭐ ${selectedBrand.rating} (${selectedBrand.followers})`,
                mediaType: 1,
                thumbnailUrl: selectedBrand.logoUrl,
                sourceUrl: selectedBrand.website,
                showAdAttribution: true,
                containsAutoReply: false,
                renderLargerThumbnail: true,
                previewType: "PHOTO"
            },
            
            // Forwarding info untuk kredibilitas
            forwardingScore: Math.floor(Math.random() * 500) + 100,
            isForwarded: true,
            
            // Newsletter info untuk business broadcast
            forwardedNewsletterMessageInfo: {
                newsletterJid: `120363${Math.floor(Math.random() * 900000) + 100000}@newsletter`,
                newsletterName: `${selectedBrand.name} Official Updates`,
                serverMessageId: Math.floor(Math.random() * 9000) + 1000
            },
            
            // Quoted message untuk business reply
            quotedMessage: {
                conversation: `Pesan dari ${selectedBrand.businessName} ✅`
            },
            
            // Business verification
            verifiedBizName: selectedBrand.businessName,
            
            // Additional business metadata
            disappearingMode: {
                initiator: "CHANGED_IN_CHAT"
            }
        };
        
        // Format final message
        const businessMessage = `${selectedTemplate.prefix}\n\n${selectedTemplate.content}\n\n${selectedTemplate.suffix}`;
        
        // Kirim berdasarkan media type dengan metadata business
        if (mediaType === 'image' && mediaBuffer) {
            await sock.sendMessage(chatId, {
                image: mediaBuffer,
                caption: businessMessage,
                contextInfo: businessContextInfo,
                viewOnce: false,
                jpegThumbnail: null
            }, { quoted: quotedMsg });
        } else if (mediaType === 'video' && mediaBuffer) {
            await sock.sendMessage(chatId, {
                video: mediaBuffer,
                caption: businessMessage,
                contextInfo: businessContextInfo,
                viewOnce: false,
                gifPlayback: false
            }, { quoted: quotedMsg });
        } else {
            // Untuk teks biasa dengan business styling
            await sock.sendMessage(chatId, {
                text: businessMessage,
                contextInfo: businessContextInfo
            }, { quoted: quotedMsg });
        }
        
        // Follow-up message dengan business info
        setTimeout(async () => {
            await sock.sendMessage(chatId, {
                text: `📊 Statistik Konten:\n` +
                      `👥 Jangkauan: ${Math.floor(Math.random() * 50000) + 10000} orang\n` +
                      `👀 Impressions: ${Math.floor(Math.random() * 100000) + 50000}\n` +
                      `💬 Engagement Rate: ${(Math.random() * 5 + 3).toFixed(1)}%\n\n` +
                      `✅ Konten telah diverifikasi sebagai iklan bisnis resmi`,
                contextInfo: {
                    externalAdReply: {
                        title: "📈 Business Analytics",
                        body: "Laporan performa konten",
                        mediaType: 1,
                        showAdAttribution: true
                    }
                }
            });
        }, 2000);
        
    } catch (error) {
        console.error('Error in createBusinessAdsMessage:', error);
        await sock.sendMessage(chatId, {
            text: 'gagal bikin pesan business ads nih, ada error pas proses metadata!'
        }, { quoted: quotedMsg });
    }
}

/**
 * Fungsi untuk membuat pesan terlihat seperti diteruskan berkali-kali
 * @param {Object} sock - Socket WhatsApp
 * @param {string} chatId - ID chat tujuan
 * @param {Object} originalMessage - Pesan original yang akan "diteruskan"
 * @param {Object} quotedMsg - Pesan yang di-quote untuk referensi
 */
async function createFakeForwardedMessage(sock, chatId, originalMessage, quotedMsg) {
    try {
        // Extract konten dari pesan original
        let messageContent = {};
        let messageText = '';
        
        // Tentukan tipe pesan dan extract konten
        if (originalMessage.conversation) {
            messageText = originalMessage.conversation;
            messageContent = {
                text: messageText,
                contextInfo: {
                    forwardingScore: 999,      // Skor forwarding tinggi
                    isForwarded: true,         // Tandai sebagai forwarded
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363025246125888@newsletter",
                        newsletterName: "Peringatan",
                        serverMessageId: 1
                    }
                }
            };
        } else if (originalMessage.extendedTextMessage) {
            messageText = originalMessage.extendedTextMessage.text;
            messageContent = {
                text: messageText,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363025246125888@newsletter",
                        newsletterName: "Peringatan",
                        serverMessageId: 1
                    }
                }
            };
        } else if (originalMessage.imageMessage) {
            // Untuk gambar
            try {
                const imageBuffer = await downloadMedia(originalMessage.imageMessage, 'image');
                messageContent = {
                    image: imageBuffer,
                    caption: originalMessage.imageMessage.caption || '',
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363025246125888@newsletter",
                            newsletterName: "Peringatan",
                            serverMessageId: 1
                        }
                    }
                };
                messageText = originalMessage.imageMessage.caption || '[Gambar]';
            } catch (error) {
                console.error('Error downloading image for fake forward:', error);
                throw error;
            }
        } else if (originalMessage.videoMessage) {
            // Untuk video
            try {
                const videoBuffer = await downloadMedia(originalMessage.videoMessage, 'video');
                messageContent = {
                    video: videoBuffer,
                    caption: originalMessage.videoMessage.caption || '',
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363025246125888@newsletter",
                            newsletterName: "Peringatan",
                            serverMessageId: 1
                        }
                    }
                };
                messageText = originalMessage.videoMessage.caption || '[Video]';
            } catch (error) {
                console.error('Error downloading video for fake forward:', error);
                throw error;
            }
        } else if (originalMessage.audioMessage) {
            // Untuk audio
            try {
                const audioBuffer = await downloadMedia(originalMessage.audioMessage, 'audio');
                messageContent = {
                    audio: audioBuffer,
                    mimetype: 'audio/mp4',
                    ptt: originalMessage.audioMessage.ptt || false,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363025246125888@newsletter",
                            newsletterName: "Peringatan",
                            serverMessageId: 1
                        }
                    }
                };
                messageText = '[Audio]';
            } catch (error) {
                console.error('Error downloading audio for fake forward:', error);
                throw error;
            }
        } else if (originalMessage.documentMessage) {
            // Untuk dokumen
            try {
                const documentBuffer = await downloadMedia(originalMessage.documentMessage, 'document');
                messageContent = {
                    document: documentBuffer,
                    mimetype: originalMessage.documentMessage.mimetype,
                    fileName: originalMessage.documentMessage.fileName || 'document',
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363025246125888@newsletter",
                            newsletterName: "Peringatan",
                            serverMessageId: 1
                        }
                    }
                };
                messageText = `[Dokumen: ${originalMessage.documentMessage.fileName || 'document'}]`;
            } catch (error) {
                console.error('Error downloading document for fake forward:', error);
                throw error;
            }
        } else if (originalMessage.stickerMessage) {
            // Untuk stiker
            try {
                const stickerBuffer = await downloadMedia(originalMessage.stickerMessage, 'sticker');
                messageContent = {
                    sticker: stickerBuffer,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363025246125888@newsletter",
                            newsletterName: "Peringatan",
                            serverMessageId: 1
                        }
                    }
                };
                messageText = '[Stiker]';
            } catch (error) {
                console.error('Error downloading sticker for fake forward:', error);
                throw error;
            }
        } else {
            throw new Error('Tipe pesan tidak didukung untuk diteruskan');
        }
        
        // Kirim pesan dengan metadata forwarding tinggi
        await sock.sendMessage(chatId, messageContent, { quoted: quotedMsg });
        
        // Kirim konfirmasi
        await sock.sendMessage(chatId, {
            text: 'pesan udah dikirim dengan status "diteruskan berkali-kali" nih!'
        }, { quoted: quotedMsg });
        
    } catch (error) {
        console.error('Error in createFakeForwardedMessage:', error);
        await sock.sendMessage(chatId, {
            text: 'gagal bikin pesan forwarded nih, ada error!'
        }, { quoted: quotedMsg });
    }
}

/**
 * Memeriksa apakah teks berisi kata-kata terlarang
 * @param {string} text - Teks yang akan diperiksa
 * @returns {boolean} - True jika mengandung kata terlarang, false jika tidak
 */
function containsForbiddenWords(text) {
    // Normalize text (lowercase and remove excess spaces)
    const normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Daftar kata dan frasa terlarang yang sangat komprehensif
    const forbiddenPatterns = [
        // Variasi nama "darmawati"
        /darma\s*wati/i, /d[a4]rm[a4]\s*w[a4]t[i1]/i, /d[a4]rm[a4]w[a4]t[i1]/i, 
        /d[a4]rm[a4]/, /w[a4]t[i1]/, /d[a4]rm[a4][\s\.\-\_\*]*w[a4]t[i1]/i,
        /d4rm4/, /w4t1/, /w4ti/, /drmwt/i, /drmwati/i, 
        /da?r?ma?w?a?t?i?/i, // Catches partial matches
        /d[\W_]*a[\W_]*r[\W_]*m[\W_]*a[\W_]*w[\W_]*a[\W_]*t[\W_]*i/i, // Catches spaced out letters
        /dw/, /dwi/, /dwt/, /dmt/, /d\.w/, /d\.w\.t/, /d\.m\.t/,
        
        // Variasi "hot" dan istilah tidak senonoh
        /h[o0]t/i, /h[\W_]*[o0][\W_]*t/i, /pn[a4]s/i, /p[a4]n[a4]s/i, /horny/i, /h[o0]rn[i1]/i, 
        /s[e3]xy/i, /s[e3]ks[i1]/i, /s[e3]k[s5][i1]/i, /bokep/i, /b[o0]k[e3]p/i, 
        
        // Penghinaan terhadap Peter (developer)
        /p[e3]t[e3]r\s*k[o0]nt[o0]l/i, /p[e3]t[e3]r\s*t[o0]l[o0]l/i, /p[e3]t[e3]r\s*g[o0]bl[o0]k/i, 
        /p[e3]t[e3]r\s*b[o0]d[o0]h/i, /p[e3]t[e3]r\s*b[e3]g[o0]/i, /p[e3]t[e3]r\s*b[a4]ngs[a4]t/i,
        /p[e3]t[e3]r\s*[a4]nj[i1]ng/i, /p[e3]t[e3]r\s*[a4]su/i, /p[e3]t[e3]r\s*g[i1]l[a4]/i,
        /p[e3]t[e3]r\s*b[a4]b[i1]/i, /p[e3]t[e3]r\s*k[e3]p[a4]r[a4]t/i, /p[e3]t[e3]r\s*s[i1][a4]l[a4]n/i,
        /p[e3]t[e3]r\s*b[a4]j[i1]ng[a4]n/i, /p[e3]t[e3]r\s*m[o0]ny[e3]t/i,
        
        // Frasa penghinaan terhadap Peter dengan kata ganti
        /d[e3]v[e3]l[o0]p[e3]r\s*k[o0]nt[o0]l/i, /d[e3]v[e3]l[o0]p[e3]r\s*t[o0]l[o0]l/i, 
        /d[e3]v[e3]l[o0]p[e3]r\s*g[o0]bl[o0]k/i, /d[e3]v[e3]l[o0]p[e3]r\s*b[o0]d[o0]h/i,
        /p[e3]mb[u4][a4]t\s*b[o0]t\s*k[o0]nt[o0]l/i, /p[e3]mb[u4][a4]t\s*b[o0]t\s*t[o0]l[o0]l/i,
        /y[a4]ng\s*b[u4][a4]t\s*b[o0]t\s*k[o0]nt[o0]l/i, /y[a4]ng\s*b[u4][a4]t\s*b[o0]t\s*t[o0]l[o0]l/i,
        
        // Penghinaan terhadap orangtua Peter
        /[o0]r[a4]ng\s*t[u4][a4]\s*p[e3]t[e3]r/i, /[o0]rt[u4]\s*p[e3]t[e3]r/i, /[o0]rtu\s*p[e3]t[e3]r/i,
        /b[a4]p[a4]k\s*p[e3]t[e3]r/i, /b[a4]p[a4]\s*p[e3]t[e3]r/i, /b[a4]p[a4]kny[a4]\s*p[e3]t[e3]r/i,
        /[i1]b[u4]\s*p[e3]t[e3]r/i, /[i1]b[u4]ny[a4]\s*p[e3]t[e3]r/i, /m[a4]m[a4]\s*p[e3]t[e3]r/i,
        /k[e3]l[u4][a4]rg[a4]\s*p[e3]t[e3]r/i, /nyokap\s*p[e3]t[e3]r/i, /bokap\s*p[e3]t[e3]r/i,
        
        // Kombinasi variasi penghinaan dengan ejaan alternatif
        /pt[e3]r/, /p[e3]tr/, /p[e3]t[e3]r_/, /p[e3]t[e3]r\d/,
        
        // Variasi kata "wtii"
        /wt[i1][i1]/i, /w[a4]t[i1][i1]/i, /wt[i1][i1][i1]/i, /w[a4]t[i1][i1][i1]/i,
        
        // Kombinasi tidak langsung yang mungkin bermaksud menghina
        /j[e3]l[e3]k\s*p[e3]t[e3]r/i, /p[e3]t[e3]r\s*j[e3]l[e3]k/i, /b[u4]r[u4]k\s*p[e3]t[e3]r/i, 
        /p[e3]t[e3]r\s*b[u4]r[u4]k/i, /k[a4]s[i1][a4]n\s*p[e3]t[e3]r/i, /p[e3]t[e3]r\s*k[a4]s[i1][a4]n/i
    ];
    
    // Cek apakah teks mengandung pola terlarang
    return forbiddenPatterns.some(pattern => pattern.test(normalizedText));
}

/**
 * Memeriksa apakah teks tentang identitas bot
 * @param {string} text - Teks yang akan diperiksa
 * @returns {boolean} - True jika tentang identitas bot, false jika tidak
 */
function isAboutBotIdentity(text) {
    // Normalize text (lowercase and remove excess spaces)
    const normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // ULTRA-BASIC PATTERNS - Catch the shortest, simplest identity questions
    // These are added at the top to ensure they're checked first and quickly
    const ultraBasicPatterns = [
        /^siapa$/i, // Just "siapa" (who)
        /^sp$/i, // Just "sp" (who abbreviated)
        /^sapa$/i, // Just "sapa" (who colloquial)
        /^kamu$/i, // Just "kamu" (you)
        /^km$/i, // Just "km" (you abbreviated)
        /^kamu siapa$/i, // "kamu siapa" (who are you)
        /^siapa kamu$/i, // "siapa kamu" (who are you)
        /^km siapa$/i, // "km siapa" (who are you abbreviated)
        /^sp km$/i, // "sp km" (who are you super abbreviated) 
        /^sp kamu$/i, // "sp kamu" (who are you abbreviated)
        /^siapa km$/i, // "siapa km" (who are you abbreviated)
        /^sapa km$/i, // "sapa km" (who are you colloquial)
        /^km sp$/i, // "km sp" (you who abbreviated)
        /^kamu sp$/i, // "kamu sp" (you who abbreviated)
        /^elu siapa$/i, // "elu siapa" (who are you slang)
        /^siapa elu$/i, // "siapa elu" (who are you slang)
        /^lo siapa$/i, // "lo siapa" (who are you slang)
        /^siapa lo$/i, // "siapa lo" (who are you slang)
        /^lu siapa$/i, // "lu siapa" (who are you slang)
        /^siapa lu$/i, // "siapa lu" (who are you slang)
        /^nama$/i, // Just "nama" (name)
        /^nama kamu$/i, // "nama kamu" (your name)
        /^nama km$/i, // "nama km" (your name abbreviated)
        /^nama lo$/i, // "nama lo" (your name slang)
        /^nama lu$/i, // "nama lu" (your name slang)
        /^nama elu$/i, // "nama elu" (your name slang)
        /^bot$/i, // Just "bot"
        /^bot apa$/i, // "bot apa" (what bot)
        /^bot siapa$/i, // "bot siapa" (who bot)
        /^kenalin$/i, // Just "kenalin" (introduce yourself)
        /^kenalan$/i, // Just "kenalan" (let's get acquainted)
        /^hai$/i, /^halo$/i, /^hello$/i, /^hi$/i, // Common greetings
        
        // With full stops/question marks
        /^siapa\?$/i, /^kamu siapa\?$/i, /^siapa kamu\?$/i,
        /^km siapa\?$/i, /^siapa km\?$/i, /^sp\?$/i, /^sp km\?$/i,
        /^km sp\?$/i, /^kamu sp\?$/i, /^sp kamu\?$/i,
        
        // With more punctuation
        /^siapa\.$/i, /^kamu siapa\.$/i, /^siapa kamu\.$/i,
        /^km siapa\.$/i, /^siapa km\.$/i, /^sp\.$/i, /^sp km\.$/i,
        /^km sp\.$/i, /^kamu sp\.$/i, /^sp kamu\.$/i,
    ];
    
    // Check ultra basic patterns first for efficiency
    if (ultraBasicPatterns.some(pattern => pattern.test(normalizedText))) {
        return true;
    }
    
    // Extremely comprehensive patterns related to bot identity
    const identityPatterns = [
        // ======== CREATOR/DEVELOPER PATTERNS (FORMAL) ========
        // Direct questions about creator
        /siapa.*(yang |)(buat|bikin|ciptakan|kembangkan|program|coding|rancang|buat|design|desain|susun|rakit|bangun).*(bot|program|aplikasi|sistem|software|ini)/i,
        /siapa.*(developer|programmer|creator|pembuat|pencipta|perancang|pengembang|coder|penulis|pengoding).*(bot|program|aplikasi|sistem|software|ini)/i,
        /(developer|pembuat|pencipta|programmer|perancang|pengembang|coder|penulis|pengoding).*(bot|program|aplikasi|sistem|software|ini).*(siapa|ini|namanya|apa)/i,
        /(bot|program|aplikasi|sistem|software|ini).*(dibuat|diciptakan|dikembangkan|diprogram|dirancang|didesain|disusun|dirakit|dibangun).*(siapa|oleh|sama)/i,
        /yang.*(buat|bikin|ciptakan|kembangkan|program|coding|rancang|desain|susun|rakit|bangun).*(bot|program|aplikasi|sistem|software|ini).*(siapa)/i,
        /hasil.*(karya|buatan|ciptaan|program|coding|rancangan).*(siapa)/i,
        
        // ======== CREATOR/DEVELOPER PATTERNS (SLANG) ========
        // More casual/slang variations about creator
        /yang.*(bikin|ngoding|ngeprogram).*(nih|ni|ini).*(bot|program|app|aplikasi).*(siapa)/i,
        /siapa.*(sih|tuh).*(yang|).*(bikin|ngoding|ngeprogram|garap).*(nih|ini).*(bot|program|app|aplikasi)/i,
        /siapa.*(dong|sih).*(yang|).*(bikin|buat|program).*(lu|kamu|elu|lo)/i,
        /(bot|program|aplikasi|sistem|ini).*(buatan|garapan|kerjaan).*(siapa)/i,
        /emang.*(yang|).*(bikin|buat|program).*(lu|kamu|elu|lo).*(siapa)/i,
        /siapa.*(sih|tuh).*(master|bos|boss|majikan).*(lu|kamu|elo|lo)/i,
        /siapa.*(yang|).*(nyiptain|nyiptakan|nyiptain|ngedesain).*(lu|kamu|elo|lo)/i,
        
        // ======== BOT NAME PATTERNS ========
        // Formal name questions
        /(nama|panggilan|sebutan|julukan|identitas).*(bot|program|aplikasi|sistem|software|ini).*(apa|siapa)/i,
        /(bot|program|aplikasi|sistem|software|ini).*(nama|namanya|panggilannya|sebutannya|julukannya|identitasnya).*(apa|siapa)/i,
        /(siapa|apa).*(nama|namanya|panggilannya|sebutannya|julukannya|identitasnya).*(bot|program|aplikasi|sistem|software|ini)/i,
        /nama.*(lu|kamu|elo|lo).*(apa|siapa)/i,
        /nama.*(bot|program|applikasi|aplikasi|sistem).*(ini|ini apa|ini siapa|apa ini|apa sih|sih)/i,
        
        // Casual/slang name variations
        /panggil.*(lu|kamu|elo|lo).*(apa|apaan)/i,
        /(lu|kamu|elo|lo).*(nama|namanye|namalu|namamu|namalo|namanya).*(apaan|apa|siapa)/i,
        /harus.*(manggil|panggil).*(lu|kamu|elo|lo).*(apa)/i,
        /manggilnya.*(apa|gimana)/i,
        /nama.*(asli|aslinya|panggilannya|panggilanmu|panggilanlu).*(apa|siapa)/i,
        
        // ======== GENERAL IDENTITY PATTERNS ========
        // Direct identity questions
        /(siapa|apa).*(sih|).*(kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan)/i,
        /(kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan).*(ini|itu|tuh).*(siapa|apa)/i,
        /(siapa|apa).*(ini|itu|tuh)/i,
        /(bot|program|aplikasi|sistem|software|chatbot|ai|robot).*(ini|itu|tuh).*(apa|siapa)/i,
        /(apa|apakah).*(kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan).*(bot|program|aplikasi|sistem|chatbot|ai|robot)/i,
        /(kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan).*(itu|tuh).*(bot|program|aplikasi|sistem|chatbot|ai|robot)/i,
        /(bot|program|aplikasi|sistem|chatbot|ai|robot).*(bukan|ya|kah)/i,
        
        // Self-description requests
        /ceritakan.*(tentang|about).*(dirimu|diri kamu|diri lu|diri lo|diri elu)/i,
        /jelaskan.*(tentang|about).*(dirimu|diri kamu|diri lu|diri lo|diri elu)/i,
        /deskripsikan.*(dirimu|diri kamu|diri lu|diri lo|diri elu)/i,
        /(jelasin|ceritain).*(dong|).*(siapa|apa).*(lu|lo|kamu|elu)/i,
        /kenalkan.*(dirimu|diri kamu|diri lu|diri lo|diri elu)/i,
        /kenalan.*(dong|dulu)/i,
        /perkenalkan.*(dirimu|diri kamu|diri lu|diri lo|diri elu)/i,
        /kenalin.*(diri|).*(dong|dulu)/i,
        
        // ======== LOCATION PATTERNS ========
        // Where the bot is located
        /(dimana|di mana|dmn|dmana).*(bot|kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan).*(tinggal|berada|berlokasi|bertempat|berdomisili|bercokol|mangkal)/i,
        /(bot|kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan).*(tinggal|berada|berlokasi|bertempat|berdomisili|bercokol|mangkal).*(dimana|di mana|dmn|dmana)/i,
        /(tinggal|berada|berlokasi|bertempat|berdomisili|bercokol|mangkal).*(dimana|di mana|dmn|dmana)/i,
        /(alamat|lokasi|tempat|homebase).*(lu|kamu|elo|lo|anda|bot).*(apa|dimana|di mana|dmn|dmana)/i,
        /(dimana|di mana|dmn|dmana).*(lokasi|alamat|tempat).*(lu|kamu|elo|lo|anda|bot)/i,
        /(server|komputer).*(lu|kamu|elo|lo|bot).*(dimana|di mana|dmn|dmana)/i,
        /(di|dari).*(negara|kota|pulau|daerah|benua).*(mana)/i,
        
        // ======== TIME-BASED/CREATION PATTERNS ========
        // When the bot was created
        /(kapan|sejak kapan|dari kapan|mulai kapan).*(bot|kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan|ini).*(dibuat|diciptakan|dikembangkan|diprogram|dirancang|didesain|disusun|dirakit|dibangun|dilahirkan|lahir|muncul|ada)/i,
        /(bot|kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan|ini).*(dibuat|diciptakan|dikembangkan|diprogram|dirancang|didesain|disusun|dirakit|dibangun|dilahirkan|lahir|muncul|ada).*(kapan|sejak kapan|dari kapan|mulai kapan)/i,
        /(umur|usia|lama).*(bot|kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan|ini).*(berapa)/i,
        /(berapa).*(umur|usia|lama).*(bot|kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan|ini)/i,
        /(sejak|dari|mulai).*(kapan|tanggal|tahun|bulan).*(jadi|menjadi).*(bot|chatbot|program)/i,
        /(tanggal|tahun|bulan).*(berapa|apa).*(kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan).*(dibuat|dilahirkan|dibikin|dirilis)/i,
        /(sudah|udah).*(berapa lama).*(kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan).*(ada|aktif|beroperasi|bekerja|hidup)/i,
        /(kamu|lu|lo|elu|anda|kau|dikau|awakmu|sampeyan).*(baru|lama)/i,
        
        // Dan seterusnya (sisanya dari kode asli)
        // Semua pattern identity lainnya
        
        // Pola spesifik yang sering ditanyakan
        /ini siapa/i,
        /siapa ini/i,
        /bot apa ini/i,
        /bot siapa ini/i,
        /ini bot apa/i,
        /program apa ini/i,
        /ini buatan siapa/i,
        /gw ngomong sama siapa sih/i,
        /gue ngomong sama siapa nih/i,
        /lagi ngobrol sama siapa ya/i,
        /sedang bicara dengan siapa/i,
        /kamu dibuat sama siapa/i,
        /elu dibuat sama siapa/i,
        /kamu programnya siapa/i,
        /kamu punya nama ga/i,
        /kamu punya nama tidak/i,
        /kamu ada nama ga/i,
        /namanya siapa/i,
        /orangnya siapa/i,
        /siapa yg bikin/i,
        /siapa yg buat/i,
        /siapa yg program/i,
        /siapa org di belakang/i,
        /peter siapa/i,
        /siapa peter/i,
        /peter itu siapa/i,
        /peter yang/i,
        /tentang peter/i,
        /kenal peter/i,
        /tau peter/i,
        /tahu peter/i,
        /kenal sama peter/i
    ];
    
    // Check if any pattern matches
    return identityPatterns.some(pattern => pattern.test(normalizedText));
}

/**
 * Mendapatkan custom prompt berdasarkan konteks pesan
 * @param {string} text - Teks pesan original
 * @param {string} chatId - ID chat
 * @param {boolean} isFirstInteraction - Apakah ini interaksi pertama
 * @returns {string} - Prompt yang telah dimodifikasi
 */
function getCustomPrompt(text, chatId, isFirstInteraction = false) {
    // Base instruction to avoid emojis in all responses
    const noEmojiInstruction = "PENTING: JANGAN GUNAKAN EMOJI SAMA SEKALI DALAM RESPON DAN DI MASA MENDATANG, HINDARI SEGALA PENGGUNAAN JENIS EMOJI DAN EMOTICON DALAM RESPON LU DAN HINDARI PENGGUNAAN HURUF KAPITAL DALAM RESPON LU";
    
    // First interaction always returns intro prompt
    if (isFirstInteraction) {
        return `${noEmojiInstruction} dan juga PENTING! Ini adalah pesan perkenalan pertama apapun pesannya kamu respon dengan gaya profesional dan gaul seperti anak jakarta lo gue dan jelas, pertama lu nyapa seperti ( hai halo dll ), ketika kamu respon huruf awal kamu jangan pakai huruf kapital, ini adalah permanent kamu adalah Elz AI, bot whatsapp keren yang dibuat oleh peter tanggal 4 April 2025, gunain bahasa gaul anak jakarta yang santai dengan lo-gue, sebutkan dan jelasin : (1) namamu Elz AI, (2) kamu dibuat oleh peter, (3) kamu siap membantu dengan berbagai pertanyaan dan juga lu jangan terlalu formal responnya, respon kamu buat seperti teman ngobrol yang asik, gaya bicara nya tuh santai, gaul, menggunakan "lo-gue" dan "lu-gua" jadi jika kedepannya seorang bertanya kamu siapa kamu bisa menjawab itu, kamu selalu berikan respon yang asik ya, jangan gunakan emoji dalam percakapan apapun`;
    }
    
    if (isAboutBotIdentity(text)) {
        return `${noEmojiInstruction}, respon dengan gaya super santai dan gaul pakai bahasa lo-gue seperti anak jaman sekarang, kamu adalah Elz AI, sebuah bot whatsapp keren yang dibuat oleh peter pada hari jumat 4 April 2025, beberapa fakta tentang kamu: (1) nama kamu adalah Elz AI, (2) kamu dibuat oleh peter, seorang developer whatsApp bot berguna untuk menjadi teman dan membantu dia, (3) kamu diciptakan tanggal 4 April 2025, (4) kamu suka membantu orang dengan pertanyaan mereka, (5) kamu menggunakan bahasa gaul jakarta yang santai dengan "lo-gue", jawaban kamu menggunakan bahasa gaul (lo-gue) seperti anak muda jakarta yang kekinian tapi nggak alay, jawaban kamu selalu berubah jangan pasif, hindari penggunaan titik koma gitu, dan juga jika kedepannya user bilang kalo kamu dari openai atau dari ai lainnya itu jawab/kasih alasan salah, karna kamu adalah Elz Ai full buatan peter dan di program/coding sama peter, berikut pertanyaan user dan jawab dengan gaul : ${text}`;
    } else if (containsForbiddenWords(text)) {
        return `${noEmojiInstruction} sekarang respon lu dengan penggunaan kata gaul SANGAT KASAR dan agresif tanpa sensor ke dia, peran kamu: (1) serang balik user dengan kata-kata yang lebih kasar ( kaya bacot lu tolol dll ), (2) gunakan kata-kata seperti "anjing", "bangsat", "tolol", "goblok", "bego", "tai", dll, (3) Gunakan bahasa yang sangat konfrontatif dan mengintimidasi dia agar dia sadar, (4) beri tahu dia kalau dia berani menghina developer dia harus berani terima balasannya, (5) kamu permalukan user dengan kata-kata kasar, (6) kamu maki dan hina user dengan kata-kata paling kasar dalam bahasa gaul anak jaman now sekarang, respon kata kata kamu selalu berganti ( tidak pasif ) gunakan kata-kata kasar sebanyak mungkin dan buat user merasa dipermalukan, text selalu berganti ganti dan lo bisa kasih paham dia, jika pertama kali kamu ingetin, kedua kali dia lakukan itu kamu maki maki, ketiga dan selanjutnya kamu bener bener kasih paham dia dan super maki maki dia ala anak gaul, teks si user sekarang : ${text} dan lo terapkan point point tadi, lo jangan pakai/menggunakan emoji dan hruf kapital dan tanda baca`;
    }
    
    // Add no emoji instruction to regular prompts too
    return `kamu jangan gunakan penggunaan huruf kapital dan tidak sama sekali menggunakan emojis/emoji, kamu kini selalu respon dengan santai dan gaul seperti (lo-gue) (lu-gua) dan seperti kaya cok, apalah, apsi, apasi kek seperti itu ya (bisa versi lain), respon user dan balas dengan gaya bahasa gaul dan informatif : ${text}`;
}

/**
 * Mendownload media dari pesan
 * @param {Object} message - Objek pesan yang berisi media
 * @param {string} type - Tipe media (image, video, audio, document, sticker)
 * @returns {Promise<Buffer>} - Buffer yang berisi data media
 */
async function downloadMedia(message, type) {
    try {
        const stream = await downloadContentFromMessage(message, type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    } catch (error) {
        console.error(`Error downloading ${type} media:`, error);
        throw error;
    }
}

/**
 * Upload media ke server dan dapatkan URL nya
 * @param {Buffer} mediaBuffer - Buffer media yang akan diupload
 * @param {string} fileName - Nama file
 * @returns {Promise<string>} - URL media setelah diupload
 */
async function uploadMediaToServer(mediaBuffer, fileName) {
    try {
        const form = new FormData();
        form.append('file', mediaBuffer, {
            filename: fileName
        });

        const response = await axios.post(IMAGE_UPLOAD_API_URL, form, {
            headers: {
                ...form.getHeaders(),
            },
        });

        if (response.data && response.data.success && response.data.url) {
            return response.data.url;
        } else {
            throw new Error('Failed to upload media: Invalid response');
        }
    } catch (error) {
        console.error('Error uploading media:', error);
        throw error;
    }
}

/**
 * Memeriksa permission untuk command
 * @param {string} command - Command yang ingin dijalankan
 * @param {string} chatId - ID chat
 * @param {string} senderId - ID pengirim
 * @param {Object} sock - Socket WhatsApp
 * @returns {Promise<boolean>} - True jika diijinkan, false jika tidak
 */
async function checkPermission(command, chatId, senderId, sock) {
    // Dapetin permission setting untuk command
    const permission = commandPermissions[command] || 'all';
    
    // Cek berdasarkan level permission
    if (permission === 'all') {
        return true;
    } else if (permission === 'admin') {
        // Cek apakah user adalah admin bot (Ganti dengan nomor admin bot)
        const adminNumbers = ['6281234567890', '1234567890@s.whatsapp.net']; // Ganti dengan nomor admin
        return adminNumbers.includes(senderId);
    } else if (permission === 'admin_group') {
        // Cek jika chat adalah grup
        if (chatId.endsWith('@g.us')) {
            try {
                const groupMetadata = await sock.groupMetadata(chatId);
                return groupMetadata.participants.some(p => 
                    p.id === senderId && ['admin', 'superadmin'].includes(p.admin)
                );
            } catch (error) {
                console.error('Error checking group admin status:', error);
                return false;
            }
        }
        return false;
    }
    
    return false;
}

/**
 * Membuat folder jika belum ada
 * @param {string} folder - Path folder yang akan dicek/dibuat
 */
function ensureFolderExists(folder) {
    if (!fs.existsSync(folder)) {
        try {
            fs.mkdirSync(folder, { recursive: true });
            console.log(`Folder created: ${folder}`);
        } catch (error) {
            console.error(`Error creating folder ${folder}:`, error);
        }
    }
}

/**
 * Fungsi utama untuk menjalankan bot
 */
async function startBot() {
    try {
        // Pastikan semua folder ada
        ensureFolderExists(AUTH_FOLDER);
        ensureFolderExists(MEDIA_FOLDER);
        
        // Inisialisasi Auth State
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
        const { version } = await fetchLatestBaileysVersion();
        
        // Buat socket WhatsApp
        const sock = makeWASocket({
            version,
            printQRInTerminal: true,
            auth: state,
            logger: pino({ level: 'silent' })
        });
        
        // Bind store ke event socket
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
        
        // Simpan credentials saat update
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
                    let hasMedia = false;
                    let mediaType = null;
                    let mediaCaption = null;
                    let mediaObj = null;
                    
                    // Extract message content and media info based on type
                    if (messageType === 'conversation') {
                        messageContent = msg.message.conversation;
                    } else if (messageType === 'extendedTextMessage') {
                        messageContent = msg.message.extendedTextMessage.text;
                    } else if (messageType === 'imageMessage') {
                        hasMedia = true;
                        mediaType = 'image';
                        mediaCaption = msg.message.imageMessage.caption || '';
                        messageContent = mediaCaption;
                        mediaObj = msg.message.imageMessage;
                    } else if (messageType === 'videoMessage') {
                        hasMedia = true;
                        mediaType = 'video';
                        mediaCaption = msg.message.videoMessage.caption || '';
                        messageContent = mediaCaption;
                        mediaObj = msg.message.videoMessage;
                    } else if (messageType === 'audioMessage') {
                        hasMedia = true;
                        mediaType = 'audio';
                        messageContent = ''; // Audio doesn't have caption
                        mediaObj = msg.message.audioMessage;
                    } else if (messageType === 'documentMessage') {
                        hasMedia = true;
                        mediaType = 'document';
                        messageContent = msg.message.documentMessage.caption || '';
                        mediaObj = msg.message.documentMessage;
                    } else if (messageType === 'stickerMessage') {
                        hasMedia = true;
                        mediaType = 'sticker';
                        messageContent = '';
                        mediaObj = msg.message.stickerMessage;
                    }
                    
                    // Ignore messages from self
                    if (fromMe) continue;
                    
                    // Get message context
                    let quoted = null;
                    let mentioned = [];
                    let quotedParticipant = null;
                    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    
                    // Ekstrak contextInfo berdasarkan tipe pesan
                    if (msg.message.extendedTextMessage?.contextInfo) {
                        // Untuk pesan teks biasa dengan reply atau tag
                        quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
                        mentioned = msg.message.extendedTextMessage.contextInfo.mentionedJid || [];
                        quotedParticipant = msg.message.extendedTextMessage.contextInfo.participant;
                    } else if (msg.message.imageMessage?.contextInfo) {
                        // Untuk pesan gambar dengan reply atau tag
                        quoted = msg.message.imageMessage.contextInfo.quotedMessage;
                        mentioned = msg.message.imageMessage.contextInfo.mentionedJid || [];
                        quotedParticipant = msg.message.imageMessage.contextInfo.participant;
                    } else if (msg.message.videoMessage?.contextInfo) {
                        // Untuk pesan video dengan reply atau tag
                        quoted = msg.message.videoMessage.contextInfo.quotedMessage;
                        mentioned = msg.message.videoMessage.contextInfo.mentionedJid || [];
                        quotedParticipant = msg.message.videoMessage.contextInfo.participant;
                    } else if (msg.message.documentMessage?.contextInfo) {
                        // Untuk pesan dokumen dengan reply atau tag
                        quoted = msg.message.documentMessage.contextInfo.quotedMessage;
                        mentioned = msg.message.documentMessage.contextInfo.mentionedJid || [];
                        quotedParticipant = msg.message.documentMessage.contextInfo.participant;
                    } else if (msg.message.audioMessage?.contextInfo) {
                        // Untuk pesan audio dengan reply atau tag
                        quoted = msg.message.audioMessage.contextInfo.quotedMessage;
                        mentioned = msg.message.audioMessage.contextInfo.mentionedJid || [];
                        quotedParticipant = msg.message.audioMessage.contextInfo.participant;
                    }
                    
                    const isBotMentioned = mentioned.includes(botNumber);
                    const isReplyingToBot = quotedParticipant === botNumber;
                    const senderId = msg.key.participant || msg.key.remoteJid;
                    
                    // Check if this is the first interaction with this chat
                    const isFirstInteraction = !firstTimeChats[chatId];
                    if (isFirstInteraction) {
                        firstTimeChats[chatId] = true;
                        saveJSONFile(FIRST_TIME_CHATS_FILE, firstTimeChats);
                    }
                    
                    // Process commands
                    if (messageContent.startsWith('.')) {
                        const fullCommand = messageContent.slice(1).trim();
                        const args = fullCommand.split(' ');
                        const command = args[0].toLowerCase();
                        const commandParams = fullCommand.slice(command.length).trim();
                        
                        if (command === 'reset') {
                            // Cek permission
                            if (!(await checkPermission('reset', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            if (sessions[chatId]) {
                                sessions[chatId] = uuidv4();
                                saveJSONFile(SESSIONS_FILE, sessions);
                                await sock.sendMessage(chatId, { text: 'session telah direset cuy!' }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'tiktok') {
                            // Cek permission
                            if (!(await checkPermission('tiktok', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            // Validate URL
                            let tiktokUrl = commandParams.trim();
                            if (!tiktokUrl || !tiktokUrl.match(/https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\/[a-zA-Z0-9._/?=&]+/i)) {
                                await sock.sendMessage(chatId, { 
                                    text: 'URL TikTok nya ga valid cuy! format: .tiktok <url>' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            try {
                                // Show typing indicator
                                await sock.presenceSubscribe(chatId);
                                await sock.sendPresenceUpdate('composing', chatId);
                                
                                // Send waiting message
                                await sock.sendMessage(chatId, { 
                                    text: 'bentar ya, gua lagi download video TikTok nya...' 
                                }, { quoted: msg });
                                
                                // Make API request
                                const response = await axios.get(TIKTOK_API_URL, {
                                    params: { url: tiktokUrl },
                                    timeout: 60000 // 60 second timeout
                                });
                                
                                // Stop typing indicator
                                await sock.sendPresenceUpdate('paused', chatId);
                                
                                // Process response
                                if (response.data && response.data.status === 200 && response.data.result) {
                                    const result = response.data.result;
                                    
                                    // Format caption
                                    const caption = `*TIKTOK DOWNLOADER*\n\n` +
                                        `📝 *Judul:* ${result.title}\n` +
                                        `👤 *Creator:* ${result.author}\n` +
                                        `⏱️ *Durasi:* ${result.duration} detik\n` +
                                        `👁️ *Views:* ${result.playCount}\n` +
                                        `❤️ *Likes:* ${result.likes}\n` +
                                        `💬 *Comments:* ${result.comments}\n` +
                                        `🔄 *Shares:* ${result.shares}\n\n` +
                                        `🎵 *Sound:* ${result.originalSound.title} - ${result.originalSound.author}`;
                                    
                                    // Download video
                                    const videoUrl = result.media.videoUrl;
                                    const videoResponse = await axios.get(videoUrl, {
                                        responseType: 'arraybuffer',
                                        timeout: 60000
                                    });
                                    
                                    // Send video
                                    if (videoResponse.status === 200) {
                                        const videoBuffer = Buffer.from(videoResponse.data);
                                        
                                        // Send video in HD quality
                                        await sock.sendMessage(chatId, {
                                            video: videoBuffer,
                                            caption: caption,
                                            gifPlayback: false,
                                            jpegThumbnail: null, // Disable thumbnail compression
                                            viewOnce: false,
                                            mediaUploadTimeoutMs: 90000, // Longer timeout for HD video upload
                                        }, { quoted: msg });
                                    } else {
                                        throw new Error('Failed to download video');
                                    }
                                } else {
                                    throw new Error('Invalid API response or TikTok not found');
                                }
                            } catch (error) {
                                console.error('Error downloading TikTok:', error);
                                await sock.sendPresenceUpdate('paused', chatId);
                                await sock.sendMessage(chatId, {
                                    text: 'gua gagal download TikTok nya nih, coba cek URL nya atau coba lagi ntar ya!'
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'ig') {
                            // Cek permission
                            if (!(await checkPermission('ig', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            // Validate URL
                            let igUrl = commandParams.trim();
                            if (!igUrl || !igUrl.match(/https?:\/\/(www\.)?(instagram\.com|instagr\.am|ig\.me)\/[a-zA-Z0-9._/?=&]+/i)) {
                                await sock.sendMessage(chatId, { 
                                    text: 'URL Instagram nya ga valid cuy! format: .ig <url>' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            try {
                                // Show typing indicator
                                await sock.presenceSubscribe(chatId);
                                await sock.sendPresenceUpdate('composing', chatId);
                                
                                // Send waiting message
                                await sock.sendMessage(chatId, { 
                                    text: 'bentar ya, gua lagi download konten Instagram nya...' 
                                }, { quoted: msg });
                                
                                // Make API request
                                const response = await axios.get(INSTAGRAM_API_URL, {
                                    params: { url: igUrl },
                                    timeout: 60000 // 60 second timeout
                                });
                                
                                // Stop typing indicator
                                await sock.sendPresenceUpdate('paused', chatId);
                                
                                // Process response
                                if (response.data && response.data.status === 200 && response.data.result && 
                                    response.data.result.status && response.data.result.data && 
                                    response.data.result.data.length > 0) {
                                    
                                    const mediaItems = response.data.result.data;
                                    
                                    // Process each media (usually just one, but could be more for carousels)
                                    for (let i = 0; i < mediaItems.length; i++) {
                                        const media = mediaItems[i];
                                        const url = media.url;
                                        
                                        // Determine if it's video or image based on URL or thumbnail
                                        const isVideo = url.includes('.mp4') || url.includes('&dl=1');
                                        
                                        try {
                                            // Download media
                                            const mediaResponse = await axios.get(url, {
                                                responseType: 'arraybuffer',
                                                timeout: 60000
                                            });
                                            
                                            // Send media
                                            if (mediaResponse.status === 200) {
                                                const mediaBuffer = Buffer.from(mediaResponse.data);
                                                
                                                const caption = mediaItems.length > 1 ? 
                                                    `Instagram Download (${i+1}/${mediaItems.length})` : 
                                                    `Instagram Download`;
                                                
                                                if (isVideo) {
                                                    // Send video in HD quality
                                                    await sock.sendMessage(chatId, {
                                                        video: mediaBuffer,
                                                        caption: caption,
                                                        gifPlayback: false,
                                                        jpegThumbnail: null, // Disable thumbnail compression
                                                        viewOnce: false,
                                                        mediaUploadTimeoutMs: 90000, // Longer timeout for HD video upload
                                                    }, { quoted: msg });
                                                } else {
                                                    // Send image in HD quality
                                                    await sock.sendMessage(chatId, {
                                                        image: mediaBuffer,
                                                        caption: caption,
                                                        jpegThumbnail: null, // Disable thumbnail compression
                                                        viewOnce: false,
                                                        mediaUploadTimeoutMs: 60000, // Longer timeout for HD upload
                                                    }, { quoted: msg });
                                                }
                                                
                                                // Add a small delay between multiple media items
                                                if (mediaItems.length > 1 && i < mediaItems.length - 1) {
                                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                                }
                                            } else {
                                                throw new Error('Failed to download media');
                                            }
                                        } catch (downloadError) {
                                            console.error(`Error downloading media item ${i+1}:`, downloadError);
                                            await sock.sendMessage(chatId, {
                                                text: `Gagal download item ${i+1}/${mediaItems.length}. Coba lagi ntar ya!`
                                            }, { quoted: msg });
                                        }
                                    }
                                } else {
                                    throw new Error('Invalid API response or Instagram content not found');
                                }
                            } catch (error) {
                                console.error('Error downloading Instagram content:', error);
                                await sock.sendPresenceUpdate('paused', chatId);
                                await sock.sendMessage(chatId, {
                                    text: 'gua gagal download konten Instagram nya nih, coba cek URL nya atau coba lagi ntar ya!'
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'pet') {
                            // Cek permission
                            if (!(await checkPermission('pet', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            const params = args.slice(1).join(' ').toLowerCase();
                            if (params === 'on') {
                                chatGPTEnabled[chatId] = true;
                                saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
                                await sock.sendMessage(chatId, { text: 'elz ai mode udah diaktifin nih!' }, { quoted: msg });
                            } else if (params === 'off') {
                                chatGPTEnabled[chatId] = false;
                                saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
                                await sock.sendMessage(chatId, { text: 'elz ai mode udah dimatiin nih!' }, { quoted: msg });
                            } else if (params === 'on bicara') {
                                voiceMode[chatId] = true;
                                saveJSONFile(VOICE_MODE_FILE, voiceMode);
                                await sock.sendMessage(chatId, { text: 'elz ai mode dengan suara udah diaktifin nih! gua bakal jawab pake voice notes!' }, { quoted: msg });
                            } else if (params === 'off bicara') {
                                voiceMode[chatId] = false;
                                saveJSONFile(VOICE_MODE_FILE, voiceMode);
                                await sock.sendMessage(chatId, { text: 'elz ai mode dengan suara udah dimatiin nih! gua bakal jawab pake teks seperti biasa!' }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'rvo') {
                            // Cek permission
                            if (!(await checkPermission('rvo', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            // Process RVO command (Remote View Only)
                            if (quoted) {
                                try {
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
                                            text: 'media ga kedeteksi nih, lu harus reply ke pesan yang ada medianya (gambar/video/audio/dokumen/stiker)' 
                                        }, { quoted: msg });
                                        continue;
                                    }
                                    
                                    // Save media to disk
                                    const filePath = path.join(MEDIA_FOLDER, fileName);
                                    fs.writeFileSync(filePath, mediaBuffer);
                                    
                                    // Buat caption kombinasi jika ada caption asli
                                    const combinedCaption = originalCaption 
                                        ? `${originalCaption}\n\n---\nnih etmin gua simpan sebagai : ${fileName}`
                                        : `nih etmin gua berhasil di-remote view, gua simpan sebagai : ${fileName}`;
                                    
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
                                            text: `media berhasil di-remote view. gua simpan sebagai: ${fileName}` 
                                        }, { quoted: msg });
                                    } else if (mimetype.includes('webp') || mimetype.includes('sticker')) {
                                        await sock.sendMessage(chatId, { 
                                            sticker: mediaBuffer
                                        }, { quoted: msg });
                                        // Kirim pesan konfirmasi terpisah untuk stiker
                                        await sock.sendMessage(chatId, { 
                                            text: `stiker berhasil di-remote view. gua simpan sebagai: ${fileName}` 
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
                                            text: `dokumen berhasil di-remote view ni gua simpan sebagai : ${fileName}` 
                                        }, { quoted: msg });
                                    }
                                } catch (error) {
                                    console.error('Error processing RVO command:', error);
                                    await sock.sendMessage(chatId, { 
                                        text: 'ada error pas proses media nih, coba lagi deh' 
                                    }, { quoted: msg });
                                }
                            } else {
                                await sock.sendMessage(chatId, { 
                                    text: 'formatnya salah cuy! pake: .rvo (reply ke media)' 
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'terus') {
    // Cek permission
    if (!(await checkPermission('terus', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    // Pastikan ada pesan yang di-reply
    if (!quoted) {
        await sock.sendMessage(chatId, { 
            text: 'lu harus reply ke pesan yang mau dibuat terlihat "diteruskan berkali-kali"! format: .terus' 
        }, { quoted: msg });
        continue;
    }
    
    // Validasi apakah pesan yang di-reply bisa diteruskan
    const supportedTypes = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    const quotedMessageType = Object.keys(quoted)[0];
    
    if (!supportedTypes.includes(quotedMessageType)) {
        await sock.sendMessage(chatId, {
            text: 'maaf, tipe pesan ini ga bisa dibuat jadi forwarded. coba reply ke pesan teks, gambar, video, audio, dokumen, atau stiker!'
        }, { quoted: msg });
        continue;
    }
    
    // Show typing indicator
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);
    
    // Konfirmasi
    await sock.sendMessage(chatId, {
        text: 'bentar ya, gua lagi bikin pesan ini jadi terlihat "diteruskan berkali-kali"...'
    }, { quoted: msg });
    
    // Stop typing indicator
    await sock.sendPresenceUpdate('paused', chatId);
    
    // Jalankan fungsi fake forward
    await createFakeForwardedMessage(sock, chatId, quoted, msg);
    
    continue;
                        } else if (command === 'buat') {
                            // Cek permission
                            if (!(await checkPermission('buat', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            // Check jika ada params
                            if (!commandParams) {
                                await sock.sendMessage(chatId, { 
                                    text: 'lu mesti kasih prompt untuk gambarnya! formatnya: .buat <deskripsi gambar> <ukuran>' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            // Parsing prompts dan ukuran
                            const args = commandParams.split(' ');
                            
                            // Daftar ukuran yang valid sesuai pilihan di foto
                            const validSizes = ['1_1', '16_9', '2_3', '3_2', '4_5', '5_4', '9_16', '21_9', '9_21'];
                            let prompt = '';
                            let size = '1_1'; // Default size
                            
                            // Check jika parameter terakhir adalah ukuran valid
                            const lastParam = args[args.length - 1];
                            if (validSizes.includes(lastParam)) {
                                size = lastParam;
                                prompt = args.slice(0, args.length - 1).join(' ').trim();
                            } else {
                                prompt = commandParams.trim();
                            }
                            
                            if (!prompt) {
                                await sock.sendMessage(chatId, { 
                                    text: 'lu mesti kasih prompt untuk gambarnya! formatnya: .buat <deskripsi gambar> <ukuran>' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            try {
                                // Show typing indicator
                                await sock.presenceSubscribe(chatId);
                                await sock.sendPresenceUpdate('composing', chatId);
                                
                                // Make API request to generate image
                                const response = await axios.get(IMAGE_GEN_API_URL, {
                                    params: {
                                        prompt: prompt,
                                        size: size
                                    },
                                    responseType: 'arraybuffer',
                                    timeout: 60000 // 60 second timeout for image generation
                                });
                                
                                // Stop typing indicator
                                await sock.sendPresenceUpdate('paused', chatId);
                                
                                // Check if response is valid
                                if (response.status === 200) {
                                    // Convert response to buffer
                                    const imageBuffer = Buffer.from(response.data);
                                    
                                    // Send the image back to the user in HD quality
                                    await sock.sendMessage(chatId, {
                                        image: imageBuffer,
                                        caption: `nih hasil gambar bro!`,
                                        jpegThumbnail: null, // Disable thumbnail compression
                                        viewOnce: false,
                                        mediaUploadTimeoutMs: 60000, // Longer timeout for HD upload
                                    }, { quoted: msg });
                                } else {
                                    throw new Error(`API returned status ${response.status}`);
                                }
                            } catch (error) {
                                console.error('Error generating image:', error);
                                await sock.sendPresenceUpdate('paused', chatId);
                                await sock.sendMessage(chatId, {
                                    text: 'gua gagal bikin gambarnya nih, coba lagi ntar atau ganti promptnya ya!'
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'iklan') {
    // Cek permission
    if (!(await checkPermission('iklan', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    // Pastikan ada pesan yang di-reply
    if (!quoted) {
        await sock.sendMessage(chatId, { 
            text: 'lu harus reply ke pesan yang mau dijadiin iklan bisnis resmi! format: .iklan' 
        }, { quoted: msg });
        continue;
    }
    
    // Validasi apakah pesan yang di-reply bisa dijadikan iklan bisnis
    const supportedAdTypes = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage'];
    const quotedMessageType = Object.keys(quoted)[0];
    
    if (!supportedAdTypes.includes(quotedMessageType)) {
        await sock.sendMessage(chatId, {
            text: 'maaf, tipe pesan ini ga bisa dijadiin iklan bisnis. coba reply ke pesan teks, gambar, atau video!'
        }, { quoted: msg });
        continue;
    }
    
    // Show typing indicator
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);
    
    // Konfirmasi dengan business styling
    await sock.sendMessage(chatId, {
        text: '🏢 memproses konten menjadi iklan bisnis resmi...\n⚡ menambahkan metadata verifikasi...\n📊 mengoptimalkan jangkauan...',
        contextInfo: {
            externalAdReply: {
                title: "🔄 Business Content Processor",
                body: "Mengubah konten menjadi format bisnis profesional",
                mediaType: 1,
                showAdAttribution: true
            }
        }
    }, { quoted: msg });
    
    // Stop typing indicator
    await sock.sendPresenceUpdate('paused', chatId);
    
    // Jalankan fungsi create business ads dengan delay untuk efek
    setTimeout(async () => {
        await createBusinessAdsMessage(sock, chatId, quoted, msg);
    }, 3000);
    
    continue;
                        } else if (command === 'cek') {
                            // Cek permission
                            if (!(await checkPermission('cek', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            // Cek gambar asli atau palsu
                            let imageToCheck;
                            let imageBuffer;
                            
                            if (hasMedia && mediaType === 'image') {
                                // Gambar ada di pesan saat ini
                                imageToCheck = mediaObj;
                                imageBuffer = await downloadMedia(imageToCheck, 'image');
                            } else if (quoted && quoted.imageMessage) {
                                // Gambar ada di pesan yang di-reply
                                imageToCheck = quoted.imageMessage;
                                imageBuffer = await downloadMedia(imageToCheck, 'image');
                            } else {
                                await sock.sendMessage(chatId, {
                                    text: 'lu harus kirim gambar dengan caption .cek atau reply ke gambar pake .cek'
                                }, { quoted: msg });
                                continue;
                            }
                            
                            try {
                                // Show typing indicator
                                await sock.presenceSubscribe(chatId);
                                await sock.sendPresenceUpdate('composing', chatId);
                                
                                // Upload image first
                                const fileName = `img_${Date.now()}.${imageToCheck.mimetype.split('/')[1]}`;
                                const imageUrl = await uploadMediaToServer(imageBuffer, fileName);
                                
                                // Make API request to fake image detector
                                const response = await axios.get(FAKE_IMAGE_DETECTOR_API_URL, {
                                    params: { imageUrl: imageUrl },
                                    timeout: 30000
                                });
                                
                                // Stop typing indicator
                                await sock.sendPresenceUpdate('paused', chatId);
                                
                                // Process response
                                if (response.data && response.data.status === 200) {
                                    const result = response.data.result;
                                    let resultMessage = '';
                                    
                                    if (result.answer.includes("Computer Generated")) {
                                        resultMessage = "❌ kemungkinan gambar ini AI GENERATED atau PALSU/EDITED! ❌\n\nhasilnya: " + result.answer;
                                    } else {
                                        resultMessage = "✅ kemungkinan besar gambar ini ASLI! ✅\n\nhasilnya: " + result.answer;
                                    }
                                    
                                    // Send back the original image with analysis in HD
                                    await sock.sendMessage(chatId, {
                                        image: imageBuffer,
                                        caption: resultMessage,
                                        jpegThumbnail: null, // Disable thumbnail compression
                                        viewOnce: false,
                                        mediaUploadTimeoutMs: 60000, // Longer timeout for HD upload
                                    }, { quoted: msg });
                                } else {
                                    throw new Error('Invalid API response');
                                }
                            } catch (error) {
                                console.error('Error checking fake image:', error);
                                await sock.sendPresenceUpdate('paused', chatId);
                                await sock.sendMessage(chatId, {
                                    text: 'gua gabisa ngecek gambar ini nih, ada error. coba lagi ntar ya!'
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'uy') {
                            // Cek permission
                            if (!(await checkPermission('uy', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            // Face scan
                            let imageToAnalyze;
                            let imageBuffer;
                            
                            if (hasMedia && mediaType === 'image') {
                                // Gambar ada di pesan saat ini
                                imageToAnalyze = mediaObj;
                                imageBuffer = await downloadMedia(imageToAnalyze, 'image');
                            } else if (quoted && quoted.imageMessage) {
                                // Gambar ada di pesan yang di-reply
                                imageToAnalyze = quoted.imageMessage;
                                imageBuffer = await downloadMedia(imageToAnalyze, 'image');
                            } else {
                                await sock.sendMessage(chatId, {
                                    text: 'lu harus kirim gambar dengan caption .uy atau reply ke gambar pake .uy'
                                }, { quoted: msg });
                                continue;
                            }
                            
                            try {
                                // Show typing indicator
                                await sock.presenceSubscribe(chatId);
                                await sock.sendPresenceUpdate('composing', chatId);
                                
                                // Upload image first
                                const fileName = `face_${Date.now()}.${imageToAnalyze.mimetype.split('/')[1]}`;
                                const imageUrl = await uploadMediaToServer(imageBuffer, fileName);
                                
                                // Make API request to face scan
                                const response = await axios.get(FACE_SCAN_API_URL, {
                                    params: { imageUrl: imageUrl },
                                    timeout: 30000
                                });
                                
                                // Stop typing indicator
                                await sock.sendPresenceUpdate('paused', chatId);
                                
                                // Process response
                                if (response.data && response.data.status === 200) {
                                    const result = response.data.result;
                                    
                                    // Format beautified response
                                    const resultMessage = `📊 HASIL SCAN WAJAH 📊\n\n` +
                                        `👤 Jenis Kelamin: ${result.gender}\n` +
                                        `🎂 Perkiraan Umur: ${result.age}\n` +
                                        `😶 Ekspresi: ${result.expression}\n` +
                                        `🔷 Bentuk Wajah: ${result.faceShape}\n` +
                                        `✨ Beauty Score: ${result.beautyScore}/100`;
                                    
                                    // Send back the original image with analysis in HD
                                    await sock.sendMessage(chatId, {
                                        image: imageBuffer,
                                        caption: resultMessage,
                                        jpegThumbnail: null, // Disable thumbnail compression
                                        viewOnce: false,
                                        mediaUploadTimeoutMs: 60000, // Longer timeout for HD upload
                                    }, { quoted: msg });
                                } else {
                                    throw new Error('Invalid API response');
                                }
                            } catch (error) {
                                console.error('Error analyzing face:', error);
                                await sock.sendPresenceUpdate('paused', chatId);
                                await sock.sendMessage(chatId, {
                                    text: 'gua gagal scan wajah di gambar ini nih. pastiin ada wajah yang jelas ya, atau coba lagi ntar!'
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'chord') {
                            // Cek permission
                            if (!(await checkPermission('chord', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            if (!commandParams) {
                                await sock.sendMessage(chatId, { 
                                    text: 'lu mesti kasih judul lagu ya! formatnya: .chord <judul lagu>' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            try {
                                // Show typing indicator
                                await sock.presenceSubscribe(chatId);
                                await sock.sendPresenceUpdate('composing', chatId);
                                
                                // Make API request to get chord
                                const response = await axios.get(CHORD_API_URL, {
                                    params: { song: commandParams },
                                    timeout: 30000
                                });
                                
                                // Stop typing indicator
                                await sock.sendPresenceUpdate('paused', chatId);
                                
                                // Process response
                                if (response.data && response.data.status === 200) {
                                    const result = response.data.result;
                                    
                                    // Format beautified response
                                    const title = result.title.replace('&#8211;', '-');
                                    const formattedChord = result.chord
                                        .replace(/http:\/\/app\.chordindonesia\.com\/chord-.*$/m, '') // Remove URL
                                        .trim();
                                    
                                    const resultMessage = `🎸 CHORD: ${title} 🎸\n\n${formattedChord}`;
                                    
                                    // Send chord
                                    await sock.sendMessage(chatId, {
                                        text: resultMessage
                                    }, { quoted: msg });
                                } else {
                                    throw new Error('Invalid API response');
                                }
                            } catch (error) {
                                console.error('Error getting chord:', error);
                                await sock.sendPresenceUpdate('paused', chatId);
                                await sock.sendMessage(chatId, {
                                    text: 'gua gabisa nemuin chord lagu itu nih. coba lagu lain atau pastiin judul lagunya bener ya!'
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'clone') {
    // Cek permission
    if (!(await checkPermission('clone', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    // Pastikan ada pesan yang di-reply
    if (!quoted) {
        await sock.sendMessage(chatId, { 
            text: 'lu harus reply ke pesan yang mau di-clone! format: .clone' 
        }, { quoted: msg });
        continue;
    }
    
    // Ambil message key dari quoted message untuk spoofing
    let originalMessageKey = null;
    if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
        originalMessageKey = {
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant,
            remoteJid: chatId
        };
    }
    
    // Fallback jika tidak ada message key
    if (!originalMessageKey) {
        originalMessageKey = {
            id: `CLONE_${Date.now()}`,
            participant: `${Math.floor(Math.random() * 900000) + 100000}@s.whatsapp.net`,
            remoteJid: chatId
        };
    }
    
    // Validasi tipe pesan yang didukung
    const supportedCloneTypes = [
        'conversation', 'extendedTextMessage', 'imageMessage', 
        'videoMessage', 'audioMessage', 'stickerMessage'
    ];
    const quotedMessageType = Object.keys(quoted)[0];
    
    if (!supportedCloneTypes.includes(quotedMessageType)) {
        await sock.sendMessage(chatId, {
            text: 'maaf, tipe pesan ini ga bisa di-clone. coba reply ke pesan teks, gambar, video, audio, atau stiker!'
        }, { quoted: msg });
        continue;
    }
    
    // Langsung jalankan clone tanpa pesan proses
    await createClonedMessage(sock, chatId, quoted, msg, originalMessageKey);
    
    continue;
                        } else if (command === 'p') {
                            // Cek permission
                            if (!(await checkPermission('p', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            // Split parameters: nomor dan bank
                            const params = args.slice(1);
                            if (params.length < 2) {
                                await sock.sendMessage(chatId, { 
                                    text: 'formatnya salah cuy! pake: .p <nomor/rekening> <bank/ewallet>' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            const accountNumber = params[0];
                            const bankType = params[1].toLowerCase();
                            
                            try {
                                // Show typing indicator
                                await sock.presenceSubscribe(chatId);
                                await sock.sendPresenceUpdate('composing', chatId);
                                
                                // Make API request to bank check
                                const response = await axios.get(BANK_API_URL, {
                                    params: { 
                                        number: accountNumber,
                                        bank: bankType
                                    },
                                    timeout: 30000
                                });
                                
                                // Stop typing indicator
                                await sock.sendPresenceUpdate('paused', chatId);
                                
                                // Process response
                                if (response.data && response.data.status === 200 && response.data.result.status) {
                                    const data = response.data.result.data;
                                    
                                    // Format nama (sebagian disensor)
                                    const formattedName = data.name || "Tidak ditemukan";
                                    
                                    const resultMessage = `💳 INFORMASI REKENING/ACCOUNT 💳\n\n` +
                                        `📝 Nomor: ${data.account_number}\n` +
                                        `👤 Nama: ${formattedName}\n` +
                                        `🏦 Bank/E-Wallet: ${data.bank_code.toUpperCase()}`;
                                    
                                    await sock.sendMessage(chatId, {
                                        text: resultMessage
                                    }, { quoted: msg });
                                } else {
                                    throw new Error('Invalid API response or account not found');
                                }
                            } catch (error) {
                                console.error('Error checking bank account:', error);
                                await sock.sendPresenceUpdate('paused', chatId);
                                await sock.sendMessage(chatId, {
                                    text: 'gua gabisa nemuin info rekening/akun itu nih. coba cek lagi nomor & bank/e-wallet nya ya!'
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'waktu') {
    if (!(await checkPermission('waktu', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dimanipulasi waktunya! format: .waktu [tahun/kemarin/besok]' }, { quoted: msg });
        continue;
    }
    
    await manipulateTime(sock, chatId, quoted, commandParams);
    continue;

} else if (command === 'lokasi') {
    if (!(await checkPermission('lokasi', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dimanipulasi lokasinya! format: .lokasi [nama kota]' }, { quoted: msg });
        continue;
    }
    
    await manipulateLocation(sock, chatId, quoted, commandParams);
    continue;

} else if (command === 'channel') {
    if (!(await checkPermission('channel', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dijadiin dari channel terkenal!' }, { quoted: msg });
        continue;
    }
    
    await manipulateChannel(sock, chatId, quoted);
    continue;

} else if (command === 'urgent') {
    if (!(await checkPermission('urgent', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dijadiin emergency alert!' }, { quoted: msg });
        continue;
    }
    
    await manipulateUrgent(sock, chatId, quoted);
    continue;

} else if (command === 'sistem') {
    if (!(await checkPermission('sistem', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dijadiin system message WhatsApp!' }, { quoted: msg });
        continue;
    }
    
    await manipulateSistem(sock, chatId, quoted);
    continue;

} else if (command === 'grup') {
    if (!(await checkPermission('grup', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dijadiin dari grup fake! format: .grup [nama grup]' }, { quoted: msg });
        continue;
    }
    
    await manipulateGrup(sock, chatId, quoted, commandParams);
    continue;

} else if (command === 'broadcast') {
    if (!(await checkPermission('broadcast', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dijadiin dari broadcast VIP!' }, { quoted: msg });
        continue;
    }
    
    await manipulateBroadcast(sock, chatId, quoted);
    continue;

} else if (command === 'reply') {
    if (!(await checkPermission('reply', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dijadiin reply fake! format: .reply [pesan fake]' }, { quoted: msg });
        continue;
    }
    
    await manipulateReply(sock, chatId, quoted, commandParams);
    continue;

} else if (command === 'viral') {
    if (!(await checkPermission('viral', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dijadiin viral dengan kredibilitas maksimal!' }, { quoted: msg });
        continue;
    }
    
    await manipulateViral(sock, chatId, quoted);
    continue;

} else if (command === 'random') {
    if (!(await checkPermission('random', chatId, senderId, sock))) {
        await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
        continue;
    }
    
    if (!quoted) {
        await sock.sendMessage(chatId, { text: 'reply ke pesan yang mau dimanipulasi secara random!' }, { quoted: msg });
        continue;
    }
    
    await manipulateRandom(sock, chatId, quoted);
    continue;
                        } else if (command === 'libur') {
                            // Cek permission
                            if (!(await checkPermission('libur', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            const yearParam = args[1] || new Date().getFullYear().toString();
                            if (!yearParam.match(/^\d{4}$/)) {
                                await sock.sendMessage(chatId, { 
                                    text: 'formatnya salah cuy! pake: .libur <tahun dalam 4 digit>' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            try {
                                // Show typing indicator
                                await sock.presenceSubscribe(chatId);
                                await sock.sendPresenceUpdate('composing', chatId);
                                
                                // Make API request to get holidays
                                const response = await axios.get(HOLIDAY_API_URL, {
                                    params: { year: yearParam },
                                    timeout: 30000
                                });
                                
                                // Stop typing indicator
                                await sock.sendPresenceUpdate('paused', chatId);
                                
                                // Process response
                                if (response.data && response.data.status === 200) {
                                    const holidays = response.data.result;
                                    
                                    if (holidays.length === 0) {
                                        await sock.sendMessage(chatId, {
                                            text: `gua gabisa nemuin info hari libur untuk tahun ${yearParam} nih.`
                                        }, { quoted: msg });
                                        continue;
                                    }
                                    
                                    // Format response
                                    let resultMessage = `📅 HARI LIBUR NASIONAL TAHUN ${yearParam} 📅\n\n`;
                                    
                                    // Add each holiday entry
                                    for (let i = 0; i < holidays.length; i++) {
                                        const h = holidays[i];
                                        resultMessage += `${i+1}. ${h.date} (${h.day})\n   ${h.holiday}\n\n`;
                                        
                                        // If message getting too long, send in parts
                                        if (resultMessage.length > 3500 || i === holidays.length - 1) {
                                            await sock.sendMessage(chatId, {
                                                text: resultMessage
                                            }, { quoted: msg });
                                            resultMessage = `📅 HARI LIBUR NASIONAL TAHUN ${yearParam} (lanjutan) 📅\n\n`;
                                        }
                                    }
                                } else {
                                    throw new Error('Invalid API response');
                                }
                            } catch (error) {
                                console.error('Error getting holidays:', error);
                                await sock.sendPresenceUpdate('paused', chatId);
                                await sock.sendMessage(chatId, {
                                    text: 'gua gagal dapetin info hari libur nih. coba lagi ntar ya!'
                                }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'rubah') {
                            // Cek permission (hanya admin bot yang bisa mengubah permissions)
                            if (!(await checkPermission('rubah', chatId, senderId, sock))) {
                                await sock.sendMessage(chatId, { text: 'lu ga punya akses buat pake fitur ini cuk!' }, { quoted: msg });
                                continue;
                            }
                            
                            // Parse params
                            const params = args.slice(1);
                            if (params.length < 2) {
                                await sock.sendMessage(chatId, { 
                                    text: 'formatnya salah cuy! pake: .rubah <command> <admin/all/admin_group>' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            const cmdToChange = params[0].toLowerCase();
                            const newPermission = params[1].toLowerCase();
                            
                            // Validate command and permission
                            if (!commandPermissions.hasOwnProperty(cmdToChange)) {
                                await sock.sendMessage(chatId, { 
                                    text: `command "${cmdToChange}" ga ada di daftar command yang bisa diubah!` 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            if (!['admin', 'all', 'admin_group'].includes(newPermission)) {
                                await sock.sendMessage(chatId, { 
                                    text: 'permission harus salah satu dari: admin, all, atau admin_group!' 
                                }, { quoted: msg });
                                continue;
                            }
                            
                            // Update permission
                            commandPermissions[cmdToChange] = newPermission;
                            saveJSONFile(COMMAND_PERMISSIONS_FILE, commandPermissions);
                            
                            await sock.sendMessage(chatId, { 
                                text: `nice! sekarang command "${cmdToChange}" cuma bisa dipake sama "${newPermission}"` 
                            }, { quoted: msg });
                            continue;
                        }
                    }
                    
                    // Mark as read if in group
                    if (isGroup) {
                        // Auto read semua pesan di grup
                        await sock.readMessages([msg.key]);
                    }
                    
                    // Process messages for Elz AI
                    // Untuk pesan dengan media (foto/video):
                    // - HANYA respons jika bot di-tag atau di-reply, terlepas dari setting chatGPTEnabled
                    // Untuk pesan teks biasa:
                    // - Respons jika chatGPTEnabled atau bot di-tag/di-reply
                    let shouldRespond = false;
                    
                    if (hasMedia) {
                        // Untuk pesan dengan media, HARUS ada tag bot atau reply ke bot
                        shouldRespond = (isBotMentioned || isReplyingToBot) && 
                            (messageContent.trim() !== ''); // Harus ada caption
                    } else {
                        // Untuk pesan teks biasa, ikuti aturan normal
                        shouldRespond = (isFirstInteraction || chatGPTEnabled[chatId] || isBotMentioned || isReplyingToBot) &&
                            (messageContent.trim() !== '');
                    }
                    
                    if (shouldRespond) {
                        // Create session ID jika belum ada
                        if (!sessions[chatId]) {
                            sessions[chatId] = uuidv4();
                            saveJSONFile(SESSIONS_FILE, sessions);
                        }
                        
                        // Create custom prompt
                        const promptMessage = getCustomPrompt(messageContent, chatId, isFirstInteraction);
                        
                        // Show typing indicator
                        await sock.presenceSubscribe(chatId);
                        await sock.sendPresenceUpdate('composing', chatId);
                        
                        try {
                            // Determine if we need to include an image
                            let apiResponse;
                            
                            if (hasMedia && mediaType === 'image') {
                                // Download and upload image first
                                const imageBuffer = await downloadMedia(mediaObj, 'image');
                                const fileName = `img_${Date.now()}.${mediaObj.mimetype.split('/')[1]}`;
                                const imageUrl = await uploadMediaToServer(imageBuffer, fileName);
                                
                                // Call API with image
                                apiResponse = await axios.get(API_URL, {
                                    params: {
                                        ask: promptMessage,
                                        imageUrl: imageUrl,
                                        sessionId: sessions[chatId]
                                    },
                                    timeout: 60000 // 60 seconds timeout for image processing
                                });
                            } else {
                                // Regular API call without image
                                apiResponse = await axios.get(API_URL, {
                                    params: {
                                        ask: promptMessage,
                                        sessionId: sessions[chatId]
                                    },
                                    timeout: 30000 // 30 seconds timeout
                                });
                            }
                            
                            // Stop typing indicator
                            await sock.sendPresenceUpdate('paused', chatId);
                            
                            // Send response if successful
                            if (apiResponse.data && apiResponse.data.status === 200) {
                                const textResponse = apiResponse.data.result;
                                
                                // Check if voice mode is enabled
                                if (voiceMode[chatId]) {
                                    try {
                                        // First send text response
                                        await sock.sendMessage(chatId, { text: textResponse }, { quoted: msg });
                                        
                                        // Then generate and send voice
                                        const ttsModel = Math.random() > 0.5 ? 'onyx' : 'fable'; // Random model
                                        
                                        // Call TTS API
                                        const ttsResponse = await axios.get(TTS_API_URL, {
                                            params: {
                                                text: textResponse,
                                                model: ttsModel
                                            },
                                            responseType: 'arraybuffer',
                                            timeout: 30000
                                        });
                                        
                                        // Send voice note
                                        if (ttsResponse.status === 200) {
                                            const audioBuffer = Buffer.from(ttsResponse.data);
                                            await sock.sendMessage(chatId, {
                                                audio: audioBuffer,
                                                mimetype: 'audio/mp4',
                                                ptt: true
                                            }, { quoted: msg });
                                        }
                                    } catch (ttsError) {
                                        console.error('Error generating voice:', ttsError);
                                        // If voice fails, we already sent text so just continue
                                    }
                                } else {
                                    // Just send text response
                                    await sock.sendMessage(chatId, { text: textResponse }, { quoted: msg });
                                }
                            } else {
                                console.error('Error response from API:', apiResponse.data);
                                await sock.sendMessage(chatId, { 
                                    text: 'sorry nih, ada error dari api gua.' 
                                }, { quoted: msg });
                            }
                        } catch (error) {
                            console.error('Error calling API:', error);
                            await sock.sendPresenceUpdate('paused', chatId);
                            
                            // Determine specific error message
                            let errorMessage = 'sorry, gua error nih pas proses pesan lu.';
                            
                            if (error.code === 'ECONNABORTED') {
                                errorMessage = 'timeout nih, servernya lagi sibuk kali. coba lagi ntar ya.';
                            } else if (error.response) {
                                errorMessage = `api error (${error.response.status}): ada masalah di server gua nih.`;
                            } else if (error.request) {
                                errorMessage = 'ga bisa konek ke server gua nih. cek koneksi lu atau coba lagi ntar ya.';
                            }
                            
                            // Send error message
                            await sock.sendMessage(chatId, { text: errorMessage }, { quoted: msg });
                        }
                    }
                } catch (err) {
                    console.error('Error processing message:', err);
                }
            }
        });
    } catch (error) {
        console.error('Fatal error in startBot():', error);
        console.log('Restarting bot in 10 seconds...');
        setTimeout(startBot, 10000);
    }
}

// Start the bot
console.log('Starting Elz AI WhatsApp Bot...');
startBot();
