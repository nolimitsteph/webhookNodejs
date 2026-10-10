const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const WEBHOOK_VERIFY_TOKEN = process.env.MYTOKEN;
const WHATAPP_ACCESS_TOKEN = process.env.TOKEN;
const PHONE_NUMBER_ID = process.env.WA_APP_ID; // Extrait de tes configurations d'URL Axios

// Variables de configuration globales définies par sécurité
const MAX_MESSAGE_AGE_SECONDS = 600; 
const FACILITY = { phone: "+254 700 000 000" }; // Rempli pour éviter le crash du repli sécurisé

const aiGemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const aiGroq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const schoolHostels = {
    newBlock: {
        "name": "New Block",
        "Location": "Facing cafelatta",
        "type": "mixed"
    },
    oldBlock: {
        "name": "Old block",
        "Location": "Near cafelatta",
        "type": "mixed"
    }
};

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("The USIU Africa Webhook is online!");
});

// 1. Validation du Webhook (GET Handshake)
app.get("/webhook", (req, res) => {
  console.log(req.method);
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const verify_token = req.query['hub.verify_token'];

  if (mode && verify_token == WEBHOOK_VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// 2. Traitement des événements (POST)
app.post("/webhook", async (req, res) => {
    const entry = req.body.entry;
    if (!entry || entry.length === 0) {
        return res.status(400).send("No entry found in the request body");
    }

    const changes = entry[0].changes;
    if (!changes || changes.length === 0) {
        return res.status(400).send("No changes found in the request body");
    }

    const value = changes[0].value;

    // Détection et filtrage immédiat si c'est un statut (delivered, read)
    const statuses = value.statuses ? value.statuses[0] : null;
    if (statuses) {
        console.log(` MESSAGE STATUS UPDATE -> ID: ${statuses.id}, STATUS: ${statuses.status}`);
        return res.status(200).send("EVENT_RECEIVED");
    }

    const messages = value.messages ? value.messages[0] : null;
    
    if (messages) {
        // CORRECTION : Déclaration de messageAge déplacée ici APRES s'être assuré que messages existe
        const messageAge = Math.floor(Date.now() / 1000) - Number(messages.timestamp);
        if (messageAge > MAX_MESSAGE_AGE_SECONDS) {
            console.log(`⏳ Ignored old message (${messageAge}s old)`);
            return res.sendStatus(200);
        }

        console.log(` Received incoming message: ${JSON.stringify(messages, null, 2)}`);
        
        // Traitement des messages de type texte standard
        if (messages.type === "text") {
            const userText = messages.text.body.toLowerCase().trim();

            if (userText === "hello" || userText === "hi") {
                await replyMessage(messages.from, "Hello! How can I assist you today?", messages.id);
                await sendList(messages.from);
                await sendReplybutton(messages.from);
            } 
            else if (userText === "list") {
                await sendList(messages.from);
            } 
            else if (userText === "reply button") {
                await sendReplybutton(messages.from);
            } 
            else {
                console.log(`🧠 Processing open query via USIU AI: "${messages.text.body}"`);
                const aiResponse = await getCascadingAIResponse(messages.text.body);
                await replyMessage(messages.from, aiResponse, messages.id);
            }
        }
        
        // Traitement des composants interactifs WhatsApp (Clics sur boutons / listes)
        else if (messages.type === "interactive") {
            if (messages.interactive.type === "list_reply") {
                await sendMessage(messages.from, `You selected List Row ID: ${messages.interactive.list_reply.id} - Title: ${messages.interactive.list_reply.title}`);
            }
            else if (messages.interactive.type === "button_reply") {
                await sendMessage(messages.from, `You selected Quick Button ID: ${messages.interactive.button_reply.id} - Title: ${messages.interactive.button_reply.title}`);
            }
        }
    } else {
        console.log("No messages or statuses found in the request body.");
    }

    return res.status(200).send("EVENT_RECEIVED");
});


// FONCTIONS DE COMMUNICATION & COMPOSANTS WHATSAPP


async function sendMessage(to, body) {
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization' : `Bearer ${WHATAPP_ACCESS_TOKEN}`,
                'Content-Type' : 'application/json'
            },
            data: {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: body }
            }
        });
        console.log(`✉️ Message sent to ${to}`);
    } catch (err) {
        console.error(" sendMessage Error:", err.response ? err.response.data : err.message);
    }
}

