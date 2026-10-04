const express = require('express');
const bodyParser = require('body-parser');
const axios = require("axios")
require('dotenv').config();

const app = express().use(bodyParser.json());
const apptoken = process.env.TOKEN;   
const mytoken = process.env.MYTOKEN;
const ngrok = require("@ngrok/ngrok");

app.listen(process.env.PORT,() => {
    console.log('webhook is listening on port ' + process.env.PORT);
})



async function forwardToApp() {
  const forwarder = await ngrok.forward({
    addr: "localhost:8085",
    authtoken_from_env: process.env.NGROK_AUTHTOKEN,
    domain: "washer-populate-footboard.ngrok-free.dev",
  });
  console.log(`Available at: ${forwarder.url()}`);
}

forwardToApp();

// Creates the endpoint for our webhook and verify callback url and token
app.get('/webhook', (req, res) => {
    let mode =req.query['hub.mode'];
    let challenge= req.query['hub.challenge'];
    let verify_token = req.query['hub.verify_token'];

    const mytoken ="freediddy";
    
    if(mode && verify_token){
        if(mode === 'subscribe' && verify_token === mytoken){
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        }
        else{
            res.sendStatus(403);
        }
    }
})

app.post('/webhook', (req, res) => {
    let body_parameter = req.body; 
    console.log(JSON.stringify(body_parameter, null,2)) 

    if(body_parameter.object){
        if(body_parameter.entry && 
        body_parameter.entry[0].changes &&
        body_parameter.entry[0].changes[0].value.messages &&    
        body_parameter.entry[0].changes[0].value.messages[0])
        {
            let phone_no_id = body_parameter.entry[0].changes[0].value.metadata.phone_number_id;
            let from = body_parameter.entry[0].changes[0].value.messages[0].from;
            let msg_body = body_parameter.entry[0].changes[0].value.messages[0].text.body;

            axios({
                method: 'POST',
                url: 'https://graph.facebook.com/v17.0/'+phone_no_id+'/messages?access_token='+apptoken,
                data: {
                    messaging_product: 'whatsapp',
                    to: from,
                    text: { body: 'Hi, I am a diddler. You said: '+msg_body }
                },
                headers: {
                    'Content-Type': 'application/json'}
                })
                res.sendStatus(200);
            }
        else {
                res.sendStatus(404);

            }
    }
}
);

