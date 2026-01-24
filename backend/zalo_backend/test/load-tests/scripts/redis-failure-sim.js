/**
 * Redis Failure Simulation Script
 * Tests system behavior when Redis goes down
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const REDIS_CONTAINER_NAME = process.env.REDIS_CONTAINER || 'redis-zalo';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8000';

class RedisFailureSimulator {
  constructor() {
    this.failureStart = null;
    this.failureEnd = null;
  }

  /**
   * Check if Redis container is running
   */
  async isRedisRunning() {
    try {
      const { stdout } = await execAsync(`docker ps --filter name=${REDIS_CONTAINER_NAME} --format "{{.Status}}"`);
      return stdout.trim().startsWith('Up');
    } catch (error) {
      console.error('Error checking Redis status:', error.message);
      return false;
    }
  }

  /**
   * Stop Redis container (simulate failure)
   */
  async stopRedis() {
    console.log(`⚠️  Stopping Redis container: ${REDIS_CONTAINER_NAME}`);
    this.failureStart = Date.now();

    try {
      await execAsync(`docker stop ${REDIS_CONTAINER_NAME}`);
      console.log('🔴 Redis stopped');
      return true;
    } catch (error) {
      console.error('Error stopping Redis:', error.message);
      return false;
    }
  }

  /**
   * Start Redis container (simulate recovery)
   */
  async startRedis() {
    console.log(`🔄 Starting Redis container: ${REDIS_CONTAINER_NAME}`);

    try {
      await execAsync(`docker start ${REDIS_CONTAINER_NAME}`);
      this.failureEnd = Date.now();
      
      const downtimeMs = this.failureEnd - this.failureStart;
      console.log(`✅ Redis recovered (Downtime: ${downtimeMs}ms)`);
      
      return { success: true, downtimeMs };
    } catch (error) {
      console.error('Error starting Redis:', error.message);
      return { success: false };
    }
  }

  /**
   * Check server health
   */
  async checkServerHealth() {
    try {
      const response = await fetch(`${SERVER_URL}/api/v1/health`);
      const data = await response.json();
      
      return {
        status: response.status,
        healthy: response.ok,
        redisConnected: data.info?.redis?.connected || false,
        details: data,
      };
    } catch (error) {
      return {
        status: 0,
        healthy: false,
        redisConnected: false,
        error: error.message,
      };
    }
  }

  /**
   * Monitor server during Redis failure
   */
  async monitorDuringFailure(durationMs = 30000) {
    console.log(`\n📊 Monitoring server for ${durationMs / 1000}s during Redis failure...\n`);

    const checks = [];
    const interval = 2000; // Check every 2 seconds
    const iterations = Math.floor(durationMs / interval);

    for (let i = 0; i < iterations; i++) {
      const health = await this.checkServerHealth();
      checks.push({
        timestamp: Date.now(),
        iteration: i + 1,
        ...health,
      });

      const statusEmoji = health.healthy ? '✅' : '❌';
      const redisEmoji = health.redisConnected ? '✅' : '❌';

      console.log(
        `[${i + 1}/${iterations}] Server: ${statusEmoji} | Redis: ${redisEmoji} | Status: ${health.status}`
      );

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return checks;
  }

  /**
   * Analyze monitoring results
   */
  analyzeResults(checks) {
    const healthyCount = checks.filter(c => c.healthy).length;
    const unhealthyCount = checks.length - healthyCount;
    const redisReconnectedCount = checks.filter(c => c.redisConnected).length;

    const analysis = {
      totalChecks: checks.length,
      healthyChecks: healthyCount,
      unhealthyChecks,
      redisReconnected: redisReconnectedCount > 0,
      healthPercentage: ((healthyCount / checks.length) * 100).toFixed(2),
      verdict: this.getFailoverVerdict(checks),
    };

    return analysis;
  }

  /**
   * Determine failover quality
   */
  getFailoverVerdict(checks) {
    // Find first healthy check after Redis recovery
    const firstHealthy = checks.findIndex(c => c.redisConnected);
    
    if (firstHealthy === -1) {
      return {
        status: '🔴 FAILURE',
        message: 'Redis never reconnected during test period',
        grade: 'F',
      };
    }

    const recoveryTime = firstHealthy * 2000; // Each check is 2s apart

    if (recoveryTime <= 5000) {
      return {
        status: '✅ EXCELLENT',
        message: `Redis reconnected in ${recoveryTime / 1000}s`,
        grade: 'A',
      };
    } else if (recoveryTime <= 10000) {
      return {
        status: '🟢 GOOD',
        message: `Redis reconnected in ${recoveryTime / 1000}s`,
        grade: 'B',
      };
    } else if (recoveryTime <= 20000) {
      return {
        status: '🟡 ACCEPTABLE',
        message: `Redis reconnected in ${recoveryTime / 1000}s`,
        grade: 'C',
      };
    } else {
      return {
        status: '🔴 SLOW',
        message: `Redis reconnected in ${recoveryTime / 1000}s (too slow)`,
        grade: 'D',
      };
    }
  }

  /**
   * Generate report
   */
  generateReport(checks, analysis) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 REDIS FAILURE SIMULATION REPORT');
    console.log('='.repeat(60));
    console.log(`\n🎯 Results:`);
    console.log(`   Total Checks: ${analysis.totalChecks}`);
    console.log(`   Healthy: ${analysis.healthyChecks} (${analysis.healthPercentage}%)`);
    console.log(`   Unhealthy: ${analysis.unhealthyChecks}`);
    console.log(`   Redis Reconnected: ${analysis.redisReconnected ? 'Yes' : 'No'}`);
    console.log(`\n${analysis.verdict.status}`);
    console.log(`   ${analysis.verdict.message}`);
    console.log(`   Grade: ${analysis.verdict.grade}`);
    console.log('\n' + '='.repeat(60));
  }
}

/**
 * Run Redis failure simulation
 */
async function runSimulation() {
  const simulator = new RedisFailureSimulator();

  console.log('🧪 Redis Failure Simulation Test');
  console.log('This test will:');
  console.log('  1. Stop Redis container');
  console.log('  2. Monitor server behavior');
  console.log('  3. Restart Redis');
  console.log('  4. Verify recovery');
  console.log('');

  // Step 1: Verify Redis is running
  const isRunning = await simulator.isRedisRunning();
  if (!isRunning) {
    console.error('❌ Redis container is not running. Please start it first.');
    process.exit(1);
  }

  console.log('✅ Redis is running\n');

  // Step 2: Stop Redis
  await simulator.stopRedis();
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 3: Monitor during failure
  const checks = await simulator.monitorDuringFailure(30000);

  // Step 4: Restart Redis
  const recovery = await simulator.startRedis();
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 5: Verify full recovery
  console.log('\n🔍 Verifying full recovery...');
  const finalChecks = await simulator.monitorDuringFailure(10000);
  
  // Step 6: Analyze results
  const allChecks = [...checks, ...finalChecks];
  const analysis = simulator.analyzeResults(allChecks);

  // Step 7: Generate report
  simulator.generateReport(allChecks, analysis);

  // Exit code based on grade
  const exitCode = ['A', 'B', 'C'].includes(analysis.verdict.grade) ? 0 : 1;
  process.exit(exitCode);
}

// Run if executed directly
if (require.main === module) {
  runSimulation().catch((error) => {
    console.error('Simulation error:', error);
    process.exit(1);
  });
}

module.exports = { RedisFailureSimulator };