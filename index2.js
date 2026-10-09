const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const {GoogleGenAI} = require('@google/genai');

// const ngrok = require('@ngrok/ngrok');
require('dotenv').config();

const WEBHOOK_VERIFY_TOKEN = process.env.MYTOKEN ;
const WHATAPP_ACCESS_TOKEN = process.env.TOKEN;
const aiGemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const aiGroq = process.env.GROQ_API_KEY ? new Groq({apiKey: process.env.GROQ_API_KEY}) : null;

const schoolHostels = {
    
        newBLock : {"name": "New Block",
        "Location": "Facing cafelatta",
        "type": "mixed"},
    
        oldBlock : {
        "name": "Old block",
        "Location": "Near cafelatta",
        "type": "mixed",}
    
}



const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("The whatsapp webhook");
});

app.get("/webhook", (req, res) => {
  console.log(req.method);
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const verify_token = req.query['hub.verify_token'];

  if (mode && verify_token == WEBHOOK_VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  }
  else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async(req, res) => {
    const entry = req.body.entry;
    if (!entry || entry.length === 0) {
        return res.status(400).send("No entry found in the request body");
    }

    // Accès direct au tableau changes sans déstructuration erronée
    const changes = entry[0].changes;
    if (!changes || changes.length === 0) {
        return res.status(400).send("No changes found in the request body");
    }

    // Extraction sécurisée du contenu de la valeur
    const value = changes[0].value;

    const messageAge = Math.floor(Date.now() / 1000) - Number(message.timestamp);
    if (messageAge > MAX_MESSAGE_AGE_SECONDS) {
        console.log(`Ignored old message (${messageAge}s old)`);
        return res.sendStatus(200);
    }

    // 2. CORRECTION : Extraction correcte des objets (sans accolades destructurantes au mauvais endroit)
    const statuses = value.statuses ? value.statuses[0] : null;
    const messages = value.messages ? value.messages[0] : null;
    
    if (statuses) {
        //handling status of messages
        console.log(
            `Bot sent the message
            MESSAGE STATUS UPDATE :
            ID: ${statuses.id},
            STATUS: ${statuses.status},
            `);

    }
    
    if (messages) {
        //handling incoming messages
        console.log(`Received incoming message: ${JSON.stringify(messages, null, 2)}`);
        if(messages.type === "text"){
            if (messages.text.body.toLowerCase() === "hello" || messages.text.body.toLowerCase() === "hi") {
                await replyMessage(messages.from, "Hello! How can I assist you today?", messages.id);
                await sendList(messages.from);
                await sendReplybutton(messages.from);
            }
            

            else if(messages.text.body.toLowerCase() === "list") {
                sendList(messages.from);
            }
            else if(messages.text.body.toLowerCase() === "reply button") {
                sendReplybutton(messages.from);
            }
            else {
                console.log(`Processing open query via Digital Health AI: "${messages.text.body}"`);
                const aiResponse = await getCascadingAIResponse(messages.text.body);
                await replyMessage(messages.from, aiResponse, messages.id);
            }
        }
        if(messages.type === "interactive"){
            if(messages.interactive.type === "list_reply"){
                sendMessage(messages.from, `You selected ${messages.interactive.list_reply.id}, - Title: ${messages.interactive.list_reply.title}` )
            }
        if(messages.interactive.type === "button_reply"){
            sendMessage(messages.from, `You selected ${messages.interactive.button_reply.id}, - Title: ${messages.interactive.button_reply.title}` )
        }

    }
    else {
        console.log("No messages found in the request body, no message sent it was probably a message from my bot");
    }

    return res.status(200).send("EVENT_RECEIVED");


}});

async function sendMessage(to, body){
    await axios({
        method:'POST',
        url: "https://graph.facebook.com/v25.0/1341685815697570/messages ",
        headers: {
            'Authorization' : `Bearer ${WHATAPP_ACCESS_TOKEN}`,
            'Content-Type' : 'application/json',
            'Content': 'application/json',
        },
        data: {
            messaging_product: "whatsapp",
            to: to,
            type: "text",
            text: {
                body: body,
            }
        }
    });
    console.log(`Message sent to ${to}: ${body}`);
}

async function getCascadingAIResponse(prompt) {
    // Le prompt système qui verrouille le contexte médical de l'hôpital
    const contextPrompt = `You are the specialized AI supposed to give info about USIU africa `;
    // PLAN A : Tentative avec Google Gemini Flash
    if (aiGemini) {
        try {
            console.log(" Route: Attempting extraction via Gemini Flash...");
            const response = await aiGemini.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: contextPrompt,
            });
            if (response?.text) return response.text.trim();
        } catch (err) {
            console.warn("⚠️ Gemini Primary route collapsed, switching context to Groq...", err.message);
        }
    }

    // PLAN B : Sécurité avec Groq Llama 3 si le plan A échoue
    if (aiGroq) {
        try {
            console.log("🔵 Route: Executing backup pipeline via Groq Llama 3...");
            const chatCompletion = await aiGroq.chat.completions.create({
                messages: [{ role: "user", content: contextPrompt }],
                model: "llama3-8b-8192",
            });
            if (chatCompletion.choices?.[0]?.message?.content) {
                return chatCompletion.choices[0].message.content.trim();
            }
        } catch (err) {
            console.error("❌ Both AI engines failed to generate a response:", err.message);
        }
    }

    // REPLI SÉCURISÉ : Si aucune IA ne répond
    return `Thank you for reaching out to ${FACILITY.name}. We received your prompt, but our AI lines are heavily congested right now. Please reply with "menu" to use our instant Room Navigation tool or call us at ${FACILITY.phone}.`;
}


