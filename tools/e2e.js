/* End-to-end check of the real page in headless Chrome over the DevTools
   Protocol - no npm packages, only Node's built-in WebSocket.

   Usage:  node tools/e2e.js            (needs tools/serve.js on port 5599)

   It walks the Day 1 demo story (reference images 01-04), asserts the DOM,
   reloads to prove persistence, captures screenshots into docs/screenshots/
   and fails if the page logged any error.                                  */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const BASE = process.env.SJ_BASE || 'http://127.0.0.1:5599/index.html?demo=1';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const DEBUG_PORT = Number(process.env.SJ_CDP_PORT || 9333);

let passed = 0;
let failed = 0;
const pageErrors = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('  PASS  ' + label);
  } else {
    failed += 1;
    console.log('  FAIL  ' + label + (detail === undefined ? '' : '  -> ' + JSON.stringify(detail)));
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) { throw new Error('No Chrome or Edge executable found.'); }
  return found;
}

/* ------------------------------------------------------------ CDP plumbing */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) { reject(new Error(msg.error.message)); } else { resolve(msg.result); }
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        pageErrors.push('exception: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        pageErrors.push('console.error: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
      }
    });
  }

  send(method, params) {
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params: params || {} });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 20000);
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: '(function(){' + expression + '})()',
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error('page exception: ' + JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails.text));
    }
    return result.result.value;
  }

  async shot(name, fullPage) {
    /* Transient toasts from the previous step would otherwise clutter the
       evidence screenshot. */
    await this.eval(`document.getElementById('toast-region').replaceChildren(); return true;`);
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: fullPage !== false
    });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(result.data, 'base64'));
    console.log('        screenshot -> docs/screenshots/' + name);
  }
}

