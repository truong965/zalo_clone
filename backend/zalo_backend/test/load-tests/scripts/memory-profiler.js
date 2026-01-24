/**
 * Memory Profiler for Socket Server
 * Monitors heap usage over time to detect memory leaks
 */

const v8 = require('v8');
const { writeFileSync } = require('fs');
const { join } = require('path');

// Configuration
const PROFILE_DURATION_MS = 3600000; // 1 hour
const SNAPSHOT_INTERVAL_MS = 60000;  // 1 minute
const HEAP_SNAPSHOT_DIR = join(__dirname, '../reports/heap-snapshots');

class MemoryProfiler {
  constructor() {
    this.snapshots = [];
    this.startTime = Date.now();
    this.initialHeap = process.memoryUsage();
  }

  /**
   * Take a memory snapshot
   */
  takeSnapshot() {
    const heap = process.memoryUsage();
    const timestamp = Date.now();
    const elapsed = Math.floor((timestamp - this.startTime) / 1000);

    const snapshot = {
      timestamp,
      elapsed,
      heapUsed: heap.heapUsed,
      heapTotal: heap.heapTotal,
      external: heap.external,
      rss: heap.rss,
      arrayBuffers: heap.arrayBuffers,
      
      // Calculate growth
      heapGrowth: heap.heapUsed - this.initialHeap.heapUsed,
      heapGrowthPercent: ((heap.heapUsed - this.initialHeap.heapUsed) / this.initialHeap.heapUsed * 100).toFixed(2),
    };

    this.snapshots.push(snapshot);

    console.log(`[${elapsed}s] Heap: ${this.formatBytes(heap.heapUsed)} / ${this.formatBytes(heap.heapTotal)} (Growth: ${snapshot.heapGrowthPercent}%)`);

    // Warning if growth is concerning
    if (snapshot.heapGrowthPercent > 50) {
      console.warn(`⚠️  WARNING: Heap growth exceeded 50%!`);
    }

    return snapshot;
  }

  /**
   * Take full V8 heap snapshot (detailed analysis)
   */
  takeV8HeapSnapshot(label = 'snapshot') {
    if (global.gc) {
      console.log('Running garbage collection before snapshot...');
      global.gc();
    }

    const filename = `${label}-${Date.now()}.heapsnapshot`;
    const filepath = join(HEAP_SNAPSHOT_DIR, filename);

    console.log(`Taking V8 heap snapshot: ${filename}`);
    
    const stream = v8.writeHeapSnapshot(filepath);
    console.log(`✅ Heap snapshot saved: ${filepath}`);
    console.log(`   Analyze with: chrome://inspect > Load snapshot`);

    return filepath;
  }

  /**
   * Analyze memory trend
   */
  analyzeTrend() {
    if (this.snapshots.length < 2) {
      return { trend: 'insufficient_data' };
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const mid = this.snapshots[Math.floor(this.snapshots.length / 2)];

    const totalGrowth = last.heapUsed - first.heapUsed;
    const growthRate = totalGrowth / (last.elapsed - first.elapsed); // bytes per second

    const trend = {
      totalGrowth,
      growthRate,
      totalGrowthPercent: ((totalGrowth / first.heapUsed) * 100).toFixed(2),
      firstSnapshot: first,
      midSnapshot: mid,
      lastSnapshot: last,
      verdict: this.getMemoryVerdict(totalGrowth, growthRate),
    };

    return trend;
  }

  /**
   * Determine if memory usage is healthy
   */
  getMemoryVerdict(totalGrowth, growthRate) {
    const growthMB = totalGrowth / (1024 * 1024);
    const growthRateKB = growthRate / 1024;

    if (growthRate > 1024) {
      // Growing > 1KB/sec = likely leak
      return {
        status: '🔴 MEMORY LEAK DETECTED',
        severity: 'critical',
        message: `Memory growing at ${growthRateKB.toFixed(2)} KB/s`,
      };
    } else if (growthRate > 100) {
      return {
        status: '🟡 SUSPICIOUS GROWTH',
        severity: 'warning',
        message: `Memory growing at ${growthRateKB.toFixed(2)} KB/s`,
      };
    } else if (totalGrowth > 100 * 1024 * 1024) {
      // Total growth > 100MB
      return {
        status: '🟡 HIGH MEMORY USAGE',
        severity: 'warning',
        message: `Total growth: ${growthMB.toFixed(2)} MB`,
      };
    } else {
      return {
        status: '✅ MEMORY STABLE',
        severity: 'ok',
        message: `Growth rate: ${growthRateKB.toFixed(2)} KB/s`,
      };
    }
  }

  /**
   * Generate report
   */
  generateReport() {
    const trend = this.analyzeTrend();
    const report = {
      profileDuration: Math.floor((Date.now() - this.startTime) / 1000),
      snapshotCount: this.snapshots.length,
      trend,
      snapshots: this.snapshots,
    };

    const reportPath = join(__dirname, '../reports/memory-profile-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Memory Profile Report:');
    console.log(`   Duration: ${report.profileDuration}s`);
    console.log(`   Snapshots: ${report.snapshotCount}`);
    console.log(`   Status: ${trend.verdict.status}`);
    console.log(`   ${trend.verdict.message}`);
    console.log(`\n   Report saved: ${reportPath}`);

    return report;
  }

  formatBytes(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }
}

/**
 * Run memory profiler
 */
async function runProfiler() {
  console.log('🔬 Starting Memory Profiler...');
  console.log(`   Duration: ${PROFILE_DURATION_MS / 1000}s`);
  console.log(`   Snapshot Interval: ${SNAPSHOT_INTERVAL_MS / 1000}s`);
  console.log(`   Note: Run with --expose-gc flag for accurate results`);
  console.log('');

  const profiler = new MemoryProfiler();

  // Take initial snapshot
  profiler.takeSnapshot();

  // Take baseline V8 snapshot
  profiler.takeV8HeapSnapshot('baseline');

  // Start periodic snapshots
  const interval = setInterval(() => {
    profiler.takeSnapshot();
  }, SNAPSHOT_INTERVAL_MS);

  // Run for specified duration
  setTimeout(() => {
    clearInterval(interval);

    // Take final snapshot
    profiler.takeSnapshot();
    profiler.takeV8HeapSnapshot('final');

    // Generate report
    profiler.generateReport();

    console.log('\n✅ Memory profiling complete');
    process.exit(0);
  }, PROFILE_DURATION_MS);
}

// Run if executed directly
if (require.main === module) {
  runProfiler().catch((error) => {
    console.error('Memory profiler error:', error);
    process.exit(1);
  });
}

module.exports = { MemoryProfiler };