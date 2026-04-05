/**
 * Debug test to identify why response.data is undefined
 */

// Test the parsing directly
async function testParsing() {
  console.log('Testing response parsing...\n');
  
  // Test 1: Direct fetch and parse
  console.log('Test 1: Direct fetch + response.json()');
  const response1 = await fetch('https://jsonplaceholder.typicode.com/posts/1');
  console.log('Status:', response1.status);
  console.log('Content-Type:', response1.headers.get('Content-Type'));
  console.log('Body used:', response1.bodyUsed);
  
  try {
    const data1 = await response1.json();
    console.log('Parsed data:', data1);
  } catch (err) {
    console.log('Parse error:', err);
  }
  
  console.log('\nTest 2: Using httix-http library');
  const { createHttix } = await import('../dist/esm/index.js');
  const client = createHttix();
  
  try {
    const response2 = await client.get('https://jsonplaceholder.typicode.com/posts/1');
    console.log('Status:', response2.status);
    console.log('Data:', response2.data);
    console.log('Raw body used:', response2.raw.bodyUsed);
  } catch (err) {
    console.log('Error:', err);
  }
}

testParsing().then(() => process.exit(0));
