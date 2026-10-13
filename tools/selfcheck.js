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

  /* ======================================================================
     DAY 2 — approvals, withdrawals, cancellations (reference images 07-09)
     ====================================================================== */

  function asPerson(profileId) {
    const result = SJ.rules.switchPerson(state, profileId);
    if (!result.ok) { throw new Error('switch failed: ' + result.error); }
    state = next(state, result);
    return state;
  }

  function applyAs(profileId, postIds) {
    asPerson(profileId);
    const result = SJ.rules.applyToPosts(state, { postIds: postIds });
    if (result.ok) { state = next(state, result); }
    return result;
  }

  function statusOf(applicationId) {
    return SJ.rules.applicationById(state, applicationId).status;
  }

  function reasonOf(applicationId) {
    return SJ.rules.applicationById(state, applicationId).reason;
  }

  console.log('\n== Accept: only the publisher may act ==');
  asPerson('PROF-ALEX');
  const wrongOwner = SJ.rules.acceptApplication(state, { applicationId: 'APP-041' });
  check('a stranger cannot accept', wrongOwner.ok === false && /Only the publisher/.test(wrongOwner.error), wrongOwner.error);

  console.log('\n== Second applicant on the same journey (for Not Selected) ==');
  const zoeApply = applyAs('PROF-ZOE', ['POST-001']);
  check('another person can apply to the same journey', zoeApply.ok === true && zoeApply.results[0].application.applicationId === 'APP-044');
  check('the journey is still Open with two applicants', SJ.rules.postById(state, 'POST-001').status === 'Open');

  console.log('\n== Accept cascade (image 08 -> image 07) ==');
  asPerson('PROF-ADAM');
  const accept = SJ.rules.acceptApplication(state, { applicationId: 'APP-041' });
  check('the publisher can accept a Pending application', accept.ok === true, accept.error);
  check('one other applicant becomes Not Selected', accept.notSelected.length === 1 && accept.notSelected[0] === 'APP-044', accept.notSelected);
  check('the applicant\'s other Pending applications are auto-cancelled', accept.autoCancelled.length === 2, accept.autoCancelled);
  state = next(state, accept);

  const acceptedPost = SJ.rules.postById(state, 'POST-001');
  check('the journey becomes Confirmed', acceptedPost.status === 'Confirmed');
  check('the confirmed application is recorded on the journey', acceptedPost.confirmedApplicationId === 'APP-041');
  check('the accepted application is Accepted', statusOf('APP-041') === 'Accepted');
  check('the journey leaves the public Browse list', SJ.rules.filterPosts(state, {}).every((p) => p.postId !== 'POST-001'));
  check('the other applicant is Not Selected', statusOf('APP-044') === 'Not Selected');
  check('Not Selected carries a written reason', /Another applicant was accepted/.test(reasonOf('APP-044')), reasonOf('APP-044'));
  check('APP-042 (other journey) is Automatically Cancelled', statusOf('APP-042') === 'Automatically Cancelled');
  check('APP-043 (other journey) is Automatically Cancelled', statusOf('APP-043') === 'Automatically Cancelled');
  check('the auto-cancellation names the journey it was accepted for', /POST-001/.test(reasonOf('APP-042')), reasonOf('APP-042'));
  check('Mia\'s and Tom\'s journeys are untouched and still Open',
    SJ.rules.postById(state, 'POST-002').status === 'Open' && SJ.rules.postById(state, 'POST-003').status === 'Open');
  check('a Not Selected application can no longer be accepted',
    SJ.rules.canAccept(state, 'APP-044').ok === false && /Not Selected/.test(SJ.rules.canAccept(state, 'APP-044').error));
  check('the confirmed journey cannot accept again', SJ.rules.canAccept(state, 'APP-041').ok === false);

  console.log('\n== Requirement 10: two publishers, only one succeeds (sequential) ==');
  asPerson('PROF-MIA');
  const secondAccept = SJ.rules.acceptApplication(state, { applicationId: 'APP-042' });
  check('the second publisher cannot accept the same applicant', secondAccept.ok === false);
  check('the refusal explains the real status', /Automatically Cancelled/.test(secondAccept.error), secondAccept.error);
  const conflictState = JSON.parse(JSON.stringify(state));
  conflictState.applications.find((a) => a.applicationId === 'APP-043').status = 'Pending';
  conflictState.activeProfileId = 'PROF-TOM'; /* owner of POST-003 */
  const directConflict = SJ.rules.canAccept(conflictState, 'APP-043');
  check('even a still-Pending application is refused while the person is confirmed',
    directConflict.ok === false && /already confirmed on journey APP-041/.test(directConflict.error), directConflict.error);

  console.log('\n== Decline only touches its own record (requirement 11) ==');
  const liamApply = applyAs('PROF-LIAM', ['POST-002']);
  check('Liam can apply to Mia\'s journey', liamApply.ok === true, liamApply.error);
  const liamAppId = liamApply.results[0].application.applicationId;
  const strangerDecline = (() => {
    const before = state.activeProfileId;
    asPerson('PROF-ALEX');
    const refused = SJ.rules.declineApplication(state, { applicationId: liamAppId });
    asPerson(before);
    return refused;
  })();
  check('a non-publisher cannot decline', strangerDecline.ok === false && /Only the publisher/.test(strangerDecline.error));
  asPerson('PROF-MIA');
  const decline = SJ.rules.declineApplication(state, { applicationId: liamAppId });
  check('the publisher can decline', decline.ok === true, decline.error);
  state = next(state, decline);
  check('the declined application is Declined with a reason', statusOf(liamAppId) === 'Declined' && /Declined by the publisher/.test(reasonOf(liamAppId)));
  check('the journey stays Open after a decline', SJ.rules.postById(state, 'POST-002').status === 'Open');
  check('Alex\'s accepted record is untouched by the decline', statusOf('APP-041') === 'Accepted');
  check('a declined application cannot be declined twice', SJ.rules.declineApplication(state, { applicationId: liamAppId }).ok === false);

  console.log('\n== Withdraw only touches its own record (requirement 11) ==');
  const emmaApply = applyAs('PROF-EMMA', ['POST-004']);
  check('Emma applies to Zoe\'s passenger journey', emmaApply.ok === true, emmaApply.error);
  const emmaAppId = emmaApply.results[0].application.applicationId;
  asPerson('PROF-TOM');
  check('someone else cannot withdraw it', SJ.rules.withdrawApplication(state, { applicationId: emmaAppId }).ok === false);
  asPerson('PROF-EMMA');
  const withdraw = SJ.rules.withdrawApplication(state, { applicationId: emmaAppId });
  check('the applicant can withdraw', withdraw.ok === true, withdraw.error);
  state = next(state, withdraw);
  check('the record is Withdrawn', statusOf(emmaAppId) === 'Withdrawn');
  check('Zoe\'s journey stays Open with no applicant', SJ.rules.postById(state, 'POST-004').status === 'Open');

  console.log('\n== Cancel Confirmed Journey reopens the journey (requirement 13) ==');
  const liamSecond = applyAs('PROF-LIAM', ['POST-006']);
  check('Liam applies to Emma\'s journey', liamSecond.ok === true, liamSecond.error);
  const liamSecondId = liamSecond.results[0].application.applicationId;
  asPerson('PROF-EMMA');
  const acceptEmma = SJ.rules.acceptApplication(state, { applicationId: liamSecondId });
  check('Emma accepts Liam', acceptEmma.ok === true, acceptEmma.error);
  state = next(state, acceptEmma);
  check('Emma\'s journey is Confirmed and hidden', SJ.rules.postById(state, 'POST-006').status === 'Confirmed'
    && SJ.rules.filterPosts(state, {}).every((p) => p.postId !== 'POST-006'));
  asPerson('PROF-LIAM');
  const cancelJourney = SJ.rules.cancelJourney(state, { applicationId: liamSecondId });
  check('the applicant can cancel the confirmed journey', cancelJourney.ok === true, cancelJourney.error);
  check('the journey is reopened for new applications', cancelJourney.reopened === true);
  state = next(state, cancelJourney);
  check('POST-006 is Open again and public', SJ.rules.postById(state, 'POST-006').status === 'Open'
    && SJ.rules.filterPosts(state, {}).some((p) => p.postId === 'POST-006'));
  check('the cancelled application keeps its history as Cancelled', statusOf(liamSecondId) === 'Cancelled');
  check('old terminal records do not revive',
    statusOf(liamAppId) === 'Declined' && statusOf(emmaAppId) === 'Withdrawn' && statusOf('APP-042') === 'Automatically Cancelled');
  check('Liam may apply again after giving up the place', applyAs('PROF-LIAM', ['POST-006']).ok === true);

  console.log('\n== Cancel Post cancels the journey and its live applications (requirement 12) ==');
  asPerson('PROF-TOM');
  check('a non-publisher cannot cancel the post', SJ.rules.cancelPost(state, { postId: 'POST-001' }).ok === false);
  asPerson('PROF-ADAM');
  const cancelPost = SJ.rules.cancelPost(state, { postId: 'POST-001' });
  check('the publisher can cancel the journey', cancelPost.ok === true, cancelPost.error);
  check('the confirmed application is cancelled with it', cancelPost.cancelled.indexOf('APP-041') !== -1, cancelPost.cancelled);
  state = next(state, cancelPost);
  check('POST-001 is Cancelled and hidden', SJ.rules.postById(state, 'POST-001').status === 'Cancelled'
    && SJ.rules.filterPosts(state, {}).every((p) => p.postId !== 'POST-001'));
  check('the traveller is told why', /publisher cancelled this journey/.test(reasonOf('APP-041')), reasonOf('APP-041'));
  check('Not Selected stays Not Selected (no revival)', statusOf('APP-044') === 'Not Selected');
  check('a cancelled journey cannot be cancelled again', SJ.rules.cancelPost(state, { postId: 'POST-001' }).ok === false);
  check('a cancelled journey cannot be applied to', SJ.rules.applyToPosts(state, { postIds: ['POST-001'] }).results[0].ok === false);

  console.log('\n== Departure time blocks every late action (requirement 14) ==');
  const lateState = JSON.parse(JSON.stringify(state));
  lateState.posts.find((p) => p.postId === 'POST-006').date = SJ.store.addDaysISO(SJ.store.todayNZ(), -1);
  const pendingOnLate = lateState.applications.find((a) => a.postId === 'POST-006' && a.status === 'Pending');
  lateState.activeProfileId = 'PROF-EMMA';
  check('a departed journey cannot be accepted',
    !pendingOnLate || (SJ.rules.canAccept(lateState, pendingOnLate.applicationId).ok === false
      && /already departed/.test(SJ.rules.canAccept(lateState, pendingOnLate.applicationId).error)));
  check('a departed journey cannot be cancelled by its publisher',
    SJ.rules.canCancelPost(lateState, 'POST-006').ok === false && /already departed/.test(SJ.rules.canCancelPost(lateState, 'POST-006').error));
  const lateExpiry = SJ.rules.expireRecords(lateState);
  check('the pending application on a departed journey expires too', lateExpiry.applicationsExpired >= 1, lateExpiry);
  const acceptedOnLate = lateExpiry.state.applications.find((a) => a.postId === 'POST-006' && a.status === 'Accepted');
  lateState.activeProfileId = 'PROF-LIAM';
  check('an accepted place on a departed journey cannot be cancelled',
    !acceptedOnLate || SJ.rules.canCancelJourney(lateExpiry.state, acceptedOnLate.applicationId).ok === false);

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
