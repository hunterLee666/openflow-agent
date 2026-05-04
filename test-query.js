import { getAgentService } from './src/engine/agentService';

async function test() {
  // Set fake API key
  process.env.OPENAI_API_KEY = 'sk-test123';
  
  const service = getAgentService();
  
  console.log('Starting test query...\n');
  
  try {
    for await (const msg of service.query('read package.json')) {
      console.log('Received event:', JSON.stringify(msg, null, 2));
    }
  } catch (e) {
    console.error('Query failed:', e);
  }
}

test();