async function replyMessage(to, body, messageId){
    await axios({
        method:'POST',
        url: "https://graph.facebook.com/v25.0/1341685815697570/messages ",
        headers: {
            'Authorization' : `Bearer ${WHATAPP_ACCESS_TOKEN}`,
            'Content-Type' : 'application/json',
            'Content': 'application/json',
        },
        data: {
            messaging_product: "whatsapp",
            to: to,
            type: "text",
            text: {
                body: body,
            },
            context : {
                message_id: messageId
            }
        }
    });
    console.log(`Message sent to ${to}: ${body}`);
}

async function sendList(to){
    await axios({
        method:'POST',
        url: `https://graph.facebook.com/v25.0/${process.env.WA_APP_ID}/messages`,
        headers: {
            'Authorization' : `Bearer ${WHATAPP_ACCESS_TOKEN}`,
            'Content-Type' : 'application/json',
            'Content': 'application/json',
        },
        data: {
            messaging_product: "whatsapp",
            to: to,
            type: "interactive",
            interactive: {
                type: 'list',
                header: {
                    type: 'text',
                    text: 'Free a celebrity (interactive)',
                },  
                body: {
                    text: "Who are you freeing?",
                },
                footer: {
                    text: "the footer text",
                },
                action: {
                    button: "Options",
                    sections: [
                        {
                            title: "First section",
                            rows : [
                                {
                                    id: "freediddy",
                                    title: "Free diddy",
                                    description: "The famous producer and rapper"   
                                },
                                {
                                    id: "freeJeff",
                                    title: "Free Jeffrey epstein",
                                    description: "The famous trader"
                                },
                                {
                                    id: "FreeRkelly",
                                    title: "Free Rkelly",
                                    description: "The famous singer "
                                }
                            ]
                        },
                        {
                            title: "second section",
                            rows: [
                                {
                                    id: "freeBritney",
                                    title: "Free Britney Spears",
                                    description: "The famous pop star"
                                },
                                {
                                    id: "freeMartha",
                                    title: "Free Martha Stewart",
                                    description: "The famous chef"
                                },
                                {
                                    id: "freeSnoop",
                                    title: "Free Snoop Dogg",
                                    description: "The famous rapper"
                                }
                            ]
                        }
                    ]
                }

            }
        }
    });
    console.log(`Message sent to ${to}`);
}

async function sendReplybutton(to){
    await axios({
        method:'POST',
        url: `https://graph.facebook.com/v25.0/${process.env.WA_APP_ID}/messages`,
        headers: {
            'Authorization' : `Bearer ${WHATAPP_ACCESS_TOKEN}`,
            'Content-Type' : 'application/json',
            'Content': 'application/json',
        },
        data: {
            messaging_product: "whatsapp",
            to: to,
            type: "interactive",
            interactive: {
                type: 'button',
                header: {
                    type: 'text',
                    text: 'Free a celebrity (reply button)',
                },  
                body: {
                    text: "Who are you freeing?",
                },
                footer: {
                    text: "the footer text",
                },
                action: {
                    buttons: [
                        {
                            type:"reply",
                            reply: {
                                id: "first_button",
                                title: "Free diddy",
                            }
                        },
                        {
                            type:"reply",
                            reply: {
                                id: "second_button",
                                title: "Free Jeffrey epstein",

                            }
                        },
                        {
                            type:"reply",
                            reply: {
                                id: "third_button",
                                title: "Free Rkelly",
                            }
                        },
                    ]
                }

            }
        }
    });
    console.log(`Message sent to ${to}`);
}

// async function forwardToApp() {
// 	const forwarder = await ngrok.forward({
// 		addr: "localhost:8085",
// 		authtoken_from_env: true,
// 		domain: "washer-populate-footboard.ngrok-free.dev",
// 	});
// 	console.log(`Available at: ${forwarder.url()}`);
// }
 
//ngrok will forward the requests to my local server running on port 8085(tunneling because i don't have a public ip)
app.listen(8085,'0.0.0.0', () => {
  console.log("Webserver running on port 8085");
});


