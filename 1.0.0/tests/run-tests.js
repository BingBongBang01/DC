/**
 * Complete Automated Unit Test Suite Runner for DC Ultimate (Phases 1-22 Complete Suite)
 */
import './test-env.js';
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
import { runKeywordAlertTests } from './keyword-alert.test.js';
import { runAutoLoginTests } from './auto-login.test.js';
import { runPhase21Tests } from './phase21.test.js';
import { runPhase22Tests } from './phase22.test.js';

async function main() {
  console.log('===========================================================');
  console.log('  DC Ultimate Complete Production Test Suite (Phases 1-22)');
  console.log('===========================================================\n');

  try {
    await runCoreTests();
    console.log('');
    await runStorageTests();
    console.log('');
    await runParserTests();
    console.log('');
    await runDOMObserverTests();
    console.log('');
    await runPhase2Tests();
    console.log('');
    await runPhase3Tests();
    console.log('');
    await runFullSuiteTests();
    console.log('');
    await runPhase7And8Tests();
    console.log('');
    await runPhase12Tests();
    console.log('');
    await runPhase13QATests();
    console.log('');
    await runPhase14SearchQATests();
    console.log('');
    await runPhase15IntegrationQATests();
    console.log('');
    await runPhase16StateAndSWQATests();
    console.log('');
    await runPhase17PerformanceQATests();
    console.log('');
    await runPhase18SecurityQATests();
    console.log('');
    await runPhase19E2EQATests();
    console.log('');
    await runKeywordAlertTests();
    console.log('');
    await runAutoLoginTests();
    console.log('');
    await runPhase21Tests();
    console.log('');
    await runPhase22Tests();

    console.log('\n===========================================================');
    console.log('  🎉 ALL PHASE 1 THROUGH PHASE 19 TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================\n');
  } catch (err) {
    console.error('\n❌ TEST FAILURE ENCOUNTERED:');
    console.error(err);
    process.exit(1);
  }
}

main();
