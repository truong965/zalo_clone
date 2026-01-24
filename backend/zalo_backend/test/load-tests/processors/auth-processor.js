/**
 * Artillery Processor for Socket.IO Load Tests
 * Handles JWT token generation and payload creation
 */

const { faker } = require('@faker-js/faker');
const jwt = require('jsonwebtoken');

// ⚠️ IMPORTANT: Update these values from your .env
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'your-super-secret-access-token-key-min-32-chars';
const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-uuid-here';

/**
 * Generate a valid JWT token for testing
 * This simulates a logged-in user
 */
function generateAuthToken(context, events, done) {
  // Create JWT payload matching your auth system
  const payload = {
    sub: TEST_USER_ID,
    type: 'access',
    pwdVer: 1, // Password version from your schema
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
  };

  const token = jwt.sign(payload, JWT_SECRET);
  
  // Store token in context for use in scenario
  context.vars.token = token;
  context.vars.userId = TEST_USER_ID;
  
  return done();
}

/**
 * Generate random large payload (incremental sizes)
 */
function generateLargePayload(context, events, done) {
  // Start with 1KB, grow to 60KB
  const sizeKB = Math.floor(Math.random() * 60) + 1;
  const sizeBytes = sizeKB * 1024;
  
  // Generate random string of specified size
  const largePayload = faker.string.alpha(sizeBytes);
  
  context.vars.largePayload = largePayload;
  context.vars.payloadSize = `${sizeKB}KB`;
  
  return done();
}

/**
 * Generate payload exceeding 64KB limit (should fail)
 */
function generateTooLargePayload(context, events, done) {
  const sizeBytes = 65 * 1024; // 65KB
  const oversizedPayload = faker.string.alpha(sizeBytes);
  
  context.vars.oversizedPayload = oversizedPayload;
  context.vars.payloadSize = '65KB';
  
  return done();
}

/**
 * Generate random device info headers
 */
function generateDeviceInfo(context, events, done) {
  context.vars.deviceName = faker.helpers.arrayElement([
    'iPhone 14 Pro',
    'Samsung Galaxy S23',
    'Chrome Browser',
    'Firefox Browser',
  ]);
  
  context.vars.platform = faker.helpers.arrayElement([
    'IOS',
    'ANDROID',
    'WEB',
  ]);
  
  context.vars.deviceType = faker.helpers.arrayElement([
    'MOBILE',
    'WEB',
    'DESKTOP',
  ]);
  
  return done();
}

/**
 * Log custom metrics
 */
function logMetrics(context, events, done) {
  const startTime = context.vars.$startedAt;
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`[Metrics] Session duration: ${duration}ms`);
  console.log(`[Metrics] Events sent: ${context.vars.$eventsEmitted || 0}`);
  
  return done();
}
function calculateChurnDelays(context, events, done) {
  // Random từ 1 đến 5
  context.vars.churnStay = Math.floor(Math.random() * (5 - 1 + 1)) + 1;
  // Random từ 2 đến 8
  context.vars.churnWait = Math.floor(Math.random() * (8 - 2 + 1)) + 2;
  return done();
}
function calculateUnstableDelays(context, events, done) {
  // Random từ 5 đến 15
  context.vars.unstableStay = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
  // Random từ 1 đến 3
  context.vars.unstableOffline = Math.floor(Math.random() * (3 - 1 + 1)) + 1;
  return done();
}

function generateMessageData(context, events, done) {
  // Sinh nội dung tin nhắn ngẫu nhiên
  context.vars.msgContent = `Test message ${faker.string.alphanumeric(8)}`;
  // Sinh timestamp hiện tại
  context.vars.msgTimestamp = new Date().toISOString();
  return done();
}

/**
 *  Generate spam content
 */
function generateSpamData(context, events, done) {
  context.vars.spamContent = `spam ${faker.string.alphanumeric(5)}`;
  return done();
}
module.exports = {
  generateAuthToken,
  generateLargePayload,
  generateTooLargePayload,
  generateDeviceInfo,
  logMetrics,
  calculateChurnDelays,
  calculateUnstableDelays,
  generateMessageData,
  generateSpamData,
};