# DC Ultimate - Manual Chrome QA Checklist

## 1. Extension Loading Procedure

**Build Command**: N/A (The extension is raw JavaScript and loads natively).
**Load Directory**: `c:\Users\thk\Documents\GitHub\DC` (or your local clone path).
**Pre-build steps**: None.

**How to load:**
1. Open Google Chrome.
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** (압축해제된 확장 프로그램을 로드합니다).
5. Select the repository root folder (`DC`).

**How to inspect logs:**
- **Service Worker**: Go to `chrome://extensions`, find DC Ultimate, and click the blue `service worker` link to open its dedicated DevTools console.
- **Content Scripts/UI**: Open a DCInside page, press `F12` to open DevTools, and look at the `Console` and `Network` tabs.
- **Extension Errors**: Check for an `Errors` button on the extension card in `chrome://extensions`.

---

## E2E-SEARCH-001: Core Search Workflow
**Purpose**: Verify that the multi-page search collects, deduplicates, and aggregates results.
**Preconditions**: Extension loaded and enabled.
**Exact steps**:
1. Open any DCInside gallery (e.g. `https://gall.dcinside.com/board/lists/?id=programming`).
2. Locate the extension search UI.
3. Enter keyword: `2TB`.
4. Select the trade/transaction category (or relevant `headid` category available in that gallery).
5. Set search pages scope to `4` (or similar).
6. Click Search.
**Expected result**: The UI indicates loading, processes multiple pages, and displays a unified list of results.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [Screenshot or count number]

## E2E-PAGING-001: Source vs UI Pagination
**Purpose**: Verify that extension UI pages are decoupled from source pages.
**Preconditions**: E2E-SEARCH-001 is complete and a large dataset is displayed.
**Exact steps**:
1. Check the total number of unique results collected.
2. Change the UI display dropdown to `20/page`. Verify 20 items are visible.
3. Change to `50/page`. Verify 50 items are visible.
4. Change to `100/page`.
5. Change to `200/page`.
**Expected result**: The display updates immediately to show the correct number of items. Total collected count remains unchanged.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [ ]

## E2E-NETWORK-001: Network Verification
**Purpose**: Verify that changing UI page sizes does not trigger unnecessary DCInside fetches.
**Preconditions**: E2E-PAGING-001 is ready to be tested.
**Exact steps**:
1. Press `F12` to open Chrome DevTools.
2. Navigate to the **Network** tab and select **Fetch/XHR**.
3. Clear the network log (Click the clear icon).
4. Perform a search. Observe the multiple source-page requests (`lists/` or `search/`).
5. After the search completes, clear the network log again.
6. Change the UI page size from 20 to 50, then to 100.
**Expected result**: No new DCInside search requests should appear in the Network tab when changing UI page size.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [ ]

## E2E-CONSOLE-001: Console Errors
**Purpose**: Ensure no unhandled exceptions exist during the workflow.
**Preconditions**: Tests 001-003 have been executed.
**Exact steps**:
1. Review the `Console` tab in the webpage DevTools.
2. Review the `Console` tab in the Service Worker DevTools.
3. Check `chrome://extensions` for the `Errors` button.
**Expected result**: No uncaught exceptions, rejected promises, or message routing errors.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [ ]

## E2E-ARTICLE-001: Article Verification
**Purpose**: Verify the parser correctly extracts all required data fields.
**Preconditions**: Search results are visible on screen.
**Exact steps**:
1. Open one of the collected search result items.
2. Verify the following fields are accurately extracted and displayed:
   - Title
   - Author (Nickname / ID / IP)
   - Date
   - URL
   - Body/Content
   - Media (if applicable)
   - Comments (if applicable)
**Expected result**: All fields accurately reflect the source DCInside post without data loss.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [ ]

## E2E-FILTER-001: Filter Verification
**Purpose**: Verify filtering operates on the unified dataset without refetching.
**Preconditions**: Search results are visible.
**Exact steps**:
1. Open the extension Filter settings.
2. Add a filter rule (e.g. Title excludes: "판매완료").
3. Apply the filter.
**Expected result**: The visible result count decreases appropriately. The UI page count updates. The Network tab shows NO new DCInside fetches.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [ ]

## E2E-STORAGE-001: Storage Persistence
**Purpose**: Verify settings survive context reloads.
**Preconditions**: Extension is running.
**Exact steps**:
1. Change a configuration setting (e.g. toggle Dark Mode or a Filter).
2. Reload the Chrome tab (`F5`).
3. Reopen the extension settings.
**Expected result**: The modified setting remains saved.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [ ]

## E2E-SW-001: Service Worker Verification
**Purpose**: Verify the extension recovers from Service Worker suspension.
**Preconditions**: Chrome DevTools Service Worker inspector is open.
**Exact steps**:
1. Open `chrome://extensions` -> Service Worker DevTools.
2. In DevTools, go to `Application` -> `Service Workers`.
3. Click `Stop` to force the Service Worker to go idle/inactive.
4. Trigger an extension action (e.g. click the popup or run a search).
**Expected result**: The Service Worker wakes up automatically and the extension executes the action successfully.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [ ]

## E2E-AUTO-001: Automation Verification
**Purpose**: Verify background alarm monitoring works.
**Preconditions**: Global automation is enabled in settings.
**Exact steps**:
1. Create a Search Monitor job for keyword "2TB" with a 1-minute interval.
2. Wait 1-2 minutes for the `chrome.alarms` trigger to fire.
3. Observe desktop notifications.
**Expected result**: A desktop notification appears if new results are found, and the Service Worker console logs the execution.
**Actual result**: [ ]
**PASS / FAIL / BLOCKED**: [ ]
**Evidence**: [ ]

---

# MANUAL QA RESULT

Chrome version: 
Windows version: 
Extension version: v1.0.0
Build: Unpacked Source

E2E-SEARCH-001: [ ]
E2E-PAGING-001: [ ]
E2E-NETWORK-001: [ ]
E2E-CONSOLE-001: [ ]
E2E-ARTICLE-001: [ ]
E2E-FILTER-001: [ ]
E2E-STORAGE-001: [ ]
E2E-SW-001: [ ]
E2E-AUTO-001: [ ]

Critical defects:
...

Screenshots:
...

Console errors:
...

Network errors:
...

FINAL STATUS:

[ PASS / CONDITIONAL / FAIL / BLOCKED ]
