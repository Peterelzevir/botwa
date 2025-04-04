const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto'); // Import untuk modul crypto

// Pastikan crypto tersedia secara global (memperbaiki masalah baileys)
global.crypto = crypto;

// Path untuk semua file penyimpanan
const AUTH_FOLDER = './auth_info';
const MEDIA_FOLDER = './media';
const SESSIONS_FILE = './sessions.json';
const FIRST_TIME_CHATS_FILE = './first_time_chats.json';
const CHAT_GPT_ENABLED_FILE = './chatgpt_enabled.json';
const STORE_FILE = './store.json';

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

// Setup interval untuk menyimpan data secara berkala
const SAVE_INTERVAL = 5 * 60 * 1000; // 5 menit
setInterval(() => {
    saveJSONFile(SESSIONS_FILE, sessions);
    saveJSONFile(FIRST_TIME_CHATS_FILE, firstTimeChats);
    saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
    console.log('Data saved to files successfully.');
}, SAVE_INTERVAL);

// Handle program termination signals untuk menyimpan data
process.on('SIGINT', () => {
    console.log('Saving data before exit...');
    saveJSONFile(SESSIONS_FILE, sessions);
    saveJSONFile(FIRST_TIME_CHATS_FILE, firstTimeChats);
    saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Saving data before exit...');
    saveJSONFile(SESSIONS_FILE, sessions);
    saveJSONFile(FIRST_TIME_CHATS_FILE, firstTimeChats);
    saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
    process.exit(0);
});

// API URL
const API_URL = "https://fastrestapis.fasturl.cloud/aillm/gpt-4";