async function replyMessage(to, body, messageId) {
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization' : `Bearer ${WHATAPP_ACCESS_TOKEN}`,
                'Content-Type' : 'application/json'
            },
            data: {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: body },
                context: { message_id: messageId }
            }
        });
        console.log(` Contextual Reply sent to ${to}`);
    } catch (err) {
        console.error(" replyMessage Error:", err.response ? err.response.data : err.message);
    }
}

async function sendList(to) {
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization' : `Bearer ${WHATAPP_ACCESS_TOKEN}`,
                'Content-Type' : 'application/json'
            },
            data: {
                messaging_product: "whatsapp",
                to: to,
                type: "interactive",
                interactive: {
                    type: "list",
                    header: { type: "text", text: "USIU Hostels Directory" },
                    body: { text: "Select a hostel block below to get its full profile and localization mapping." },
                    footer: { text: "USIU Africa Digital Assistant" },
                    action: {
                        button: "View Hostels",
                        sections: [
                            {
                                title: "Campus Blocks",
                                rows: [
                                    { id: "lst_new_block", title: "New Block", description: "Facing cafelatta" },
                                    { id: "lst_old_block", title: "Old Block", description: "Near cafelatta" }
                                ]
                            }
                        ]
                    }
                }
            }
        });
        console.log(` Interactive List view deployed to ${to}`);
    } catch (err) {
        console.error(" sendList Error:", err.response ? err.response.data : err.message);
    }
}

async function sendReplybutton(to) {
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization' : `Bearer ${WHATAPP_ACCESS_TOKEN}`,
                'Content-Type' : 'application/json'
            },
            data: {
                messaging_product: "whatsapp",
                to: to,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: "Need quick help? Choose an entry action track below." },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: "btn_list", title: " View Hostels" } },
                            { type: "reply", reply: { id: "btn_info", title: " Campus Info" } }
                        ]
                    }
                }
            }
        });
        console.log(` Quick-reply buttons deployed to ${to}`);
    } catch (err) {
        console.error(" sendReplybutton Error:", err.response ? err.response.data : err.message);
    }
}


//  MOTEUR CASCADE IA (Google Gemini Groq Llama 3 Backup)

async function getCascadingAIResponse(prompt) {
    // CORRECTION : Utilisation de JSON.stringify pour injecter proprement l'objet à l'IA
    const contextPrompt = `You are a specialized campus informational assistant for USIU Africa. 
    Answer the student query concisely in a maximum of 3 sentences using exclusively the following hostel data database context: 
    ${JSON.stringify(schoolHostels)}.
    If they ask about an emergency or an unlisted campus building, guide them politely to reach the main office.
    Student query: ${prompt}`;

    if (aiGemini) {
        try {console.log(" Route: Attempting extraction via Gemini Flash...");
const response = await aiGemini.models.generateContent({
model: 'gemini-1.5-flash',
contents: contextPrompt,
});
if (response?.text) return response.text.trim();
} catch (err) {
console.warn(" Gemini Primary route collapsed, switching context to Groq...", err.message);
}
}
if (aiGroq) {
try {
console.log(" Route: Executing backup pipeline via Groq Llama 3...");
const chatCompletion = await aiGroq.chat.completions.create({
messages: [{ role: "user", content: contextPrompt }],
model: "llama3-8b-8192",
});
if (chatCompletion.choices && chatCompletion.choices[0]?.message?.content) {
return chatCompletion.choices[0].message.content.trim();
}
} catch (err) {
console.error(" Both AI engines failed to generate a response:", err.message);
}
}
return `Thank you for reaching out. Our automated student guidance lines are temporarily congested. Please reply with "list" to explore campus hostel profiles manually or reach out to us later.`;
}
// Lancement global du serveur Express (Prêt pour Render)
const PORT = process.env.PORT || 8085;
app.listen(PORT, '0.0.0.0', () => {
console.log(`USIU Africa campus server active and running on port ${PORT}`);
});