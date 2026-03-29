
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function test() {
  console.log('Key length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);
  if (!process.env.GEMINI_API_KEY) return;
  
  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const r = await model.generateContent('Generate exactly 1 short sentence.');
    console.log('SUCCESS:', r.response.text());
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}
test();

