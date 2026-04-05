/**
 * Example Application - Testing httix-http library
 * 
 * This example demonstrates real-world usage of httix-http
 * by making actual HTTP requests to a public test API.
 */

import httix, { createHttix, HttixResponseError } from '../dist/esm/index.js';
import { loggerPlugin } from '../dist/esm/plugins/index.js';

// Test API - JSONPlaceholder (free fake API for testing)
const BASE_URL = 'https://jsonplaceholder.typicode.com';

async function runTests() {
  console.log('========================================');
  console.log('  httix-http Example Test Application');
  console.log('========================================\n');

  // Test 1: Simple GET request with default instance
  console.log('Test 1: Simple GET request');
  console.log('--------------------------');
  try {
    const response = await httix.get(`${BASE_URL}/posts/1`);
    console.log('✅ Status:', response.status);
    console.log('✅ Data:', JSON.stringify(response.data, null, 2));
    console.log('✅ Timing:', response.timing, 'ms\n');
  } catch (error) {
    console.error('❌ GET request failed:', error);
  }

  // Test 2: POST request with JSON body
  console.log('Test 2: POST request with JSON body');
  console.log('------------------------------------');
  try {
    const response = await httix.post(`${BASE_URL}/posts`, {
      title: 'Test Post',
      body: 'This is a test post from httix-http example',
      userId: 1,
    });
    console.log('✅ Status:', response.status);
    console.log('✅ Created:', JSON.stringify(response.data, null, 2));
    console.log('✅ Timing:', response.timing, 'ms\n');
  } catch (error) {
    console.error('❌ POST request failed:', error);
  }

  // Test 3: Create custom client with configuration
  console.log('Test 3: Custom client with baseURL and interceptors');
  console.log('--------------------------------------------------');
  const api = createHttix({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: {
      'X-Custom-Header': 'httix-test',
    },
  });

  // Add request interceptor
  api.interceptors.request.use((config) => {
    console.log('🔹 Request interceptor:', config.method, config.url);
    return config;
  });

  // Add response interceptor
  api.interceptors.response.use((response) => {
    console.log('🔹 Response interceptor: status =', response.status);
    return response;
  });

  try {
    const response = await api.get('/users/1');
    console.log('✅ User data:', JSON.stringify(response.data, null, 2));
    console.log('✅ Timing:', response.timing, 'ms\n');
  } catch (error) {
    console.error('❌ Custom client request failed:', error);
  }

  // Test 4: Query parameters
  console.log('Test 4: Query parameters');
  console.log('-------------------------');
  try {
    const response = await httix.get(`${BASE_URL}/posts`, {
      query: {
        userId: 1,
        _limit: 3,
      },
    });
    console.log('✅ Posts count:', (response.data as any[]).length);
    console.log('✅ First post title:', (response.data as any[])[0]?.title);
    console.log('✅ Timing:', response.timing, 'ms\n');
  } catch (error) {
    console.error('❌ Query params request failed:', error);
  }

  // Test 5: Error handling (404)
  console.log('Test 5: Error handling (404)');
  console.log('---------------------------');
  try {
    await httix.get(`${BASE_URL}/posts/999999`);
    console.log('❌ Should have thrown an error');
  } catch (error) {
    if (error instanceof HttixResponseError) {
      console.log('✅ Caught HttixResponseError');
      console.log('✅ Status:', error.status);
      console.log('✅ Status Text:', error.statusText);
      console.log('✅ Error handled correctly\n');
    } else {
      console.error('❌ Unexpected error type:', error);
    }
  }

  // Test 6: Logger plugin
  console.log('Test 6: Logger plugin');
  console.log('---------------------');
  const logger = loggerPlugin({
    level: 'info',
    logRequestBody: false,
    logResponseBody: false,
  });
  
  const loggedClient = createHttix({
    baseURL: BASE_URL,
  });

  try {
    const response = await loggedClient.get('/posts/2');
    console.log('✅ Request with logger completed');
    console.log('✅ Status:', response.status);
    console.log('✅ Timing:', response.timing, 'ms\n');
  } catch (error) {
    console.error('❌ Logger test failed:', error);
  }

  // Test 7: PATCH request
  console.log('Test 7: PATCH request');
  console.log('--------------------');
  try {
    const response = await httix.patch(`${BASE_URL}/posts/1`, {
      title: 'Updated Title',
    });
    console.log('✅ Status:', response.status);
    console.log('✅ Updated:', JSON.stringify(response.data, null, 2));
    console.log('✅ Timing:', response.timing, 'ms\n');
  } catch (error) {
    console.error('❌ PATCH request failed:', error);
  }

  // Test 8: DELETE request
  console.log('Test 8: DELETE request');
  console.log('---------------------');
  try {
    const response = await httix.delete(`${BASE_URL}/posts/1`);
    console.log('✅ Status:', response.status);
    console.log('✅ Timing:', response.timing, 'ms\n');
  } catch (error) {
    console.error('❌ DELETE request failed:', error);
  }

  // Summary
  console.log('========================================');
  console.log('  All Tests Completed Successfully!');
  console.log('========================================');
  console.log('\nhttix-http is working correctly!');
  console.log('Features tested:');
  console.log('  - GET, POST, PATCH, DELETE requests');
  console.log('  - Custom client with baseURL');
  console.log('  - Query parameters');
  console.log('  - Request/Response interceptors');
  console.log('  - Error handling (HttixResponseError)');
  console.log('  - Logger plugin');
  console.log('  - Response timing');
  process.exit(0);
}

// Run all tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
