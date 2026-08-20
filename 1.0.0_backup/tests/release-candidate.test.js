/**
 * Master Release Candidate Regression Test Runner for DC Ultimate (Phases 1 - 20)
 */
import { runCoreTests } from './core.test.js';
import { runStorageTests } from './storage.test.js';
import { runParserTests } from './parser.test.js';
import { runDOMObserverTests } from './dom-observer.test.js';
import { runPhase2Tests } from './phase2.test.js';
import { runPhase3Tests } from './phase3.test.js';
import { runFullSuiteTests } from './full-suite.test.js';
import { runPhase7And8Tests } from './phase7-8.test.js';
import { runPhase12Tests } from './phase12.test.js';
import { runPhase13QATests } from './phase13.test.js';
import { runPhase14SearchQATests } from './phase14.test.js';
import { runPhase15IntegrationQATests } from './phase15.test.js';
import { runPhase16StateAndSWQATests } from './phase16.test.js';
import { runPhase17PerformanceQATests } from './phase17.test.js';
import { runPhase18SecurityQATests } from './phase18.test.js';
import { runPhase19E2EQATests } from './phase19.test.js';

async function main() {
  console.log('================================================================');
  console.log('  DC Ultimate RELEASE CANDIDATE (v1.0.0-RC) Master Test Runner');
  console.log('================================================================\n');

  try {
    console.log('[Phase 1] Core Architecture Tests:');
    await runCoreTests();
    console.log('\n[Phase 1 Storage] StorageManager & Schema Migration Tests:');
    await runStorageTests();
    console.log('\n[Phase 2 Parsers] Parser Base Models Tests:');
    await runParserTests();
    console.log('\n[Phase 2 Observer] DOMObserver Throttling Tests:');
    await runDOMObserverTests();
    console.log('\n[Phase 2 Reading] Gallery & Article View Parser Tests:');
    await runPhase2Tests();
    console.log('\n[Phase 3 Search] Multi-Page Search Engine Basic Tests:');
    await runPhase3Tests();
    console.log('\n[Phase 4-6 Suite] Filter Actions, User Notes, Media & Backup Tests:');
    await runFullSuiteTests();
    console.log('\n[Phase 7-8 Auth/AI] Session Auth & Privacy Masking Tests:');
    await runPhase7And8Tests();
    console.log('\n[Phase 12 Web QA] Real DCInside 13 Page Category Compatibility Tests:');
    await runPhase12Tests();
    console.log('\n[Phase 13 Feature QA] 17 Feature Category QA Tests:');
    await runPhase13QATests();
    console.log('\n[Phase 14 Search QA] 10 Deep Search Engine QA Tests:');
    await runPhase14SearchQATests();
    console.log('\n[Phase 15 Integration] 8 Cross-Feature E2E Scenario Tests:');
    await runPhase15IntegrationQATests();
    console.log('\n[Phase 16 Lifecycle] State, Storage & SW Restart Lifecycle Tests:');
    await runPhase16StateAndSWQATests();
    console.log('\n[Phase 17 Performance] Startup, CPU/Memory & Search Benchmarks:');
    await runPhase17PerformanceQATests();
    console.log('\n[Phase 18 Security] XSS Escape, Route & Privacy Pipeline Audit:');
    await runPhase18SecurityQATests();
    console.log('\n[Phase 19 E2E Users] 10 Real User Workflow E2E QA Tests:');
    await runPhase19E2EQATests();

    console.log('\n================================================================');
    console.log('  🎉 ALL 19 REGRESSION SUITES PASSED SUCCESSFULLY! (0 DEFECTS)');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ REGRESSION FAILURE DETECTED:');
    console.error(err);
    process.exit(1);
  }
}

main();
