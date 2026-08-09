import assert from 'assert';
import { automationEngine, AutomationJob } from '../src/core/automation/automation-engine.js';
import { searchEngine } from '../src/core/search/search-engine.js';
import { notificationManager } from '../src/core/notifications/notification-manager.js';
import { storageManager } from '../src/core/storage-manager.js';

export async function runAutomationTests() {
  console.log('--- Running Automation & Notification Tests ---');

  // Mock searchEngine to return a deterministic dataset
  const originalSearch = searchEngine.search;
  searchEngine.search = async () => ({
    totalCollected: 10,
    totalFiltered: 10,
    dataset: [
      { id: '10' },
      { id: '9' },
      { id: '8' },
      { id: '7' },
      { id: '6' }
    ] // Simulating new items with IDs > 5
  });

  // Spy on notificationManager
  const originalNotify = notificationManager.notify;
  let notifyCalled = false;
  let notifyMessage = '';
  notificationManager.notify = (id, title, message) => {
    notifyCalled = true;
    notifyMessage = message;
  };

  // Mock chrome alarms execution loop
  let alarmCallback = null;
  global.chrome.alarms.onAlarm.addListener = (fn) => {
    alarmCallback = fn;
  };

  // 1. Initialize (reset internal state first to simulate a fresh Service
  // Worker start; the singleton may already be initialized by earlier test
  // files, and AutomationEngine intentionally guards against re-registering
  // duplicate chrome.alarms.onAlarm listeners via _listenerBound).
  automationEngine._initialized = false;
  automationEngine._listenerBound = false;
  await automationEngine.init();

  // Create a custom test job
  const testJob = new AutomationJob({
    id: 'test_job_1',
    name: 'Test Job',
    type: 'SEARCH_MONITOR',
    lastResult: 5 // Simulated previous maxId
  });
  automationEngine.jobs = [testJob];
  await automationEngine.saveJobs();
  
  // Re-run setup
  automationEngine._setupAlarms();

  // 2. Trigger Alarm execution (alarm -> execution -> search)
  assert.ok(alarmCallback !== null, 'Alarm listener should be registered');
  await alarmCallback({ name: testJob.id });

  // 3. Verify Execution and Notification (search -> new result -> notification)
  assert.ok(notifyCalled, 'Notification should have been triggered for new results');
  assert.ok(notifyMessage.includes('5건이 감지되었습니다!'), 'Notification message should calculate diff correctly using IDs');

  // 4. Verify Failure Isolation
  // Inject error into searchEngine
  searchEngine.search = async () => { throw new Error('Simulated fetch error'); };
  await alarmCallback({ name: testJob.id });
  
  // Verify state
  const updatedJob = automationEngine.jobs.find(j => j.id === testJob.id);
  assert.strictEqual(updatedJob.errorState, 'Simulated fetch error', 'Failure should be captured in errorState');
  assert.strictEqual(updatedJob.lastResult, 10, 'Last result (maxId) should be preserved despite error');

  // Cleanup
  searchEngine.search = originalSearch;
  notificationManager.notify = originalNotify;
  
  console.log('✓ Automation execution loop and failure isolation passed');
}
