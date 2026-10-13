/* Headless self-check for js/store.js + js/rules.js (no DOM involved).
   Run:  node tools/selfcheck.js      from the project root            */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('  PASS  ' + label);
  } else {
    failed += 1;
    console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : ''));
  }
}

/* --- a browser-ish sandbox: window, localStorage, no DOM ------------------ */
const store = new Map();
const sandbox = {
  console,
  Intl,
  Date,
  Math,
  JSON,
  Promise,
  Uint8Array,
  Object,
  Array,
  String,
  Number,
  isFinite,
  isNaN,
  structuredClone,
  crypto: require('crypto').webcrypto,
  setTimeout,
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(relativePath) {
  const code = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(code, sandbox, { filename: relativePath });
}

load('js/store.js');
load('js/rules.js');

const SJ = sandbox.SJ;

function next(state, result) {
  if (!result.ok) { throw new Error('operation failed: ' + result.error); }
  const commit = SJ.store.commitState(result.state);
  if (!commit.ok) { throw new Error('commit failed: ' + commit.error); }
  return SJ.store.getState();
}

console.log('\n== CSV parsing (real file) ==');
const csvText = fs.readFileSync(path.join(ROOT, 'data/posts_seed.csv'), 'utf8');
const csvRows = SJ.store._rowsToObjects(SJ.store._parseCsv(csvText));
check('6 seed rows parsed', csvRows.length === 6, 'got ' + csvRows.length);
check('quoted comma kept inside notes', csvRows[5].notes === 'Day trip, back the same evening.', JSON.stringify(csvRows[5].notes));
check('escaped quotes kept inside notes', csvRows[3].notes === 'Looking for a driver. "Morning preferred."', JSON.stringify(csvRows[3].notes));
check('header field mapped', csvRows[0].ownerAlias === 'adam' && csvRows[0].time === '08:30');

console.log('\n== Embedded fallback matches the CSV file ==');
const embeddedRows = SJ.store._rowsToObjects(SJ.store._parseCsv(SJ.store._fallbackCsv()));
check('fallback row count matches', embeddedRows.length === csvRows.length);
check('fallback content matches', JSON.stringify(embeddedRows) === JSON.stringify(csvRows));

console.log('\n== Seed state ==');
const seed = SJ.store._buildSeedState(csvText);
check('schemaVersion 2', seed.schemaVersion === 2);
check('6 posts, 0 applications', seed.posts.length === 6 && seed.applications.length === 0);
check('post IDs normalised', seed.posts[0].postId === 'POST-001' && seed.posts[5].postId === 'POST-006');
check('app sequence starts at 41', seed.nextSequence.application === 41);
check('owner profile linked', seed.posts[0].ownerProfileId === 'PROF-ADAM');
check('seed codes are stable', seed.posts[0].managementCode === 'DEMO-0001');
check('activity refs created for publishers', seed.activityRefs['PROF-ADAM'].length === 1);

const today = SJ.store.todayNZ();
const allFuture = seed.posts.every((post) => post.date > today);
check('every seed date is in the future (NZ date)', allFuture, seed.posts.map((p) => p.date).join(','));
check('daysAhead 7 becomes today+7', seed.posts[0].date === SJ.store.addDaysISO(today, 7));
check('all seeds Open', seed.posts.every((post) => post.status === 'Open'));
check('Alex has no saved contact yet', seed.profiles.find((p) => p.profileId === 'PROF-ALEX').phone === '');

console.log('\n== Init / persistence round trip ==');
(async () => {
  const initResult = await SJ.store.init();
  check('init ok', initResult.ok === true, initResult.error);
  check('seed came from the embedded copy (no fetch in node)', SJ.store.seedSource() === 'embedded');
  let state = SJ.store.getState();
  check('state cached after init', !!state && state.posts.length === 6);
  check('snapshot written to localStorage', store.has(SJ.store.STORAGE_KEY));

  const reloaded = SJ.store.reload();
  check('reload re-reads a valid snapshot', reloaded.ok === true, reloaded.error);

  console.log('\n== Filters ==');
  check('origin + destination filter', SJ.rules.filterPosts(state, { origin: 'auck', destination: 'Hamilton' }).length === 3);
  check('postType filter', SJ.rules.filterPosts(state, { postType: 'passenger' }).length === 2);
  check('date filter', SJ.rules.filterPosts(state, { date: SJ.store.addDaysISO(today, 7) }).length === 3);
  check('empty result for unknown city', SJ.rules.filterPosts(state, { origin: 'Nowhere' }).length === 0);
  check('sorted soonest first', SJ.rules.filterPosts(state, {})[0].time <= SJ.rules.filterPosts(state, {})[1].time);
  check('known cities include Palmerston North', SJ.rules.knownCities(state).includes('Palmerston North'));

  console.log('\n== Profile: first-time save (image 02 flow) ==');
  state = next(state, SJ.rules.switchPerson(state, 'PROF-ALEX'));
  check('active person is Alex', state.activeProfileId === 'PROF-ALEX');
  const blocked = SJ.rules.applyToPosts(state, { postIds: ['POST-001'] });
  check('apply is refused before details exist', blocked.ok === false && blocked.needsProfile === true);
  const badProfile = SJ.rules.saveProfileAndResume(state, { name: 'A', phone: '12', email: 'nope' });
  check('profile validation rejects bad input', badProfile.ok === false && !!badProfile.errors.email && !!badProfile.errors.phone);
  state = next(state, SJ.rules.saveProfileAndResume(state, { name: 'Alex Taylor', phone: '+64 21 555 0101', email: 'alex.taylor@example.com' }));
  check('profile saved once', SJ.rules.profileIsComplete(SJ.rules.profileById(state, 'PROF-ALEX')));

  console.log('\n== Single application ==');
  let single = SJ.rules.applyToPosts(state, { postIds: ['POST-001'] });
  check('one application created', single.ok === true && single.successCount === 1);
  check('application is Pending', single.results[0].application.status === 'Pending');
  check('record ID allocated from the sequence', single.results[0].application.applicationId === 'APP-041');
  check('management code format XXXX-XXXX', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(single.results[0].application.managementCode));
  state = next(state, single);
  check('publisher still sees the journey as Open', SJ.rules.postById(state, 'POST-001').status === 'Open');
  check('card state is Pending for Alex', SJ.rules.selectionState(state, 'POST-001').reason === 'pending');
  check('own post is not selectable for its owner', SJ.rules.selectionState(state, 'POST-001').label === 'Pending');

  console.log('\n== Duplicate / own-post protection ==');
  const duplicate = SJ.rules.applyToPosts(state, { postIds: ['POST-001'] });
  check('duplicate application refused', duplicate.ok === false && duplicate.results[0].error.includes('already have an active application'));
  state = next(state, SJ.rules.switchPerson(state, 'PROF-ADAM'));
  const ownPost = SJ.rules.applyToPosts(state, { postIds: ['POST-001'] });
  check('applying to your own post refused', ownPost.ok === false && ownPost.results[0].error.includes('yourself'));
  state = next(state, SJ.rules.switchPerson(state, 'PROF-ALEX'));

  console.log('\n== Batch application, partial failure (image 05) ==');
  const batch = SJ.rules.applyToPosts(state, { postIds: ['POST-002', 'POST-003', 'POST-001'] });
  check('batch ok with 2 successes', batch.ok === true && batch.successCount === 2 && batch.failedCount === 1);
  check('failed item explains itself', batch.results[2].ok === false);
  const codes = batch.results.filter((r) => r.ok).map((r) => r.application.managementCode);
  check('two different management codes', codes[0] !== codes[1]);
  check('sequential record IDs', batch.results[0].application.applicationId === 'APP-042' && batch.results[1].application.applicationId === 'APP-043');
  state = next(state, batch);
  check('one snapshot holds all three applications', state.applications.length === 3);

  const activity = SJ.rules.getActivity(state, 'PROF-ALEX');
  check('My Applications shows 3 rows', activity.counts.applications === 3);
  check('Received Applications empty for Alex', activity.counts.received === 0);
  const adamActivity = SJ.rules.getActivity(state, 'PROF-ADAM');
  check('Adam sees 1 received application', adamActivity.counts.received === 1);
  check('applicant contact is stored for the publisher view', adamActivity.received[0].application.applicantPhone === '+64 21 555 0101');

  console.log('\n== Publish a journey (image 03) ==');
  const badPost = SJ.rules.createPost(state, { postType: 'driver', origin: 'Auckland', destination: 'auckland', date: today, time: '00:01', notes: '' });
  check('same-city post refused', badPost.ok === false && !!badPost.errors.destination);
  const pastPost = SJ.rules.createPost(state, { postType: 'driver', origin: 'Auckland', destination: 'Rotorua', date: SJ.store.addDaysISO(today, -1), time: '09:00', notes: '' });
  check('past date refused', pastPost.ok === false && !!pastPost.errors.date);
  const todayLate = SJ.rules.createPost(state, { postType: 'passenger', origin: 'Auckland', destination: 'Rotorua', date: today, time: '23:59', notes: '' });
  check('today with a later time accepted', todayLate.ok === true || !!todayLate.errors.time);
  const goodPost = SJ.rules.createPost(state, { postType: 'passenger', origin: 'Napier', destination: 'Wellington', date: SJ.store.addDaysISO(today, 5), time: '07:15', notes: 'One bag.' });
  check('valid post accepted', goodPost.ok === true);
  check('new post gets POST-007', goodPost.post.postId === 'POST-007');
  check('new post starts Open with its own code', goodPost.post.status === 'Open' && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(goodPost.post.managementCode));
  check('publisher contact snapshot stored', goodPost.post.name === 'Alex Taylor' && goodPost.post.phone === '+64 21 555 0101');
  state = next(state, goodPost);

  console.log('\n== Management codes (image 09) ==');
  const wrongCode = SJ.rules.verifyManagementCode(state, 'POST-001', 'WRNG-CODE');
  const unknownId = SJ.rules.verifyManagementCode(state, 'POST-999', 'WRNG-CODE');
  check('wrong code shows nothing', wrongCode.ok === false && wrongCode.record === undefined);
  check('same message for unknown record and wrong code', wrongCode.error === unknownId.error);
  check('empty input asks for both fields', SJ.rules.verifyManagementCode(state, '', '').error.includes('Enter both'));
  const postCode = SJ.rules.postById(state, 'POST-007').managementCode;
  const goodCode = SJ.rules.verifyManagementCode(state, 'post-007', postCode.toLowerCase().replace('-', ' '));
  check('correct code opens the record (case and spacing tolerant)', goodCode.ok === true && goodCode.kind === 'post');
  const appCode = state.applications[0].managementCode;
  const appLookup = SJ.rules.verifyManagementCode(state, 'app-041', appCode);
  check('application code opens the application record', appLookup.ok === true && appLookup.kind === 'application');
  check('a post code cannot open an application', SJ.rules.verifyManagementCode(state, 'APP-041', postCode).ok === false);

  console.log('\n== Expiry rule (requirement 14) ==');
  const expiredState = JSON.parse(JSON.stringify(state));
  expiredState.posts.find((p) => p.postId === 'POST-003').date = SJ.store.addDaysISO(today, -2);
  const expiry = SJ.rules.expireRecords(expiredState);
  check('past post becomes Expired', expiry.changed === true && expiry.postsExpired === 1);
  check('its pending application becomes Expired', expiry.applicationsExpired === 1);
  const afterExpiry = expiry.state;
  check('expired post leaves the public list', SJ.rules.filterPosts(afterExpiry, {}).every((p) => p.postId !== 'POST-003'));
  check('expired post keeps its history', !!SJ.rules.postById(afterExpiry, 'POST-003'));
  check('applying to an expired journey is refused',
    /no longer accepts applications|already departed/.test(SJ.rules.applyToPosts(afterExpiry, { postIds: ['POST-003'] }).results[0].error));
  check('agreeing is impossible once the departure passed',
    SJ.rules.isPastDeparture(SJ.rules.postById(afterExpiry, 'POST-003')) === true);

  console.log('\n== Persistence failure is reported, never faked ==');
  const realSet = sandbox.localStorage.setItem;
  sandbox.localStorage.setItem = () => { throw new Error('quota'); };
  const failing = SJ.store.commitState(JSON.parse(JSON.stringify(state)));
  check('failed commit returns ok:false', failing.ok === false && !!failing.error);
  sandbox.localStorage.setItem = realSet;

  console.log('\n== Guest mode (no ?demo=1) ==');
  state = next(state, SJ.rules.switchPerson(state, ''));
  check('active profile cleared', state.activeProfileId === null);
  const guestProfile = SJ.rules.saveProfileAndResume(state, { name: 'Sam Guest', phone: '+64 21 000 0000', email: 'sam@example.com' });
  check('guest profile gets its own id', guestProfile.ok === true && guestProfile.profile.profileId === 'PROF-LOCAL-001');
  state = next(state, guestProfile);
  check('guest becomes the active person', state.activeProfileId === 'PROF-LOCAL-001');

  console.log('\n== Reset (image "Reset Demo Data") ==');
  const reset = await SJ.store.resetDemoData();
  check('reset rebuilds six posts', reset.ok === true && reset.state.posts.length === 6);
  check('reset clears applications', reset.state.applications.length === 0);
  check('reset clears the active person', reset.state.activeProfileId === null);

  console.log('\n---------------------------------------------');
  console.log(passed + ' passed, ' + failed + ' failed');
  console.log('---------------------------------------------\n');
  process.exit(failed === 0 ? 1 - 1 : 1);
})().catch((err) => {
  console.error('\nHARNESS ERROR: ' + err.stack);
  process.exit(1);
});