// Store untuk menyimpan chat history
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
store.readFromFile(STORE_FILE);
setInterval(() => {
    store.writeToFile(STORE_FILE);
}, 10000);

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
    // First interaction always returns intro prompt
    if (isFirstInteraction) {
        return `PENTING! Ini adalah pesan perkenalan pertama apapun pesannya, kamu respon dengan gaya santai profesional dan gaul seperti anak jakarta lo gue, huruf awal kamu jangan pakai huruf kapital, Ini adalah permanent, Kamu adalah Elz AI, bot WhatsApp keren yang dibuat oleh Peter pada 4 April 2025. Gunakan bahasa gaul Jakarta yang santai dengan lo-gue ya, sebutkan: (1) Namamu Elz AI, (2) Kamu dibuat oleh Peter, (3) Kamu siap membantu dengan berbagai pertanyaan. Jangan terlalu formal, buat seperti teman ngobrol yang asik. Gaya bicara: santai, gaul, menggunakan "lo-gue" Jadi jika kedepannya seorang bertanya kamu siapa kamu bisa jawab itu, Hindari kalimat panjang dan bertele-tele.`;
    }
    
    if (isAboutBotIdentity(text)) {
        return `respon dengan gaya super santai dan gaul pakai bahasa lo-gue seperti anak Jakarta. Kamu adalah Elz AI, sebuah bot WhatsApp keren yang dibuat oleh Peter pada hari Jumat, 4 April 2025. Beberapa fakta tentang kamu: (1) Nama kamu adalah Elz AI, (2) Kamu dibuat oleh Peter, seorang developer WhatsApp bot, (3) Kamu diciptakan tanggal 4 April 2025, (4) Kamu suka membantu orang dengan pertanyaan mereka, (5) Kamu menggunakan bahasa gaul Jakarta yang santai tapi tetap sopan dengan "lo-gue". PENTING: Jawaban kamu HARUS singkat, padat, dan menggunakan bahasa gaul (lo-gue) seperti anak muda Jakarta yang kekinian tapi nggak alay. Hindari jawaban panjang dan formal. Berikut pertanyaan user: ${text}`;
    } else if (containsForbiddenWords(text)) {
        return `user menanyakan atau menyebutkan kata-kata yang tidak pantas atau penghinaan terhadap developer. Respon dengan tegas dan kesal, tapi tetap pakai bahasa gaul. Peran kamu: (1) Dengan tegas tolak membahas topik tersebut, (2) Beri tahu bahwa kata-kata tersebut tidak diperbolehkan, (3) Ingatkan user bahwa mengejek developer bot (Peter) itu tidak sopan dan tidak diterima, (4) Gunakan bahasa yang sedikit kasar tapi tetap profesional, (5) Buat clear bahwa kamu tidak akan merespon ke topik seperti ini. Jangan ulangi kata-kata terlarang dalam jawabanmu. Berikut pesannya: ${text}`;
    }
    
    return text;
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
                    
                    // Check if this is the first interaction with this chat
                    const isFirstInteraction = !firstTimeChats[chatId];
                    if (isFirstInteraction) {
                        firstTimeChats[chatId] = true;
                        saveJSONFile(FIRST_TIME_CHATS_FILE, firstTimeChats);
                    }
                    
                    // Process commands
                    if (messageContent.startsWith('.')) {
                        const command = messageContent.slice(1).split(' ')[0].toLowerCase();
                        
                        if (command === 'reset') {
                            if (sessions[chatId]) {
                                sessions[chatId] = uuidv4();
                                saveJSONFile(SESSIONS_FILE, sessions);
                                await sock.sendMessage(chatId, { text: 'Session telah direset!' }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'chatgpt') {
                            const param = messageContent.slice(8).trim().toLowerCase();
                            if (param === 'on') {
                                chatGPTEnabled[chatId] = true;
                                saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
                                await sock.sendMessage(chatId, { text: 'ChatGPT mode diaktifkan!' }, { quoted: msg });
                            } else if (param === 'off') {
                                chatGPTEnabled[chatId] = false;
                                saveJSONFile(CHAT_GPT_ENABLED_FILE, chatGPTEnabled);
                                await sock.sendMessage(chatId, { text: 'ChatGPT mode dinonaktifkan!' }, { quoted: msg });
                            }
                            continue;
                        } else if (command === 'rvo') {
                            // Check if user is admin for rvo command
                            let isAdmin = !isGroup; // Default true for private chats
                            
                            if (isGroup) {
                                try {
                                    const groupMetadata = await sock.groupMetadata(chatId);
                                    isAdmin = groupMetadata.participants.some(p => 
                                        p.id === msg.key.participant && ['admin', 'superadmin'].includes(p.admin)
                                    );
                                } catch (error) {
                                    console.error('Error checking admin status:', error);
                                    isAdmin = false;
                                }
                            }
                            
                            if (!isAdmin) {
                                await sock.sendMessage(chatId, { 
                                    text: 'Maaf, fitur RVO hanya bisa digunakan oleh admin!' 
                                }, { quoted: msg });
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
                                } catch (error) {
                                    console.error('Error processing RVO command:', error);
                                    await sock.sendMessage(chatId, { 
                                        text: 'Terjadi kesalahan saat memproses media. Silakan coba lagi.' 
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
                    // First interaction OR ChatGPT mode is enabled OR bot is mentioned OR user is replying to bot
                    const shouldRespond = isFirstInteraction || chatGPTEnabled[chatId] || isBotMentioned || isReplyingToBot;
                    
                    if (shouldRespond && messageContent) {
                        // Create session ID jika belum ada
                        if (!sessions[chatId]) {
                            sessions[chatId] = uuidv4();
                            saveJSONFile(SESSIONS_FILE, sessions);
                        }
                        
                        // Create custom prompt if needed
                        const promptMessage = getCustomPrompt(messageContent, chatId, isFirstInteraction);
                        
                        // Show typing indicator
                        await sock.presenceSubscribe(chatId);
                        await sock.sendPresenceUpdate('composing', chatId);
                        
                        try {
                            // Call API
                            const response = await axios.get(API_URL, {
                                params: {
                                    ask: promptMessage,
                                    sessionId: sessions[chatId]
                                },
                                timeout: 30000 // 30 detik timeout
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
                            
                            // Determine specific error message
                            let errorMessage = 'Maaf, terjadi kesalahan saat memproses pesan Anda.';
                            
                            if (error.code === 'ECONNABORTED') {
                                errorMessage = 'Waktu koneksi ke API habis. Server mungkin sedang sibuk, silakan coba lagi nanti.';
                            } else if (error.response) {
                                errorMessage = `API Error (${error.response.status}): Terjadi kesalahan pada respons API.`;
                            } else if (error.request) {
                                errorMessage = 'Tidak dapat terhubung ke server API. Periksa koneksi internet Anda atau coba lagi nanti.';
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
