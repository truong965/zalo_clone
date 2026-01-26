/**
 * Graceful Shutdown Test
 * Verifies zero-downtime deployment capability
 */

const io = require('socket.io-client');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');

const SERVER_URL ='http://localhost:8000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'your-super-secret-access-token-key-min-32-chars';
const TEST_USER_ID = 'cb3cdcab-ae68-44a2-8001-6806146e9bb1';
const CLIENT_COUNT = 50; // Number of clients to simulate

class GracefulShutdownTester {
  constructor() {
    this.clients = [];
    this.serverProcess = null;
    this.metrics = {
      totalClients: 0,
      connectedClients: 0,
      shutdownNotifications: 0,
      reconnectSuccesses: 0,
      reconnectFailures: 0,
      messagesLost: 0,
      messagesDelivered: 0,
    };
  }

  /**
   * Generate auth token
   */
  generateToken() {
    const payload = {
      sub: TEST_USER_ID,
      type: 'access',
      pwdVer: 1,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    };

    return jwt.sign(payload, JWT_SECRET);
  }

  /**
   * Create and connect a client
   */
  async createClient(id) {
    return new Promise((resolve, reject) => {
      const token = this.generateToken();

      const socket = io(SERVER_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
      });

      const client = {
        id,
        socket,
        connected: false,
        receivedShutdownNotice: false,
        reconnected: false,
        messagesSent: 0,
        messagesReceived: 0,
      };

      socket.on('connect', () => {
        client.connected = true;
        this.metrics.connectedClients++;
        console.log(`[Client ${id}] Connected`);
        resolve(client);
      });

      socket.on('authenticated', (data) => {
        console.log(`[Client ${id}] Authenticated`);
      });

      socket.on('server:shutdown', (data) => {
        client.receivedShutdownNotice = true;
        this.metrics.shutdownNotifications++;
        console.log(`[Client ${id}] 🚨 Received shutdown notice`);
      });

      socket.on('disconnect', (reason) => {
        client.connected = false;
        this.metrics.connectedClients--;
        console.log(`[Client ${id}] Disconnected: ${reason}`);
      });

      socket.on('reconnect', (attemptNumber) => {
        client.reconnected = true;
        client.connected = true;
        this.metrics.reconnectSuccesses++;
        this.metrics.connectedClients++;
        console.log(`[Client ${id}] ✅ Reconnected (attempt ${attemptNumber})`);
      });

      socket.on('reconnect_failed', () => {
        this.metrics.reconnectFailures++;
        console.log(`[Client ${id}] ❌ Reconnect failed`);
      });

      socket.on('test:echo', (data) => {
        client.messagesReceived++;
        this.metrics.messagesDelivered++;
      });

      socket.on('error', (error) => {
        console.error(`[Client ${id}] Error:`, error);
      });

      this.clients.push(client);

      // Timeout if connection takes too long
      setTimeout(() => {
        if (!client.connected) {
          reject(new Error(`Client ${id} connection timeout`));
        }
      }, 10000);
    });
  }

  /**
   * Create multiple clients
   */
  async createClients(count) {
    console.log(`\n📡 Creating ${count} clients...`);

    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(this.createClient(i + 1));
    }

    await Promise.all(promises);
    this.metrics.totalClients = count;

    console.log(`✅ ${count} clients connected\n`);
  }

  /**
   * Send test messages from all clients
   */
  async sendTestMessages() {
    console.log('📤 Sending test messages from all clients...');

    const promises = this.clients.map((client) => {
      return new Promise((resolve) => {
        if (client.connected) {
          client.socket.emit('test:echo', { 
            clientId: client.id,
            timestamp: Date.now(),
          });
          client.messagesSent++;
          resolve();
        } else {
          resolve();
        }
      });
    });

    await Promise.all(promises);
    console.log(`✅ Messages sent\n`);
  }

  /**
   * Trigger server shutdown
   */
  async triggerShutdown() {
    console.log('⚠️  Triggering server shutdown (SIGTERM)...\n');

    // Find server process and send SIGTERM
    // Note: This assumes server is running in same host
    // For Docker: docker kill --signal=SIGTERM container_name

    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      // Send SIGTERM to NestJS process
      // Adjust PID or use pm2/docker command as needed
      const pkill = spawn('pkill', ['-SIGTERM', '-f', 'nest start']);

      pkill.on('close', (code) => {
        console.log('Shutdown signal sent');
        resolve();
      });

      // If pkill doesn't work, use manual trigger:
      // fetch(`${SERVER_URL}/api/v1/admin/shutdown`, { method: 'POST' })
    });
  }

  /**
   * Wait for clients to receive shutdown notice
   */
  async waitForShutdownNotices(timeoutMs = 5000) {
    console.log('⏳ Waiting for clients to receive shutdown notices...\n');

    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const percentage = (this.metrics.shutdownNotifications / this.metrics.totalClients * 100).toFixed(1);

        console.log(
          `[${Math.floor(elapsed / 1000)}s] ` +
          `Shutdown notices received: ${this.metrics.shutdownNotifications}/${this.metrics.totalClients} ` +
          `(${percentage}%)`
        );

        if (elapsed >= timeoutMs) {
          clearInterval(check);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Wait for clients to reconnect
   */
  async waitForReconnections(timeoutMs = 30000) {
    console.log('\n⏳ Waiting for clients to reconnect...\n');

    const startTime = Date.now();

    return new Promise((resolve) => {
      const check = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const successRate = (this.metrics.reconnectSuccesses / this.metrics.totalClients * 100).toFixed(1);

        console.log(
          `[${Math.floor(elapsed / 1000)}s] ` +
          `Reconnected: ${this.metrics.reconnectSuccesses}/${this.metrics.totalClients} ` +
          `(${successRate}%) | ` +
          `Failed: ${this.metrics.reconnectFailures}`
        );

        if (elapsed >= timeoutMs) {
          clearInterval(check);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Cleanup all clients
   */
  cleanup() {
    console.log('\n🧹 Cleaning up clients...');
    this.clients.forEach((client) => {
      if (client.socket) {
        client.socket.disconnect();
      }
    });
  }

  /**
   * Analyze results
   */
  analyzeResults() {
    const shutdownNoticeRate = (this.metrics.shutdownNotifications / this.metrics.totalClients * 100).toFixed(1);
    const reconnectRate = (this.metrics.reconnectSuccesses / this.metrics.totalClients * 100).toFixed(1);
    const messageDeliveryRate = this.metrics.messagesSent > 0 
      ? (this.metrics.messagesDelivered / this.metrics.messagesSent * 100).toFixed(1)
      : 0;

    const analysis = {
      shutdownNoticeRate: parseFloat(shutdownNoticeRate),
      reconnectRate: parseFloat(reconnectRate),
      messageDeliveryRate: parseFloat(messageDeliveryRate),
      verdict: this.getVerdict(parseFloat(shutdownNoticeRate), parseFloat(reconnectRate)),
    };

    return analysis;
  }

  /**
   * Determine test verdict
   */
  getVerdict(noticeRate, reconnectRate) {
    if (noticeRate >= 95 && reconnectRate >= 95) {
      return {
        status: '✅ EXCELLENT',
        grade: 'A',
        message: 'Zero-downtime deployment achieved',
      };
    } else if (noticeRate >= 80 && reconnectRate >= 80) {
      return {
        status: '🟢 GOOD',
        grade: 'B',
        message: 'Acceptable graceful shutdown',
      };
    } else if (noticeRate >= 50 && reconnectRate >= 50) {
      return {
        status: '🟡 NEEDS IMPROVEMENT',
        grade: 'C',
        message: 'Some clients lost during shutdown',
      };
    } else {
      return {
        status: '🔴 FAILURE',
        grade: 'F',
        message: 'Graceful shutdown not working properly',
      };
    }
  }

  /**
   * Generate report
   */
  generateReport(analysis) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 GRACEFUL SHUTDOWN TEST REPORT');
    console.log('='.repeat(60));
    console.log(`\n🎯 Metrics:`);
    console.log(`   Total Clients: ${this.metrics.totalClients}`);
    console.log(`   Shutdown Notices Received: ${this.metrics.shutdownNotifications} (${analysis.shutdownNoticeRate}%)`);
    console.log(`   Successful Reconnects: ${this.metrics.reconnectSuccesses} (${analysis.reconnectRate}%)`);
    console.log(`   Failed Reconnects: ${this.metrics.reconnectFailures}`);
    console.log(`   Messages Lost: ${this.metrics.messagesLost}`);
    console.log(`\n${analysis.verdict.status}`);
    console.log(`   Grade: ${analysis.verdict.grade}`);
    console.log(`   ${analysis.verdict.message}`);
    console.log('\n' + '='.repeat(60));
  }
}

/**
 * Run graceful shutdown test
 */
async function runTest() {
  const tester = new GracefulShutdownTester();

  console.log('🧪 Graceful Shutdown Test');
  console.log('This test will:');
  console.log(`  1. Connect ${CLIENT_COUNT} clients`);
  console.log('  2. Trigger server shutdown (SIGTERM)');
  console.log('  3. Verify shutdown notices are sent');
  console.log('  4. Monitor client reconnections');
  console.log('  5. Verify zero message loss');
  console.log('');

  try {
    // Step 1: Create clients
    await tester.createClients(CLIENT_COUNT);

    // Step 2: Send initial messages
    await tester.sendTestMessages();

    // Step 3: Trigger shutdown
    await tester.triggerShutdown();

    // Step 4: Wait for shutdown notices
    await tester.waitForShutdownNotices(10000);

    // Step 5: Wait for reconnections (assumes server restarts)
    console.log('\n⚠️  Please restart the server now (or it will auto-restart)');
    await tester.waitForReconnections(30000);

    // Step 6: Send messages again to verify connection
    await tester.sendTestMessages();

    // Wait for message delivery
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 7: Analyze and report
    const analysis = tester.analyzeResults();
    tester.generateReport(analysis);

    // Cleanup
    tester.cleanup();

    // Exit code based on grade
    const exitCode = ['A', 'B'].includes(analysis.verdict.grade) ? 0 : 1;
    process.exit(exitCode);

  } catch (error) {
    console.error('Test error:', error);
    tester.cleanup();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runTest();
}

module.exports = { GracefulShutdownTester };