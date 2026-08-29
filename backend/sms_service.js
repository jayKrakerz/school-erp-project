const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Africa's Talking Configuration (Example)
// You can get these from https://africastalking.com/
const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const AT_API_KEY = process.env.AT_API_KEY || 'your_api_key_here';

app.post('/api/send-sms', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Phone and message are required' });
    }

    try {
        console.log(`Attempting to send SMS to ${phone}: ${message}`);
        
        // Africa's Talking API Call
        const params = new URLSearchParams();
        params.append('username', AT_USERNAME);
        params.append('to', phone);
        params.append('message', message);

        const response = await axios.post('https://api.africastalking.com/version1/messaging', params, {
            headers: {
                'apiKey': AT_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });

        console.log('SMS Provider Response:', response.data);
        res.status(200).json({ success: true, data: response.data });
    } catch (error) {
        console.error('SMS Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to send SMS', details: error.message });
    }
});

const PORT = process.env.SMS_PORT || 5001;
app.listen(PORT, () => {
    console.log(`SMS Service running on port ${PORT}`);
});