async function connect() {
  const list = await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/list').then((r) => r.json());
  const page = list.find((target) => target.type === 'page');
  if (!page) { throw new Error('No page target found.'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  return cdp;
}

async function waitForApp(cdp) {
  for (let i = 0; i < 60; i += 1) {
    const ready = await cdp.eval('return !!(window.SJ && SJ.app && SJ.store.getState());');
    if (ready) { return true; }
    await sleep(150);
  }
  return false;
}

/* ------------------------------------------------------------------ story */

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const chrome = findChrome();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sj-e2e-'));
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    /* English browser UI so native date/time controls match the English page
       in the captured evidence screenshots. */
    '--lang=en-NZ',
    '--window-size=1440,1000',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + profileDir,
    BASE
  ], { stdio: 'ignore' });

  let cdp;
  try {
    for (let i = 0; i < 40 && !cdp; i += 1) {
      await sleep(300);
      try { cdp = await connect(); } catch (err) { cdp = null; }
    }
    if (!cdp) { throw new Error('Could not attach to the browser on port ' + DEBUG_PORT); }

    console.log('\n== Boot (image 01) ==');
    check('app booted', await waitForApp(cdp));
    await sleep(600);
    const boot = await cdp.eval(`
      return {
        cards: document.querySelectorAll('.journey-card').length,
        count: document.getElementById('results-count').textContent,
        person: document.getElementById('current-person-name').textContent,
        demoVisible: !document.getElementById('demo-tools').hidden,
        hint: document.getElementById('browse-hint').hidden ? '' : document.getElementById('browse-hint').textContent,
        seedNotice: document.getElementById('seed-notice').hidden ? '' : document.getElementById('seed-notice').textContent,
        columns: getComputedStyle(document.getElementById('journey-grid')).gridTemplateColumns.split(' ').length,
        firstRoute: document.querySelector('.journey-card .card-route').textContent.trim(),
        dates: Array.from(document.querySelectorAll('.journey-card .card-meta span:first-child')).map(function (n) { return n.textContent; })
      };`);
    check('6 seed cards rendered', boot.cards === 6, boot.cards);
    check('result count text', boot.count === '6 journeys', boot.count);
    check('demo person defaults to Alex Taylor', boot.person === 'Alex Taylor', boot.person);
    check('demo tools visible only with ?demo=1', boot.demoVisible === true);
    check('browse hint explains the view', boot.hint.indexOf('Showing every open journey') === 0, boot.hint);
    check('no seed warning over http', boot.seedNotice === '', boot.seedNotice);
    check('desktop grid is 3 columns', boot.columns === 3, boot.columns);
    check('first card route is Auckland to Hamilton', /Auckland/.test(boot.firstRoute) && /Hamilton/.test(boot.firstRoute), boot.firstRoute);
    await cdp.shot('01_browse.png');

    console.log('\n== Selection rules (image 01) ==');
    await cdp.eval(`document.querySelector('input[data-action="toggle-select"][data-post-id="POST-001"]').click(); return true;`);
    await cdp.eval(`document.querySelector('input[data-action="toggle-select"][data-post-id="POST-002"]').click(); return true;`);
    await sleep(120);
    const sel = await cdp.eval(`
      return {
        barHidden: document.getElementById('selection-bar').hidden,
        barDisplay: getComputedStyle(document.getElementById('selection-bar')).display,
        count: document.getElementById('selected-count').textContent,
        type: document.getElementById('selected-type').textContent,
        selectedCards: document.querySelectorAll('.journey-card.is-selected').length
      };`);
    check('selection bar appears', sel.barHidden === false && sel.barDisplay === 'flex', sel);
    check('2 journeys selected', sel.count === '2 journeys selected', sel.count);
    check('selection highlights 2 cards', sel.selectedCards === 2, sel.selectedCards);
    check('same-type note shown', /All selected journeys are Driver/.test(sel.type), sel.type);
    await cdp.shot('01b_selection.png');

    await cdp.eval(`document.querySelector('input[data-action="toggle-select"][data-post-id="POST-004"]').click(); return true;`);
    await sleep(120);
    const mixed = await cdp.eval(`
      var box = document.querySelector('input[data-action="toggle-select"][data-post-id="POST-004"]');
      return {
        error: document.getElementById('selection-error').hidden ? '' : document.getElementById('selection-error').textContent,
        stillTwo: document.getElementById('selected-count').textContent,
        checkboxRolledBack: box.checked === false
      };`);
    check('mixed post type refused', /only contain one post type/.test(mixed.error), mixed.error);
    check('mixed click did not change the selection', mixed.stillTwo === '2 journeys selected', mixed.stillTwo);
    check('mixed checkbox rolled back', mixed.checkboxRolledBack === true);

    console.log('\n== Filters (requirement 04) ==');
    const filtered = await cdp.eval(`
      document.getElementById('origin-filter').value = 'auckland';
      document.getElementById('destination-filter').value = 'Hamilton';
      document.getElementById('filter-form').requestSubmit();
      return {
        count: document.getElementById('results-count').textContent,
        cards: document.querySelectorAll('.journey-card').length,
        selectionCleared: document.getElementById('selection-bar').hidden,
        hint: document.getElementById('browse-hint').textContent
      };`);
    check('filter narrows to 3 journeys', filtered.count === '3 journeys', filtered.count);
    check('3 cards rendered', filtered.cards === 3, filtered.cards);
    check('changing filters cleared the selection', filtered.selectionCleared === true);
    check('hint names the applied filter', /Filter applied/.test(filtered.hint), filtered.hint);

    const noResult = await cdp.eval(`
      document.getElementById('origin-filter').value = 'Nowhere';
      document.getElementById('filter-form').requestSubmit();
      return {
        empty: document.getElementById('empty-state').hidden === false,
        count: document.getElementById('results-count').textContent
      };`);
    check('empty state appears for no match', noResult.empty === true && noResult.count === '0 journeys', noResult);

    const cleared = await cdp.eval(`
      document.getElementById('empty-clear-btn').click();
      return {
        count: document.getElementById('results-count').textContent,
        origin: document.getElementById('origin-filter').value
      };`);
    check('clear filters restores 6 journeys', cleared.count === '6 journeys' && cleared.origin === '', cleared);

    console.log('\n== Details dialog (image 04) ==');
    await cdp.eval(`document.querySelector('[data-action="view-details"][data-post-id="POST-001"]').click(); return true;`);
    await sleep(150);
    const details = await cdp.eval(`
      var dialog = document.getElementById('details-dialog');
      var body = document.getElementById('details-body');
      return {
        open: dialog.open,
        title: document.getElementById('details-dialog-title').textContent,
        hasContact: body.textContent.indexOf('Publisher contact details (public)') !== -1,
        phone: /\\+64 21 555 0102/.test(body.textContent),
        applyEnabled: document.getElementById('details-apply-btn').disabled === false,
        applyLabel: document.getElementById('details-apply-btn').textContent,
        codeHidden: body.textContent.indexOf('DEMO-0001') === -1
      };`);
    check('details dialog opens', details.open === true);
    check('publisher phone is public in details', details.hasContact && details.phone, details);
    check('Apply is enabled for a stranger', details.applyEnabled === true, details.applyLabel);
    check('management code is never shown publicly', details.codeHidden === true);
    await cdp.shot('04_details.png');

    console.log('\n== First-time profile (image 02) ==');
    await cdp.eval(`document.getElementById('details-apply-btn').click(); return true;`);
    await sleep(200);
    const profileDialog = await cdp.eval(`
      return {
        profileOpen: document.getElementById('profile-dialog').open,
        resultsOpen: document.getElementById('results-dialog').open,
        intro: document.getElementById('profile-dialog-intro').textContent,
        namePrefill: document.getElementById('profile-name').value
      };`);
    check('Your Details opens before the application', profileDialog.profileOpen === true);
    check('no application was sent yet', profileDialog.resultsOpen === false);
    check('intro explains the resume behaviour', /applied to in one batch|sent straight away/.test(profileDialog.intro), profileDialog.intro);
    check('demo name prefilled', profileDialog.namePrefill === 'Alex Taylor', profileDialog.namePrefill);
    await cdp.shot('02_profile.png');

    const validation = await cdp.eval(`
      document.getElementById('profile-phone').value = '12';
      document.getElementById('profile-email').value = 'not-an-email';
      document.getElementById('profile-form').requestSubmit();
      return {
        phoneError: document.getElementById('profile-phone-error').hidden ? '' : document.getElementById('profile-phone-error').textContent,
        emailError: document.getElementById('profile-email-error').hidden ? '' : document.getElementById('profile-email-error').textContent,
        stillOpen: document.getElementById('profile-dialog').open,
        applications: JSON.parse(localStorage.getItem('sj_demo_state_v2')).applications.length
      };`);
    check('phone validation message', /digits, spaces/.test(validation.phoneError), validation.phoneError);
    check('email validation message', /valid email address/.test(validation.emailError), validation.emailError);
    check('dialog stays open on invalid input', validation.stillOpen === true);
    check('nothing was saved while invalid', validation.applications === 0, validation.applications);

    console.log('\n== Single application (requirement 03) ==');
    await cdp.eval(`
      document.getElementById('profile-phone').value = '+64 21 555 0101';
      document.getElementById('profile-email').value = 'alex.taylor@example.com';
      document.getElementById('profile-form').requestSubmit();
      return true;`);
    await sleep(300);
    const single = await cdp.eval(`
      var body = document.getElementById('results-body');
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      return {
        resultsOpen: document.getElementById('results-dialog').open,
        title: document.getElementById('results-dialog-title').textContent,
        recordIds: Array.from(body.querySelectorAll('.credential strong')).map(function (n) { return n.textContent; }),
        pending: body.textContent.indexOf('Pending') !== -1,
        storedApplications: stored.applications.length,
        storedStatus: stored.applications[0] && stored.applications[0].status,
        applicant: stored.applications[0] && stored.applications[0].applicantEmail,
        copyButton: !!body.querySelector('[data-action="copy-record"]')
      };`);
    check('results dialog reports 1 application', single.resultsOpen === true && single.title === '1 application submitted', single.title);
    check('record ID and management code shown', single.recordIds.length === 2 && single.recordIds[0] === 'APP-041', single.recordIds);
    check('code format XXXX-XXXX', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(single.recordIds[1] || ''), single.recordIds[1]);
    check('status is Pending', single.pending === true && single.storedStatus === 'Pending', single.storedStatus);
    check('application really stored', single.storedApplications === 1, single.storedApplications);
    check('applicant contact snapshot stored', single.applicant === 'alex.taylor@example.com', single.applicant);
    check('copy button available', single.copyButton === true);
    await cdp.shot('05_results_single.png');

    console.log('\n== Persistence across a reload (Gate D1) ==');
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(400);
    check('app boots again after reload', await waitForApp(cdp));
    await sleep(600);
    const afterReload = await cdp.eval(`
      var box = document.querySelector('input[data-action="toggle-select"][data-post-id="POST-001"]');
      var card = document.querySelector('.journey-card[data-post-id="POST-001"]');
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      return {
        cards: document.querySelectorAll('.journey-card').length,
        boxDisabled: box.disabled,
        toggleLabel: card.querySelector('.select-toggle span').textContent,
        badge: card.querySelector('.card-top').textContent,
        applications: stored.applications.length
      };`);
    check('published data survives the reload', afterReload.cards === 6 && afterReload.applications === 1, afterReload);
    check('applied card is marked Pending and cannot be selected again', afterReload.boxDisabled === true && /Pending/.test(afterReload.badge), afterReload);

    console.log('\n== Batch application (image 05) ==');
    await cdp.eval(`
      document.querySelector('input[data-action="toggle-select"][data-post-id="POST-002"]').click();
      document.querySelector('input[data-action="toggle-select"][data-post-id="POST-003"]').click();
      return true;`);
    await sleep(150);
    const readyBatch = await cdp.eval(`return document.getElementById('selected-count').textContent;`);
    check('two journeys selected for the batch', readyBatch === '2 journeys selected', readyBatch);
    await cdp.eval(`document.getElementById('apply-selected-btn').click(); return true;`);
    await sleep(300);
    const batch = await cdp.eval(`
      var body = document.getElementById('results-body');
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      var codes = Array.from(body.querySelectorAll('.credential strong')).map(function (n) { return n.textContent; });
      return {
        title: document.getElementById('results-dialog-title').textContent,
        cards: body.querySelectorAll('.result-card').length,
        codes: codes,
        stored: stored.applications.length,
        selectionCleared: document.getElementById('selection-bar').hidden
      };`);
    check('batch reports 2 applications', batch.title === '2 applications submitted', batch.title);
    check('one result card per journey', batch.cards === 2, batch.cards);
    check('two record IDs and two different codes', batch.codes.length === 4 && batch.codes[1] !== batch.codes[3], batch.codes);
    check('three applications stored in one snapshot', batch.stored === 3, batch.stored);
    check('selection cleared after submitting', batch.selectionCleared === true);
    const hiddenBar = await cdp.eval(`
      return getComputedStyle(document.getElementById('selection-bar')).display;`);
    check('empty selection bar is really not painted', hiddenBar === 'none', hiddenBar);
    await cdp.shot('05b_results_batch.png');

    console.log('\n== My Activity (image 06 data) ==');
    await cdp.eval(`document.getElementById('results-view-activity').click(); return true;`);
    await sleep(250);
    const activity = await cdp.eval(`
      return {
        viewVisible: document.getElementById('activity-view').hidden === false,
        browseHidden: document.getElementById('browse-view').hidden === true,
        tab: document.querySelector('#activity-tabs .tab[aria-selected="true"]').getAttribute('data-tab'),
        rows: document.querySelectorAll('#my-applications-list .record-row').length,
        badge: document.getElementById('tab-count-applications').textContent,
        banner: document.getElementById('my-applications-banner').textContent
      };`);
    check('My Activity view replaces Browse', activity.viewVisible === true && activity.browseHidden === true);
    check('View My Applications opens the right tab', activity.tab === 'my-applications', activity.tab);
    check('3 application rows listed', activity.rows === 3 && activity.badge === '3', activity);
    check('status banner summarises pending work', /waiting for the publisher/.test(activity.banner), activity.banner);
    await cdp.shot('06_activity.png');

    await cdp.eval(`document.querySelector('#activity-tabs .tab[data-tab="received"]').click(); return true;`);
    await sleep(150);
    const receivedForAlex = await cdp.eval(`
      return {
        tab: document.querySelector('#activity-tabs .tab[aria-selected="true"]').getAttribute('data-tab'),
        empty: document.getElementById('received-list').textContent
      };`);
    check('Received tab switches panels', receivedForAlex.tab === 'received');
    check('Alex received nothing (he owns no post)', /not published a journey yet/.test(receivedForAlex.empty), receivedForAlex.empty);

    await cdp.eval(`document.getElementById('refresh-status-btn').click(); return true;`);
    await sleep(300);
    const refreshed = await cdp.eval(`
      return {
        toast: (document.querySelector('.toast') || {}).textContent || '',
        rows: document.querySelectorAll('#my-applications-list .record-row').length
      };`);
    check('refresh re-reads local storage and says so', /local storage/.test(refreshed.toast), refreshed.toast);
    check('rows survive the refresh', refreshed.rows === 3, refreshed.rows);

    console.log('\n== Family filters keep Browse state ==');
    await cdp.eval(`document.getElementById('nav-browse').click(); return true;`);
    await sleep(150);
    const backToBrowse = await cdp.eval(`
      document.getElementById('origin-filter').value = 'Auckland';
      document.getElementById('type-filter').value = 'driver';
      document.getElementById('filter-form').requestSubmit();
      document.getElementById('nav-activity').click();
      document.getElementById('nav-browse').click();
      return {
        origin: document.getElementById('origin-filter').value,
        type: document.getElementById('type-filter').value,
        count: document.getElementById('results-count').textContent
      };`);
    check('filters survive a view switch', backToBrowse.origin === 'Auckland' && backToBrowse.type === 'driver', backToBrowse);
    check('filtered count kept', backToBrowse.count === '3 journeys', backToBrowse.count);
    await cdp.eval(`document.getElementById('clear-filters-btn').click(); return true;`);

    console.log('\n== Post a Journey (image 03) ==');
    await cdp.eval(`document.getElementById('post-journey-btn').click(); return true;`);
    await sleep(200);
    const postDialog = await cdp.eval(`
      var contact = document.getElementById('post-contact').textContent;
      return {
        open: document.getElementById('post-dialog').open,
        contactShowsPhone: /\\+64 21 555 0101/.test(contact),
        readOnlyText: /read only/.test(contact),
        dateDefault: document.getElementById('post-date').value,
        typeDriverChecked: document.getElementById('post-type-driver').checked,
        minDate: document.getElementById('post-date').min
      };`);
    check('post dialog opens', postDialog.open === true);
    check('saved contact shown read-only', postDialog.contactShowsPhone && postDialog.readOnlyText, postDialog);
    check('driver type preselected', postDialog.typeDriverChecked === true);
    check('date input blocks past dates', postDialog.minDate === postDialog.dateDefault || !!postDialog.minDate, postDialog);

    const postValidation = await cdp.eval(`
      document.getElementById('post-origin').value = 'Auckland';
      document.getElementById('post-destination').value = 'Auckland';
      document.getElementById('post-date').value = '2020-01-01';
      document.getElementById('post-time').value = '09:00';
      document.getElementById('post-form').requestSubmit();
      return {
        destError: document.getElementById('post-destination-error').hidden ? '' : document.getElementById('post-destination-error').textContent,
        dateError: document.getElementById('post-date-error').hidden ? '' : document.getElementById('post-date-error').textContent,
        stored: JSON.parse(localStorage.getItem('sj_demo_state_v2')).posts.length
      };`);
    check('same-city destination refused', /different cities/.test(postValidation.destError), postValidation.destError);
    check('past date refused', /cannot be in the past/.test(postValidation.dateError), postValidation.dateError);
    check('no post stored while invalid', postValidation.stored === 6, postValidation.stored);
    await cdp.shot('03_post_validation.png');

    const published = await cdp.eval(`
      document.getElementById('post-destination').value = 'Wellington';
      document.getElementById('post-date').value = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      document.getElementById('post-time').value = '07:15';
      document.getElementById('post-notes').value = 'Two seats, one suitcase each.';
      document.getElementById('post-type-passenger').click();
      document.getElementById('post-form').requestSubmit();
      return true;`);
    await sleep(300);
    const publishResult = await cdp.eval(`
      var body = document.getElementById('results-body');
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      var values = Array.from(body.querySelectorAll('.credential strong')).map(function (n) { return n.textContent; });
      var post = stored.posts[stored.posts.length - 1];
      return {
        title: document.getElementById('results-dialog-title').textContent,
        values: values,
        stored: stored.posts.length,
        type: post.postType,
        owner: post.ownerProfileId,
        status: post.status,
        codeLeaked: document.querySelector('.journey-grid') ? document.querySelector('.journey-grid').textContent.indexOf(post.managementCode) !== -1 : null
      };`);
    check('publish confirmed in the results dialog', publishResult.title === 'Journey published', publishResult.title);
    check('new post gets POST-007 and its own code', publishResult.values[0] === 'POST-007' && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(publishResult.values[1] || ''), publishResult.values);
    check('post stored as Open passenger post of Alex', publishResult.stored === 7 && publishResult.type === 'passenger' && publishResult.owner === 'PROF-ALEX' && publishResult.status === 'Open', publishResult);
    check('management code absent from the public cards', publishResult.codeLeaked === false, publishResult.codeLeaked);

    const gridAfter = await cdp.eval(`
      document.getElementById('results-dialog').close();
      return { cards: document.querySelectorAll('.journey-card').length, count: document.getElementById('results-count').textContent };`);
    check('new journey appears in Browse', gridAfter.cards === 7 && gridAfter.count === '7 journeys', gridAfter);
    await cdp.shot('01c_browse_after_post.png');

    console.log('\n== Manage a Record (image 09) ==');
    await cdp.eval(`document.getElementById('nav-manage').click(); return true;`);
    await sleep(150);
    const manageWrong = await cdp.eval(`
      document.getElementById('manage-record-id').value = 'POST-001';
      document.getElementById('manage-code').value = 'ZZZZ-9999';
      document.getElementById('manage-form').requestSubmit();
      return {
        open: document.getElementById('manage-dialog').open,
        error: document.getElementById('manage-error').hidden ? '' : document.getElementById('manage-error').textContent,
        recordShown: document.getElementById('manage-result').textContent.length > 0
      };`);
    check('manage dialog opens', manageWrong.open === true);
    check('wrong code shows an error', /do not match any record/.test(manageWrong.error), manageWrong.error);
    check('wrong code reveals no record', manageWrong.recordShown === false);
    await cdp.shot('09_manage_wrong_code.png');

    const manageRight = await cdp.eval(`
      document.getElementById('manage-code').value = 'demo 0001';
      document.getElementById('manage-form').requestSubmit();
      var text = document.getElementById('manage-result').textContent;
      return {
        shown: text.length > 0,
        error: document.getElementById('manage-error').hidden ? '' : document.getElementById('manage-error').textContent,
        route: /Auckland/.test(text) && /Hamilton/.test(text),
        codeVisible: /DEMO-0001/.test(text)
      };`);
    check('correct code (case and space tolerant) opens the record', manageRight.shown === true, manageRight);
    check('record summary shows the real journey', manageRight.route === true, manageRight);
    check('owner sees their own management code', manageRight.codeVisible === true, manageRight);

    console.log('\n== Received Applications, publisher view (image 08 data) ==');
    await cdp.eval(`
      document.getElementById('manage-dialog').close();
      var select = document.getElementById('demo-person-select');
      select.value = 'PROF-ADAM';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;`);
    await sleep(300);
    const asAdam = await cdp.eval(`
      return {
        person: document.getElementById('current-person-name').textContent,
        receivedBadge: document.getElementById('tab-count-received').textContent,
        postsBadge: document.getElementById('tab-count-posts').textContent,
        selectionCleared: document.getElementById('selection-bar').hidden
      };`);
    check('identity switched to Adam Wilson', asAdam.person === 'Adam Wilson', asAdam.person);
    check('Adam owns 1 post and 1 received application', asAdam.postsBadge === '1' && asAdam.receivedBadge === '1', asAdam);

    await cdp.eval(`
      document.getElementById('nav-activity').click();
      document.querySelector('#activity-tabs .tab[data-tab="received"]').click();
      document.querySelector('#received-list [data-action="open-received"]').click();
      return true;`);
    await sleep(250);
    const receivedDialog = await cdp.eval(`
      var body = document.getElementById('received-body');
      var buttons = Array.from(body.querySelectorAll('.applicant-actions button'));
      return {
        open: document.getElementById('received-dialog').open,
        applicant: /Alex Taylor/.test(body.textContent),
        contact: /alex.taylor@example.com/.test(body.textContent),
        acceptEnabled: buttons.filter(function (b) { return b.textContent === 'Accept'; }).every(function (b) { return b.disabled === false; }),
        acceptCount: buttons.filter(function (b) { return b.textContent === 'Accept'; }).length,
        note: document.getElementById('received-note').textContent,
        rows: body.querySelectorAll('.applicant-row').length
      };`);
    check('publisher opens Received Applications', receivedDialog.open === true);
    check('applicant contact visible to the publisher', receivedDialog.applicant && receivedDialog.contact, receivedDialog);
    check('one applicant row', receivedDialog.rows === 1, receivedDialog.rows);
    check('Accept is offered to the publisher', receivedDialog.acceptCount === 1 && receivedDialog.acceptEnabled === true, receivedDialog);
    check('the dialog explains what accepting does', /automatically cancels/.test(receivedDialog.note), receivedDialog.note);

    console.log('\n== How It Works (image 10 content) ==');
    await cdp.eval(`
      document.getElementById('received-dialog').close();
      document.getElementById('nav-help').click();
      return true;`);
    await sleep(200);
    const help = await cdp.eval(`
      var dialog = document.getElementById('help-dialog');
      return {
        open: dialog.open,
        steps: dialog.querySelectorAll('.steps li').length,
        honest: /this browser/.test(dialog.textContent) && /no server/i.test(dialog.textContent)
      };`);
    check('help dialog opens with six steps', help.open === true && help.steps === 6, help);
    check('help states the local-only limits', help.honest === true, help);
    await cdp.shot('10_help.png');

    console.log('\n== Mobile layout (requirement 20) ==');
    await cdp.eval(`
      document.getElementById('help-dialog').close();
      var select = document.getElementById('demo-person-select');
      select.value = 'PROF-ALEX';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;`);
    await sleep(300);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      screenWidth: 390,
      screenHeight: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(500);
    await cdp.eval(`
      document.getElementById('nav-activity').click();
      document.querySelector('#activity-tabs .tab[data-tab="my-posts"]').click();
      return true;`);
    await sleep(350);
    const mobileActivity = await cdp.eval(`
      var row = document.querySelector('#my-posts-list .record-row');
      var label = row.querySelector('.cell-label');
      var cell = row.querySelector('.record-cell');
      return {
        width: window.innerWidth,
        columns: getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length,
        rowWidth: Math.round(row.getBoundingClientRect().width),
        cellWidth: Math.round(cell.getBoundingClientRect().width),
        labelVisible: getComputedStyle(label).display !== 'none',
        labelText: label.textContent,
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
      };`);
    check('emulated phone viewport', mobileActivity.width === 390, mobileActivity.width);
    check('activity row becomes a single-column card', mobileActivity.columns === 1, mobileActivity);
    check('cell stretches across the card', mobileActivity.cellWidth > mobileActivity.rowWidth - 40, mobileActivity);
    check('stacked card shows its field labels', mobileActivity.labelVisible === true && mobileActivity.labelText === 'Journey', mobileActivity);
    check('no horizontal overflow in My Activity', mobileActivity.overflow === true, mobileActivity);
    await cdp.shot('20_mobile_activity.png', false);

    await cdp.eval(`document.getElementById('nav-browse').click(); return true;`);
    await sleep(400);
    const mobileBrowse = await cdp.eval(`
      var grid = document.getElementById('journey-grid');
      var tabs = document.getElementById('activity-tabs');
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        firstCardWidth: Math.round(grid.firstElementChild.getBoundingClientRect().width),
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        tabsScrollable: tabs.scrollWidth >= tabs.clientWidth
      };`);
    check('single card column on a phone width', mobileBrowse.columns === 1, mobileBrowse);
    check('card fills the phone width', mobileBrowse.firstCardWidth > 300, mobileBrowse.firstCardWidth);
    check('no horizontal overflow in Browse', mobileBrowse.overflow === true, mobileBrowse);
    await cdp.shot('20_mobile_browse.png', false);
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    console.log('\n== Reset Demo Data ==');
    await sleep(200);
    await cdp.eval(`document.getElementById('demo-reset-btn').click(); return true;`);
    await sleep(250);
    await cdp.eval(`document.getElementById('confirm-ok-btn').click(); return true;`);
    await sleep(600);
    const afterReset = await cdp.eval(`
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      return {
        posts: stored.posts.length,
        applications: stored.applications.length,
        active: stored.activeProfileId,
        cards: document.querySelectorAll('.journey-card').length,
        person: document.getElementById('current-person-name').textContent
      };`);
    check('reset restores 6 posts and 0 applications', afterReset.posts === 6 && afterReset.applications === 0, afterReset);
    check('reset re-selects Alex for the demo', afterReset.active === 'PROF-ALEX' && afterReset.person === 'Alex Taylor', afterReset);
    check('browse re-rendered after reset', afterReset.cards === 6, afterReset.cards);

    console.log('\n== Duplicate click protection (requirement 18) ==');
    const doubleClick = await cdp.eval(`
      var button = document.querySelector('[data-action="view-details"][data-post-id="POST-004"]');
      button.click(); button.click(); button.click();
      return { open: document.getElementById('details-dialog').open,
               dialogs: document.querySelectorAll('dialog[open]').length };`);
    check('repeated clicks open one dialog instance', doubleClick.open === true && doubleClick.dialogs === 1, doubleClick);

    const doubleApplyNoDetails = await cdp.eval(`
      var btn = document.getElementById('details-apply-btn');
      btn.click(); btn.click();
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      return {
        profileOpen: document.getElementById('profile-dialog').open,
        dialogs: document.querySelectorAll('dialog[open]').length,
        applications: stored.applications.length
      };`);
    check('double Apply without details opens the profile dialog once', doubleApplyNoDetails.profileOpen === true && doubleApplyNoDetails.dialogs === 2, doubleApplyNoDetails);
    check('double Apply without details sends nothing', doubleApplyNoDetails.applications === 0, doubleApplyNoDetails);

    await cdp.eval(`
      document.getElementById('profile-name').value = 'Alex Taylor';
      document.getElementById('profile-phone').value = '+64 21 555 0101';
      document.getElementById('profile-email').value = 'alex.taylor@example.com';
      document.getElementById('profile-form').requestSubmit();
      return true;`);
    await sleep(350);
    const resumed = await cdp.eval(`
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      return {
        applications: stored.applications.length,
        profileSaved: stored.profiles.filter(function (p) { return p.profileId === 'PROF-ALEX'; })[0].phone,
        resultsOpen: document.getElementById('results-dialog').open
      };`);
    check('saving details resumed the paused application exactly once', resumed.applications === 1, resumed);
    check('profile stored once for the demo person', resumed.profileSaved === '+64 21 555 0101', resumed.profileSaved);
    check('resumed application reported in the results dialog', resumed.resultsOpen === true, resumed);

    const doubleApply = await cdp.eval(`
      document.getElementById('results-dialog').close();
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      var before = stored.applications.length;
      document.querySelector('[data-action="view-details"][data-post-id="POST-005"]').click();
      var btn = document.getElementById('details-apply-btn');
      btn.click(); btn.click();
      var after = JSON.parse(localStorage.getItem('sj_demo_state_v2')).applications.length;
      return { before: before, after: after };`);
    check('double Apply creates exactly one application (state machine re-check)', doubleApply.after === doubleApply.before + 1, doubleApply);

    const failureCard = await cdp.eval(`
      var body = document.getElementById('results-body');
      var card = body.querySelector('.result-card.is-failed');
      return {
        open: document.getElementById('results-dialog').open,
        failed: !!card,
        badge: card ? card.querySelector('.badge').textContent : '',
        reason: card ? card.textContent : ''
      };`);
    check('a refused application is reported as a failed item (requirement 06)', failureCard.failed === true, failureCard);
    check('the failed item explains the reason', /already have an active application/.test(failureCard.reason), failureCard.reason);

    /* ==================================================================
       DAY 2 — approvals, declines, withdrawals, cancellations (07 / 08 / 09)
       ================================================================== */
    const switchTo = async (profileId) => {
      await cdp.eval(`
        var select = document.getElementById('demo-person-select');
        select.value = '` + profileId + `';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;`);
      await sleep(280);
    };
    const openActivity = async (tab) => {
      await cdp.eval(`
        document.getElementById('nav-activity').click();
        document.querySelector('#activity-tabs .tab[data-tab="` + tab + `"]').click();
        return true;`);
      await sleep(220);
    };
    const resetDemo = async () => {
      await cdp.eval(`document.getElementById('demo-reset-btn').click(); return true;`);
      await sleep(250);
      await cdp.eval(`document.getElementById('confirm-ok-btn').click(); return true;`);
      await sleep(600);
    };
    const snapshot = async () => cdp.eval(`
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      var byId = {};
      stored.applications.forEach(function (a) { byId[a.applicationId] = a; });
      var posts = {};
      stored.posts.forEach(function (p) { posts[p.postId] = p; });
      return {
        applications: byId,
        posts: posts,
        statusList: stored.applications.map(function (a) { return a.applicationId + ':' + a.status; }).join(','),
        detail: Object.keys(byId).map(function (id) {
          return byId[id].applicationId + ':' + byId[id].status + ':' + byId[id].applicantProfileId;
        }).join(' | ')
      };`);

    console.log('\n== DAY 2: publish the demo story (three Pending applications) ==');
    await resetDemo();
    check('reset gives a clean six-journey slate', (await cdp.eval(`return JSON.parse(localStorage.getItem('sj_demo_state_v2')).posts.length;`)) === 6);

    await cdp.eval(`
      document.querySelector('[data-action="view-details"][data-post-id="POST-001"]').click();
      document.getElementById('details-apply-btn').click();
      return true;`);
    await sleep(300);
    await cdp.eval(`
      document.getElementById('profile-name').value = 'Alex Taylor';
      document.getElementById('profile-phone').value = '+64 21 555 0101';
      document.getElementById('profile-email').value = 'alex.taylor@example.com';
      document.getElementById('profile-form').requestSubmit();
      return true;`);
    await sleep(350);
    await cdp.eval(`
      document.getElementById('results-dialog').close();
      document.querySelector('input[data-action="toggle-select"][data-post-id="POST-002"]').click();
      document.querySelector('input[data-action="toggle-select"][data-post-id="POST-003"]').click();
      document.getElementById('apply-selected-btn').click();
      return true;`);
    await sleep(350);
    await cdp.eval(`document.getElementById('results-dialog').close(); return true;`);
    const threePending = await snapshot();
    check('Alex holds APP-041 Pending on POST-001', threePending.applications['APP-041'].status === 'Pending');
    check('APP-042 and APP-043 are Pending too',
      threePending.applications['APP-042'].status === 'Pending' && threePending.applications['APP-043'].status === 'Pending');
    check('all three journeys are still Open', threePending.posts['POST-001'].status === 'Open'
      && threePending.posts['POST-002'].status === 'Open' && threePending.posts['POST-003'].status === 'Open');

    console.log('\n== Publisher approves (image 08) ==');
    await switchTo('PROF-ADAM');
    await openActivity('my-posts');
    await cdp.eval(`document.querySelector('#my-posts-list [data-action="open-received"]').click(); return true;`);
    await sleep(320);
    const publisherView = await cdp.eval(`
      var body = document.getElementById('received-body');
      var accept = body.querySelector('[data-action="accept-application"]');
      var decline = body.querySelector('[data-action="decline-application"]');
      return {
        open: document.getElementById('received-dialog').open,
        rows: body.querySelectorAll('.applicant-row').length,
        acceptEnabled: !!accept && accept.disabled === false,
        declineEnabled: !!decline && decline.disabled === false,
        cancelPost: !!body.querySelector('[data-action="cancel-post"]'),
        postBadge: body.querySelector('.record-summary-head .badge').textContent
      };`);
    check('publisher dialog lists the applicant', publisherView.open === true && publisherView.rows === 1, publisherView);
    check('Accept and Decline are live controls', publisherView.acceptEnabled === true && publisherView.declineEnabled === true, publisherView);
    check('the journey is Open before the approval', publisherView.postBadge === 'Open', publisherView.postBadge);
    check('Cancel Post is offered to the publisher', publisherView.cancelPost === true, publisherView);
    await cdp.shot('08_received_accept.png');

    await cdp.eval(`document.querySelector('#received-body [data-action="accept-application"]').click(); return true;`);
    await sleep(450);
    const afterAccept = await snapshot();
    const acceptUi = await cdp.eval(`
      return {
        postBadge: document.querySelector('#received-body .record-summary-head .badge').textContent,
        rowBadges: Array.prototype.map.call(document.querySelectorAll('#received-body .applicant-actions .badge'), function (b) { return b.textContent; }).join(','),
        acceptGone: !document.querySelector('#received-body [data-action="accept-application"]'),
        toast: (document.querySelector('.toast') || {}).textContent || ''
      };`);
    check('the accepted application is Accepted', afterAccept.applications['APP-041'].status === 'Accepted');
    check('the journey becomes Confirmed and records the application',
      afterAccept.posts['POST-001'].status === 'Confirmed' && afterAccept.posts['POST-001'].confirmedApplicationId === 'APP-041');
    check('the traveller\'s other Pending applications are automatically cancelled',
      afterAccept.applications['APP-042'].status === 'Automatically Cancelled'
      && afterAccept.applications['APP-043'].status === 'Automatically Cancelled');
    check('the automatic cancellation writes a reason naming the journey',
      /accepted for journey POST-001/.test(afterAccept.applications['APP-042'].reason), afterAccept.applications['APP-042'].reason);
    check('the other publishers\' journeys are untouched',
      afterAccept.posts['POST-002'].status === 'Open' && afterAccept.posts['POST-003'].status === 'Open');
    check('the dialog refreshes in place', acceptUi.postBadge === 'Confirmed' && acceptUi.rowBadges === 'Accepted' && acceptUi.acceptGone === true, acceptUi);
    check('the publisher is told what happened automatically', /automatically cancelled/.test(acceptUi.toast), acceptUi.toast);
    await cdp.shot('08b_received_after_accept.png');

    await cdp.eval(`document.getElementById('received-dialog').close(); document.getElementById('nav-browse').click(); return true;`);
    await sleep(300);
    const browseAfterAccept = await cdp.eval(`
      return {
        hasConfirmed: !!document.querySelector('.journey-card[data-post-id="POST-001"]'),
        stillOpen: !!document.querySelector('.journey-card[data-post-id="POST-002"]'),
        cards: document.querySelectorAll('.journey-card').length
      };`);
    check('the confirmed journey leaves the public list', browseAfterAccept.hasConfirmed === false && browseAfterAccept.cards === 5, browseAfterAccept);
    check('the untouched journeys stay public', browseAfterAccept.stillOpen === true, browseAfterAccept);

    console.log('\n== Traveller sees Accepted + 2 auto-cancellations (image 07) ==');
    await switchTo('PROF-ALEX');
    await openActivity('my-applications');
    const alexView = await cdp.eval(`
      var banner = document.getElementById('my-applications-banner');
      return {
        acceptedBanner: !!banner.querySelector('.status-banner.accepted'),
        bannerText: banner.textContent,
        rows: document.querySelectorAll('#my-applications-list .record-row').length,
        badges: Array.prototype.map.call(document.querySelectorAll('#my-applications-list .badge'), function (b) { return b.textContent; }).join(','),
        reasons: /Automatically cancelled: this applicant was accepted/.test(document.getElementById('my-applications-list').textContent),
        cancelBtn: !!banner.querySelector('[data-action="cancel-journey"]'),
        viewBtn: !!banner.querySelector('[data-action="view-details"]')
      };`);
    check('the green Accepted banner appears', alexView.acceptedBanner === true, alexView);
    check('the banner names the confirmed journey', /confirmed for Auckland/.test(alexView.bannerText), alexView.bannerText);
    check('the banner counts the automatic cancellations', /2 of your other application/.test(alexView.bannerText), alexView.bannerText);
    check('three rows: 1 Accepted then 2 Automatically Cancelled',
      alexView.rows === 3 && alexView.badges === 'Automatically Cancelled,Automatically Cancelled,Accepted', alexView.badges);
    check('the cancelled rows keep their written reason', alexView.reasons === true, alexView);
    check('the banner offers View and Cancel Confirmed Journey', alexView.viewBtn && alexView.cancelBtn, alexView);
    await cdp.shot('07_accepted_banner.png');

    console.log('\n== Cancel Confirmed Journey reopens the journey (requirement 13) ==');
    await cdp.eval(`document.querySelector('#my-applications-banner [data-action="cancel-journey"]').click(); return true;`);
    await sleep(300);
    const cancelPrompt = await cdp.eval(`
      return {
        open: document.getElementById('confirm-dialog').open,
        message: document.getElementById('confirm-message').textContent,
        note: document.getElementById('confirm-note').textContent
      };`);
    check('giving up a confirmed place asks first', cancelPrompt.open === true && /becomes public again/.test(cancelPrompt.message), cancelPrompt);
    check('the prompt warns that other records do not revive', /do not become active again/.test(cancelPrompt.note), cancelPrompt.note);
    await cdp.eval(`document.getElementById('confirm-ok-btn').click(); return true;`);
    await sleep(450);
    const afterCancelJourney = await snapshot();
    check('the confirmed application becomes Cancelled', afterCancelJourney.applications['APP-041'].status === 'Cancelled');
    check('the journey is public again', afterCancelJourney.posts['POST-001'].status === 'Open');
    check('terminal records do not revive',
      afterCancelJourney.applications['APP-042'].status === 'Automatically Cancelled'
      && afterCancelJourney.applications['APP-043'].status === 'Automatically Cancelled');

    await cdp.eval(`document.getElementById('nav-browse').click(); return true;`);
    await sleep(300);
    const reopened = await cdp.eval(`
      var card = document.querySelector('.journey-card[data-post-id="POST-001"]');
      return {
        visible: !!card,
        selectable: card ? card.querySelector('input[data-action="toggle-select"]').disabled === false : null,
        toggleLabel: card ? card.querySelector('.select-toggle span').textContent : ''
      };`);
    check('the reopened journey is listed again', reopened.visible === true, reopened);
    check('Alex can apply again (his old record is terminal)', reopened.selectable === true && reopened.toggleLabel === 'Select', reopened);
    await cdp.shot('07b_after_cancel_reopen.png');

    console.log('\n== Requirement 10: the losing publisher cannot approve ==');
    await switchTo('PROF-MIA');
    await openActivity('my-posts');
    await cdp.eval(`document.querySelector('#my-posts-list [data-action="open-received"]').click(); return true;`);
    await sleep(320);
    const miaView = await cdp.eval(`
      var body = document.getElementById('received-body');
      return {
        rows: body.querySelectorAll('.applicant-row').length,
        badges: Array.prototype.map.call(body.querySelectorAll('.applicant-actions .badge'), function (b) { return b.textContent; }).join(','),
        acceptRendered: !!body.querySelector('[data-action="accept-application"]'),
        text: body.textContent
      };`);
    check('the applicant row is shown as Automatically Cancelled', miaView.rows === 1 && miaView.badges === 'Automatically Cancelled', miaView);
    check('no Accept control is offered for a cancelled application', miaView.acceptRendered === false, miaView);
    check('the publisher can read why it was cancelled', /accepted for journey POST-001/.test(miaView.text), miaView.text);

    console.log('\n== Decline (requirement 11) ==');
    await cdp.eval(`document.getElementById('received-dialog').close(); return true;`);
    await switchTo('PROF-LIAM');
    await cdp.eval(`
      document.getElementById('nav-browse').click();
      document.querySelector('[data-action="view-details"][data-post-id="POST-002"]').click();
      document.getElementById('details-apply-btn').click();
      return true;`);
    await sleep(380);
    await cdp.eval(`document.getElementById('results-dialog').close(); return true;`);
    const liamApplied = await snapshot();
    const liamAppId = Object.keys(liamApplied.applications).filter(function (id) {
      return liamApplied.applications[id].applicantProfileId === 'PROF-LIAM';
    })[0];
    check('Liam applies to Mia\'s journey', !!liamAppId && liamApplied.applications[liamAppId].status === 'Pending', liamApplied.statusList);

    await switchTo('PROF-MIA');
    await openActivity('my-posts');
    await cdp.eval(`document.querySelector('#my-posts-list [data-action="open-received"]').click(); return true;`);
    await sleep(320);
    await cdp.eval(`
      var rows = Array.prototype.slice.call(document.querySelectorAll('#received-body .applicant-row'));
      var target = rows.filter(function (r) { return /Liam Scott/.test(r.textContent); })[0];
      target.querySelector('[data-action="decline-application"]').click();
      return true;`);
    await sleep(450);
    const afterDecline = await snapshot();
    check('the publisher declines the application', afterDecline.applications[liamAppId].status === 'Declined');
    check('the decline records a reason', /Declined by the publisher/.test(afterDecline.applications[liamAppId].reason));
    check('the journey stays Open after a decline', afterDecline.posts['POST-002'].status === 'Open');
    check('the accepted/cancelled history of other people is untouched', afterDecline.applications['APP-041'].status === 'Cancelled');

    console.log('\n== Withdraw (requirement 11) ==');
    await cdp.eval(`document.getElementById('received-dialog').close(); return true;`);
    await switchTo('PROF-LIAM');
    await cdp.eval(`
      document.getElementById('nav-browse').click();
      document.querySelector('[data-action="view-details"][data-post-id="POST-003"]').click();
      document.getElementById('details-apply-btn').click();
      return true;`);
    await sleep(380);
    await cdp.eval(`document.getElementById('results-dialog').close(); return true;`);
    await openActivity('my-applications');
    const withdrawClick = await cdp.eval(`
      var rows = Array.prototype.slice.call(document.querySelectorAll('#my-applications-list .record-row'));
      var pending = rows.filter(function (r) { return /Pending/.test(r.textContent); })[0];
      var btn = pending && pending.querySelector('[data-action="withdraw-application"]');
      if (btn) { btn.click(); }
      return { found: !!btn };
    `);
    await sleep(450);
    const afterWithdraw = await snapshot();
    check('a Pending row offers Withdraw', withdrawClick.found === true, withdrawClick);
    check('the application is Withdrawn', Object.keys(afterWithdraw.applications).some(function (id) {
      return afterWithdraw.applications[id].status === 'Withdrawn' && afterWithdraw.applications[id].applicantProfileId === 'PROF-LIAM';
    }), afterWithdraw.statusList);
    check('the journey stays Open after a withdrawal', afterWithdraw.posts['POST-003'].status === 'Open');

    console.log('\n== Cancel Post (requirement 12) ==');
    await switchTo('PROF-TOM');
    await openActivity('my-posts');
    await cdp.eval(`document.querySelector('#my-posts-list [data-action="cancel-post"]').click(); return true;`);
    await sleep(300);
    const cancelPostPrompt = await cdp.eval(`
      return {
        open: document.getElementById('confirm-dialog').open,
        message: document.getElementById('confirm-message').textContent
      };`);
    check('cancelling a post asks first and warns about live applications',
      cancelPostPrompt.open === true && /hidden from Browse/.test(cancelPostPrompt.message), cancelPostPrompt);
    await cdp.eval(`document.getElementById('confirm-ok-btn').click(); return true;`);
    await sleep(450);
    const afterCancelPost = await snapshot();
    check('the journey is Cancelled', afterCancelPost.posts['POST-003'].status === 'Cancelled');
    check('finished application history is kept', Object.keys(afterCancelPost.applications).some(function (id) {
      return afterCancelPost.applications[id].status === 'Withdrawn';
    }), afterCancelPost.statusList);
    await cdp.eval(`document.getElementById('nav-browse').click(); return true;`);
    await sleep(280);
    const hiddenAfterCancel = await cdp.eval(`
      return {
        visible: !!document.querySelector('.journey-card[data-post-id="POST-003"]'),
        cards: document.querySelectorAll('.journey-card').length
      };`);
    check('a cancelled journey leaves Browse', hiddenAfterCancel.visible === false, hiddenAfterCancel);

    console.log('\n== Manage a Record performs real actions (image 09) ==');
    await cdp.eval(`
      document.getElementById('nav-manage').click();
      document.getElementById('manage-record-id').value = 'DEMO-0006-check';
      return true;`);
    await sleep(200);

    /* Emma owns POST-006: the record view must offer its real management actions. */
    await switchTo('PROF-EMMA');
    await cdp.eval(`
      document.getElementById('nav-manage').click();
      document.getElementById('manage-record-id').value = 'POST-006';
      document.getElementById('manage-code').value = 'DEMO-0006';
      document.getElementById('manage-form').requestSubmit();
      return true;`);
    await sleep(300);
    const managePost = await cdp.eval(`
      var box = document.getElementById('manage-result');
      var cancel = box.querySelector('[data-action="cancel-post"]');
      return {
        shown: box.textContent.length > 0,
        codeVisible: /DEMO-0006/.test(box.textContent),
        cancelOffered: !!cancel && cancel.disabled === false,
        applicationsLine: /Applications/.test(box.textContent)
      };`);
    check('the code opens the real journey record', managePost.shown === true && managePost.codeVisible === true, managePost);
    check('the record view offers a real Cancel Post action', managePost.cancelOffered === true, managePost);
    check('the record view lists the application summary', managePost.applicationsLine === true, managePost);
    await cdp.shot('09b_manage_actions.png');

    /* A Pending application reopened by its own code can be withdrawn there. */
    await switchTo('PROF-EMMA');
    await cdp.eval(`
      document.getElementById('manage-dialog').close();
      document.getElementById('nav-browse').click();
      document.querySelector('[data-action="view-details"][data-post-id="POST-004"]').click();
      document.getElementById('details-apply-btn').click();
      return true;`);
    await sleep(400);
    await cdp.eval(`document.getElementById('results-dialog').close(); return true;`);
    const emmaPending = await snapshot();
    const emmaAppId = Object.keys(emmaPending.applications).filter(function (id) {
      return emmaPending.applications[id].applicantProfileId === 'PROF-EMMA';
    })[0];
    check('Emma applies to Zoe\'s journey', !!emmaAppId && emmaPending.applications[emmaAppId].status === 'Pending', emmaPending.statusList);

    await cdp.eval(`
      document.getElementById('nav-manage').click();
      document.getElementById('manage-record-id').value = '` + emmaAppId + `';
      document.getElementById('manage-code').value = '` + emmaPending.applications[emmaAppId].managementCode + `';
      document.getElementById('manage-form').requestSubmit();
      return true;`);
    await sleep(320);
    const manageApplication = await cdp.eval(`
      var box = document.getElementById('manage-result');
      var withdraw = box.querySelector('[data-action="withdraw-application"]');
      return {
        codeVisible: /` + emmaPending.applications[emmaAppId].managementCode + `/.test(box.textContent),
        withdrawOffered: !!withdraw && withdraw.disabled === false,
        status: box.querySelector('.badge').textContent
      };`);
    check('the application code opens its own record', manageApplication.codeVisible === true, manageApplication);
    check('the applicant can withdraw from the record view', manageApplication.withdrawOffered === true, manageApplication);
    check('the record shows its Pending status', manageApplication.status === 'Pending', manageApplication.status);

    await cdp.eval(`document.querySelector('#manage-result [data-action="withdraw-application"]').click(); return true;`);
    await sleep(450);
    const manageAfterWithdraw = await cdp.eval(`
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      var app = stored.applications.filter(function (a) { return a.applicationId === '` + emmaAppId + `'; })[0];
      var box = document.getElementById('manage-result');
      return {
        status: app.status,
        viewStatus: box.querySelector('.badge').textContent,
        withdrawGone: !box.querySelector('[data-action="withdraw-application"]')
      };`);
    check('withdrawing from the record view is a real state change', manageAfterWithdraw.status === 'Withdrawn', manageAfterWithdraw);
    check('the record view refreshes to the new status', manageAfterWithdraw.viewStatus === 'Withdrawn' && manageAfterWithdraw.withdrawGone === true, manageAfterWithdraw);

    console.log('\n== Cancel Post also cancels a live application (requirement 12) ==');
    await switchTo('PROF-ALEX');
    await cdp.eval(`
      document.getElementById('nav-browse').click();
      document.querySelector('[data-action="view-details"][data-post-id="POST-006"]').click();
      document.getElementById('details-apply-btn').click();
      return true;`);
    await sleep(420);
    await cdp.eval(`document.getElementById('results-dialog').close(); return true;`);
    const alexOnEmma = await snapshot();
    const alexLiveId = Object.keys(alexOnEmma.applications).filter(function (id) {
      return alexOnEmma.applications[id].postId === 'POST-006' && alexOnEmma.applications[id].status === 'Pending';
    })[0];
    check('Alex applies to Emma\'s journey', !!alexLiveId, alexOnEmma.statusList);

    await switchTo('PROF-EMMA');
    await openActivity('my-posts');
    await cdp.eval(`document.querySelector('#my-posts-list [data-action="cancel-post"]').click(); return true;`);
    await sleep(300);
    const liveCancelPrompt = await cdp.eval(`return document.getElementById('confirm-message').textContent;`);
    check('the prompt counts the live applications', /1 live application/.test(liveCancelPrompt), liveCancelPrompt);
    await cdp.eval(`document.getElementById('confirm-ok-btn').click(); return true;`);
    await sleep(450);
    const afterLiveCancel = await snapshot();
    check('the journey is Cancelled', afterLiveCancel.posts['POST-006'].status === 'Cancelled');
    check('the live application is cancelled with it', afterLiveCancel.applications[alexLiveId].status === 'Cancelled');
    check('the traveller is told the publisher cancelled', /publisher cancelled this journey/.test(afterLiveCancel.applications[alexLiveId].reason),
      afterLiveCancel.applications[alexLiveId].reason);

    check('no uncaught page errors or console.error calls', pageErrors.length === 0, pageErrors.slice(0, 5));

    console.log('\n== Plain URL, no ?demo=1 (guest flow) ==');
    /* The snapshot is per origin, so wipe it to simulate a first-time visitor. */
    await cdp.eval(`window.localStorage.clear(); return true;`);
    await cdp.send('Page.navigate', { url: BASE.replace('?demo=1', '') });
    await sleep(500);
    check('app boots on the plain URL', await waitForApp(cdp));
    await sleep(500);
    const guest = await cdp.eval(`
      var tools = document.getElementById('demo-tools');
      return {
        toolsHidden: tools.hidden,
        toolsDisplay: getComputedStyle(tools).display,
        person: document.getElementById('current-person-name').textContent,
        cards: document.querySelectorAll('.journey-card').length
      };`);
    check('demo tools stay hidden without ?demo=1', guest.toolsHidden === true && guest.toolsDisplay === 'none', guest);
    check('no identity is preselected', guest.person === 'Not selected', guest.person);
    check('seed journeys are still browsable', guest.cards === 6, guest.cards);

    const guestApply = await cdp.eval(`
      document.querySelector('[data-action="view-details"][data-post-id="POST-004"]').click();
      document.getElementById('details-apply-btn').click();
      return {
        profileOpen: document.getElementById('profile-dialog').open,
        intro: document.getElementById('profile-dialog-intro').textContent,
        nameEmpty: document.getElementById('profile-name').value === ''
      };`);
    check('guest is asked for details on the first action', guestApply.profileOpen === true, guestApply);
    check('guest form starts empty', guestApply.nameEmpty === true, guestApply);
    await cdp.shot('02b_profile_guest.png');

    console.log('\n== Cancel a first-time profile (requirement 02) ==');
    await cdp.eval(`document.getElementById('profile-cancel-btn').click(); return true;`);
    await sleep(250);
    const cancelled = await cdp.eval(`
      var stored = JSON.parse(localStorage.getItem('sj_demo_state_v2'));
      return {
        profileClosed: document.getElementById('profile-dialog').open === false,
        applications: stored.applications.length,
        ownProfiles: stored.profiles.filter(function (p) { return !p.demoPerson; }).length,
        toast: (document.querySelector('.toast') || {}).textContent || ''
      };`);
    check('Cancel closes Your Details without saving', cancelled.profileClosed === true && cancelled.ownProfiles === 0, cancelled);
    check('Cancel sends no application', cancelled.applications === 0, cancelled);
    check('Cancel tells the user nothing happened', /nothing was saved/.test(cancelled.toast), cancelled.toast);

    console.log('\n== Keyboard and focus (requirement 20) ==');
    const opened = await cdp.eval(`
      var btn = document.querySelector('[data-action="view-details"][data-post-id="POST-004"]');
      btn.focus();
      var focusedBeforeClick = document.activeElement === btn;
      btn.click();
      var dialog = document.getElementById('details-dialog');
      return {
        focusedBeforeClick: focusedBeforeClick,
        open: dialog.open,
        focusInsideDialog: dialog.contains(document.activeElement)
      };`);
    check('dialog opens and takes focus', opened.open === true && opened.focusInsideDialog === true, opened);

    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(300);
    const escaped = await cdp.eval(`
      return {
        open: document.getElementById('details-dialog').open,
        focusReturned: document.activeElement === document.querySelector('[data-action="view-details"][data-post-id="POST-004"]')
      };`);
    check('Escape closes the dialog', escaped.open === false, escaped);
    check('focus returns to the button that opened it', escaped.focusReturned === true, escaped);

    await cdp.eval(`
      document.getElementById('nav-activity').click();
      document.querySelector('#activity-tabs .tab[data-tab="my-posts"]').focus();
      return true;`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await sleep(250);
    const arrow = await cdp.eval(`
      return {
        selected: document.querySelector('#activity-tabs .tab[aria-selected="true"]').getAttribute('data-tab'),
        focused: document.activeElement.getAttribute('data-tab'),
        panelVisible: document.getElementById('my-applications-panel').hidden === false
      };`);
    check('ArrowRight moves to the next activity tab', arrow.selected === 'my-applications' && arrow.focused === 'my-applications', arrow);
    check('the matching panel becomes visible', arrow.panelVisible === true, arrow);

    console.log('\n---------------------------------------------');
    console.log(passed + ' passed, ' + failed + ' failed');
    console.log('---------------------------------------------\n');
  } catch (err) {
    console.error('\nE2E ERROR: ' + (err && err.stack ? err.stack : err));
    failed += 1;
  } finally {
    try { child.kill(); } catch (err) { /* ignore */ }
    setTimeout(() => process.exit(failed === 0 ? 0 : 1), 200);
  }
})();
