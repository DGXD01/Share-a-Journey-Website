/* ==========================================================================
   Share-a-Journey — js/rules.js
   Pure business rules: validation, state transitions and read queries.
   Every function takes the current state, works on a copy and returns the next
   state. Nothing here touches the DOM, and app.js is responsible for the single
   commitState() call after a successful operation.
   ========================================================================== */

window.SJ = window.SJ || {};

SJ.rules = (function () {
  'use strict';

  var ACTIVE_APPLICATION_STATUSES = ['Pending', 'Accepted'];

  /* ------------------------------------------------------------------ helpers */

  function cloneState(current) {
    if (typeof structuredClone === 'function') { return structuredClone(current); }
    return JSON.parse(JSON.stringify(current));
  }

  function trim(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return trim(value).toLowerCase();
  }

  function departureKey(post) {
    return String(post.date) + 'T' + String(post.time);
  }

  function isPastDeparture(post, nowParts) {
    var now = nowParts || SJ.store.nzNow();
    if (String(post.date) < now.date) { return true; }
    if (String(post.date) > now.date) { return false; }
    return String(post.time) <= now.time;
  }

  function isPubliclyVisible(post, nowParts) {
    return post.status === 'Open' && !isPastDeparture(post, nowParts);
  }

  function isSameCity(a, b) {
    return lower(a) === lower(b) && trim(a) !== '';
  }

  function profileById(state, profileId) {
    if (!profileId) { return null; }
    return state.profiles.filter(function (profile) {
      return profile.profileId === profileId;
    })[0] || null;
  }

  function profileIsComplete(profile) {
    return !!profile && trim(profile.name) !== '' && trim(profile.phone) !== '' && trim(profile.email) !== '';
  }

  function postById(state, postId) {
    var wanted = SJ.store.normalizeRecordId(postId);
    return state.posts.filter(function (post) {
      return SJ.store.normalizeRecordId(post.postId) === wanted;
    })[0] || null;
  }

  function applicationById(state, applicationId) {
    var wanted = SJ.store.normalizeRecordId(applicationId);
    return state.applications.filter(function (application) {
      return SJ.store.normalizeRecordId(application.applicationId) === wanted;
    })[0] || null;
  }

  function applicationsOfPost(state, postId) {
    return state.applications.filter(function (application) {
      return application.postId === postId;
    });
  }

  function liveApplicationFor(state, postId, profileId) {
    return state.applications.filter(function (application) {
      return application.postId === postId &&
        application.applicantProfileId === profileId &&
        ACTIVE_APPLICATION_STATUSES.indexOf(application.status) !== -1;
    })[0] || null;
  }

  /* An "unfinished" accepted journey is one that is still confirmed and has not
     departed yet. A ride that already happened no longer blocks new business. */
  function activeAcceptedFor(state, profileId) {
    return state.applications.filter(function (application) {
      if (application.applicantProfileId !== profileId || application.status !== 'Accepted') { return false; }
      var post = postById(state, application.postId);
      if (!post || post.status === 'Cancelled') { return false; }
      return !isPastDeparture(post);
    })[0] || null;
  }

  /* --------------------------------------------------------------- validation */

  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_PATTERN = /^[+()\d][\d\s()+-]{5,}$/;
  var TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

  function validateProfile(input) {
    var errors = {};
    var value = { name: trim(input.name), phone: trim(input.phone), email: trim(input.email) };

    if (value.name.length < 2) { errors.name = 'Enter the name you want to travel under.'; }
    if (value.phone === '') { errors.phone = 'Enter a phone number so a publisher can reach you.'; }
    else if (!PHONE_PATTERN.test(value.phone)) { errors.phone = 'Use digits, spaces, +, - or brackets only (at least 6 characters).'; }
    if (value.email === '') { errors.email = 'Enter an email address.'; }
    else if (!EMAIL_PATTERN.test(value.email)) { errors.email = 'Enter a valid email address, for example name@example.com.'; }
    if (value.email.length > 80) { errors.email = 'Email addresses are limited to 80 characters here.'; }

    return { ok: Object.keys(errors).length === 0, errors: errors, value: value };
  }

  function validatePost(input) {
    var errors = {};
    var now = SJ.store.nzNow();
    var value = {
      postType: input.postType === 'passenger' ? 'passenger' : 'driver',
      origin: trim(input.origin),
      destination: trim(input.destination),
      date: trim(input.date),
      time: trim(input.time),
      notes: trim(input.notes)
    };

    if (value.origin === '') { errors.origin = 'Enter the city you are leaving from.'; }
    if (value.destination === '') { errors.destination = 'Enter the destination city.'; }
    if (value.origin !== '' && value.destination !== '' && isSameCity(value.origin, value.destination)) {
      errors.destination = 'Origin and destination must be different cities.';
    }
    if (value.date === '') {
      errors.date = 'Choose a departure date.';
    } else if (value.date < now.date) {
      errors.date = 'The departure date cannot be in the past (today is ' + SJ.store.formatDateNZ(now.date) + ' in New Zealand).';
    } else if (value.date === now.date && (value.time === '' || value.time <= now.time)) {
      errors.time = 'That time has already passed today. Choose a later time or another date.';
    }
    if (value.time === '') { errors.time = 'Choose a departure time.'; }
    else if (!TIME_PATTERN.test(value.time)) { errors.time = 'Use a 24-hour time such as 08:30.'; }
    if (value.notes.length > 200) { errors.notes = 'Notes are limited to 200 characters.'; }

    return { ok: Object.keys(errors).length === 0, errors: errors, value: value };
  }

  /* ------------------------------------------------------------------ queries */

  function filterPosts(state, filters) {
    var now = SJ.store.nzNow();
    var criteria = filters || {};
    return state.posts.filter(function (post) {
      if (!isPubliclyVisible(post, now)) { return false; }
      if (criteria.origin && lower(post.origin).indexOf(lower(criteria.origin)) === -1) { return false; }
      if (criteria.destination && lower(post.destination).indexOf(lower(criteria.destination)) === -1) { return false; }
      if (criteria.date && post.date !== trim(criteria.date)) { return false; }
      if (criteria.postType && post.postType !== criteria.postType) { return false; }
      return true;
    }).sort(function (a, b) {
      if (departureKey(a) === departureKey(b)) { return a.postId < b.postId ? -1 : 1; }
      return departureKey(a) < departureKey(b) ? -1 : 1;
    });
  }

  function knownCities(state) {
    var seen = {};
    state.posts.forEach(function (post) {
      if (trim(post.origin) !== '') { seen[trim(post.origin)] = true; }
      if (trim(post.destination) !== '') { seen[trim(post.destination)] = true; }
    });
    return Object.keys(seen).sort();
  }

  function selectionState(state, postId) {
    var profile = profileById(state, state.activeProfileId);
    var post = postById(state, postId);
    if (!post) { return { selectable: false, reason: 'missing' }; }
    if (post.ownerProfileId && profile && post.ownerProfileId === profile.profileId) {
      return { selectable: false, reason: 'own', label: 'Your Post' };
    }
    if (profile) {
      var live = liveApplicationFor(state, post.postId, profile.profileId);
      if (live) {
        return {
          selectable: false,
          reason: live.status === 'Accepted' ? 'accepted' : 'pending',
          label: live.status === 'Accepted' ? 'Accepted' : 'Pending',
          application: live
        };
      }
    }
    if (!isPubliclyVisible(post)) { return { selectable: false, reason: 'closed', label: 'Closed' }; }
    return { selectable: true, reason: 'open' };
  }

  function getActivity(state, profileId) {
    var orderedPosts = state.posts.slice().sort(function (a, b) {
      return departureKey(a) < departureKey(b) ? -1 : 1;
    });

    var mine = state.applications.filter(function (application) {
      return application.applicantProfileId === profileId;
    }).map(function (application) {
      return { application: application, post: postById(state, application.postId) };
    }).sort(function (a, b) {
      /* Newest first; records created in the same minute are ordered by their
         record ID so the list never looks arbitrary. */
      if (String(a.application.appliedAt) === String(b.application.appliedAt)) {
        return a.application.applicationId < b.application.applicationId ? 1 : -1;
      }
      return String(b.application.appliedAt) < String(a.application.appliedAt) ? -1 : 1;
    });

    var received = [];
    state.posts.forEach(function (post) {
      if (post.ownerProfileId !== profileId) { return; }
      applicationsOfPost(state, post.postId).forEach(function (application) {
        received.push({ application: application, post: post });
      });
    });
    received.sort(function (a, b) {
      if (String(a.application.appliedAt) === String(b.application.appliedAt)) {
        return a.application.applicationId < b.application.applicationId ? -1 : 1;
      }
      return String(a.application.appliedAt) < String(b.application.appliedAt) ? -1 : 1;
    });

    var myPosts = orderedPosts.filter(function (post) { return post.ownerProfileId === profileId; });

    return {
      profileId: profileId,
      profile: profileById(state, profileId),
      posts: myPosts,
      applications: mine,
      received: received,
      counts: { posts: myPosts.length, applications: mine.length, received: received.length }
    };
  }

  function verifyManagementCode(state, recordId, code) {
    var wantedId = SJ.store.normalizeRecordId(recordId);
    var wantedCode = SJ.store.normalizeCode(code);
    var genericError = 'That record ID and management code do not match any record stored in this browser.';

    if (wantedId === '' || wantedCode === '') {
      return { ok: false, error: 'Enter both the record ID and the management code.' };
    }

    var post = postById(state, wantedId);
    if (post) {
      if (SJ.store.normalizeCode(post.managementCode) === wantedCode) {
        return { ok: true, kind: 'post', record: post };
      }
      return { ok: false, error: genericError };
    }

    var application = applicationById(state, wantedId);
    if (application) {
      if (SJ.store.normalizeCode(application.managementCode) === wantedCode) {
        return { ok: true, kind: 'application', record: application };
      }
      return { ok: false, error: genericError };
    }

    return { ok: false, error: genericError };
  }

  /* ------------------------------------------------------------------ commands */

  function saveProfileAndResume(currentState, input) {
    var check = validateProfile(input);
    if (!check.ok) {
      return { ok: false, error: 'Please correct the highlighted fields.', errors: check.errors };
    }

    var next = cloneState(currentState);
    var profile = profileById(next, next.activeProfileId);

    if (profile) {
      profile.name = check.value.name;
      profile.phone = check.value.phone;
      profile.email = check.value.email;
    } else {
      if (!next.nextSequence.profile) { next.nextSequence.profile = 1; }
      var profileId = 'PROF-LOCAL-' + String(next.nextSequence.profile).padStart(3, '0');
      next.nextSequence.profile += 1;
      profile = {
        profileId: profileId,
        name: check.value.name,
        phone: check.value.phone,
        email: check.value.email,
        demoPerson: false,
        createdAt: SJ.store.todayNZ()
      };
      next.profiles.push(profile);
      next.activeProfileId = profile.profileId;
    }

    return { ok: true, state: next, profile: profile };
  }

  function switchPerson(currentState, profileId) {
    var next = cloneState(currentState);
    if (!profileId) {
      next.activeProfileId = null;
      return { ok: true, state: next, profile: null };
    }
    var profile = profileById(currentState, profileId);
    if (!profile) {
      return { ok: false, error: 'That demo person does not exist in the current snapshot.' };
    }
    next.activeProfileId = profileId;
    return { ok: true, state: next, profile: profile };
  }

  function createPost(currentState, input) {
    var profile = profileById(currentState, currentState.activeProfileId);
    if (!profileIsComplete(profile)) {
      return { ok: false, needsProfile: true, error: 'Your details are needed before a journey can be published.' };
    }

    var check = validatePost(input);
    if (!check.ok) {
      return { ok: false, error: 'Please correct the highlighted fields.', errors: check.errors };
    }

    var next = cloneState(currentState);
    var postId = SJ.store.allocatePostId(next);
    var managementCode = SJ.store.newManagementCode();

    var post = {
      postId: postId,
      ownerProfileId: profile.profileId,
      ownerAlias: (SJ.store.personaByProfileId(profile.profileId) || {}).alias || '',
      postType: check.value.postType,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      origin: check.value.origin,
      destination: check.value.destination,
      date: check.value.date,
      time: check.value.time,
      notes: check.value.notes,
      status: 'Open',
      confirmedApplicationId: null,
      managementCode: managementCode,
      createdAt: SJ.store.todayNZ()
    };

    next.posts.push(post);
    SJ.store.addActivityRef(next, profile.profileId, post.postId, managementCode);

    return { ok: true, state: next, post: post };
  }

  function applyToPosts(currentState, input) {
    var profile = profileById(currentState, currentState.activeProfileId);
    if (!profileIsComplete(profile)) {
      return {
        ok: false,
        needsProfile: true,
        error: 'Your details are needed before an application can be sent.',
        postIds: (input.postIds || []).slice()
      };
    }

    var postIds = input.postIds || [];
    if (postIds.length === 0) {
      return { ok: false, error: 'Select at least one journey first.', results: [] };
    }

    var next = cloneState(currentState);
    var now = SJ.store.nzNow();
    var appliedAt = now.date + ' ' + now.time;
    var results = [];
    var successCount = 0;
    var blockedBy = activeAcceptedFor(next, profile.profileId);

    postIds.forEach(function (postId) {
      var post = postById(next, postId);

      if (!post) {
        results.push({ postId: postId, ok: false, error: 'This journey is no longer in the local snapshot.' });
        return;
      }
      if (post.ownerProfileId && post.ownerProfileId === profile.profileId) {
        results.push({ postId: post.postId, ok: false, error: 'You cannot apply to a journey you published yourself.', post: post });
        return;
      }
      if (post.status !== 'Open') {
        results.push({ postId: post.postId, ok: false, error: 'This journey is ' + post.status + ' and no longer accepts applications.', post: post });
        return;
      }
      if (isPastDeparture(post, now)) {
        results.push({ postId: post.postId, ok: false, error: 'This journey has already departed.', post: post });
        return;
      }
      if (liveApplicationFor(next, post.postId, profile.profileId)) {
        results.push({ postId: post.postId, ok: false, error: 'You already have an active application for this journey.', post: post });
        return;
      }
      if (blockedBy) {
        results.push({ postId: post.postId, ok: false, error: 'You already have a confirmed journey (' + blockedBy.applicationId + '), so a second application is not allowed.', post: post });
        return;
      }

      var applicationId = SJ.store.allocateApplicationId(next);
      var managementCode = SJ.store.newManagementCode();
      var application = {
        applicationId: applicationId,
        postId: post.postId,
        applicantProfileId: profile.profileId,
        applicantName: profile.name,
        applicantPhone: profile.phone,
        applicantEmail: profile.email,
        appliedAt: appliedAt,
        status: 'Pending',
        reason: '',
        managementCode: managementCode
      };
      next.applications.push(application);
      SJ.store.addActivityRef(next, profile.profileId, applicationId, managementCode);
      successCount += 1;
      results.push({ postId: post.postId, ok: true, application: application, post: post });
    });

    if (successCount === 0) {
      return {
        ok: false,
        state: currentState,
        results: results,
        error: results.length === 1 ? results[0].error : 'None of the selected journeys could be applied to.'
      };
    }

    return { ok: true, state: next, results: results, successCount: successCount, failedCount: results.length - successCount };
  }

  /* ==================================================================
     DAY 2 — approvals, withdrawals and cancellations (images 07 / 08 / 09)

     Every command first asks its own permission predicate, so the button state
     in the UI and the rule that runs on submit can never disagree.
     ================================================================== */

  function ownPost(state, post) {
    var profile = profileById(state, state.activeProfileId);
    return !!profile && !!post && post.ownerProfileId === profile.profileId;
  }

  function samePerson(state, profileId) {
    return !!state.activeProfileId && state.activeProfileId === profileId;
  }

  function canAccept(state, applicationId) {
    var application = applicationById(state, applicationId);
    if (!application) { return { ok: false, error: 'That application is not in the local snapshot.', code: 'missing' }; }
    var post = postById(state, application.postId);
    if (!post) { return { ok: false, error: 'The journey behind this application no longer exists.', code: 'no-post' }; }
    if (!ownPost(state, post)) {
      return { ok: false, error: 'Only the publisher of this journey can accept an application.', code: 'not-owner' };
    }
    if (application.status !== 'Pending') {
      return { ok: false, error: 'This application is ' + application.status + ' and can no longer be accepted.', code: 'not-pending' };
    }
    if (post.status === 'Confirmed') {
      return { ok: false, error: 'This journey is already confirmed with another traveller.', code: 'confirmed' };
    }
    if (post.status !== 'Open') {
      return { ok: false, error: 'This journey is ' + post.status + ' and cannot be confirmed.', code: 'post-closed' };
    }
    if (isPastDeparture(post)) {
      return { ok: false, error: 'This journey has already departed, so it cannot be accepted any more.', code: 'departed' };
    }
    var others = activeAcceptedFor(state, application.applicantProfileId);
    if (others) {
      return {
        ok: false,
        error: 'This applicant is already confirmed on journey ' + others.applicationId + ' (' + others.postId + ').',
        code: 'applicant-confirmed'
      };
    }
    return { ok: true, application: application, post: post };
  }

  function canDecline(state, applicationId) {
    var application = applicationById(state, applicationId);
    if (!application) { return { ok: false, error: 'That application is not in the local snapshot.', code: 'missing' }; }
    var post = postById(state, application.postId);
    if (!post) { return { ok: false, error: 'The journey behind this application no longer exists.', code: 'no-post' }; }
    if (!ownPost(state, post)) {
      return { ok: false, error: 'Only the publisher of this journey can decline an application.', code: 'not-owner' };
    }
    if (application.status !== 'Pending') {
      return { ok: false, error: 'This application is ' + application.status + ' and can no longer be declined.', code: 'not-pending' };
    }
    return { ok: true, application: application, post: post };
  }

  function canWithdraw(state, applicationId) {
    var application = applicationById(state, applicationId);
    if (!application) { return { ok: false, error: 'That application is not in the local snapshot.', code: 'missing' }; }
    if (!samePerson(state, application.applicantProfileId)) {
      return { ok: false, error: 'Only the applicant can withdraw this application.', code: 'not-applicant' };
    }
    if (application.status !== 'Pending') {
      return { ok: false, error: 'This application is ' + application.status + ' and can no longer be withdrawn.', code: 'not-pending' };
    }
    return { ok: true, application: application, post: postById(state, application.postId) };
  }

  function canCancelJourney(state, applicationId) {
    var application = applicationById(state, applicationId);
    if (!application) { return { ok: false, error: 'That application is not in the local snapshot.', code: 'missing' }; }
    if (!samePerson(state, application.applicantProfileId)) {
      return { ok: false, error: 'Only the applicant can cancel this confirmed journey.', code: 'not-applicant' };
    }
    if (application.status !== 'Accepted') {
      return { ok: false, error: 'Only a confirmed (Accepted) application can be cancelled here.', code: 'not-accepted' };
    }
    var post = postById(state, application.postId);
    if (post && isPastDeparture(post)) {
      return { ok: false, error: 'This journey has already departed, so the confirmed place cannot be cancelled.', code: 'departed' };
    }
    return { ok: true, application: application, post: post };
  }

  function canCancelPost(state, postId) {
    var post = postById(state, postId);
    if (!post) { return { ok: false, error: 'That journey is not in the local snapshot.', code: 'missing' }; }
    if (!ownPost(state, post)) {
      return { ok: false, error: 'Only the publisher can cancel this journey.', code: 'not-owner' };
    }
    if (post.status === 'Cancelled') {
      return { ok: false, error: 'This journey is already cancelled.', code: 'cancelled' };
    }
    if (isPastDeparture(post)) {
      return { ok: false, error: 'This journey has already departed, so it cannot be cancelled.', code: 'departed' };
    }
    return { ok: true, post: post };
  }

  /* Accept must be computed and stored in one pass: this application becomes
     Accepted, the journey becomes Confirmed and leaves the public list, the
     other applicants on this journey become Not Selected, and every other
     Pending application of the same applicant (on ANY journey) becomes
     Automatically Cancelled with a written reason. */
  function acceptApplication(currentState, input) {
    var check = canAccept(currentState, input.applicationId);
    if (!check.ok) { return check; }

    var application = check.application;
    var post = check.post;
    var next = cloneState(currentState);
    var target = applicationById(next, application.applicationId);
    var targetPost = postById(next, post.postId);

    target.status = 'Accepted';
    target.reason = '';
    targetPost.status = 'Confirmed';
    targetPost.confirmedApplicationId = target.applicationId;

    var notSelected = [];
    applicationsOfPost(next, targetPost.postId).forEach(function (other) {
      if (other.applicationId === target.applicationId || other.status !== 'Pending') { return; }
      other.status = 'Not Selected';
      other.reason = 'Another applicant was accepted for this journey.';
      notSelected.push(other.applicationId);
    });

    var autoCancelled = [];
    next.applications.forEach(function (other) {
      if (other.applicationId === target.applicationId) { return; }
      if (other.applicantProfileId !== target.applicantProfileId) { return; }
      if (other.status !== 'Pending') { return; }
      other.status = 'Automatically Cancelled';
      other.reason = 'Automatically cancelled: this applicant was accepted for journey ' + targetPost.postId + '.';
      autoCancelled.push(other.applicationId);
    });

    return {
      ok: true,
      state: next,
      post: targetPost,
      application: target,
      notSelected: notSelected,
      autoCancelled: autoCancelled,
      message: 'Accepted ' + target.applicantName + ' for ' + post.origin + ' \u2192 ' + post.destination + '.'
    };
  }

  function declineApplication(currentState, input) {
    var check = canDecline(currentState, input.applicationId);
    if (!check.ok) { return check; }

    var next = cloneState(currentState);
    var target = applicationById(next, check.application.applicationId);
    target.status = 'Declined';
    target.reason = 'Declined by the publisher.';

    return {
      ok: true,
      state: next,
      application: target,
      post: postById(next, target.postId),
      message: 'Declined the application from ' + target.applicantName + '. The journey stays open for other applicants.'
    };
  }

  function withdrawApplication(currentState, input) {
    var check = canWithdraw(currentState, input.applicationId);
    if (!check.ok) { return check; }

    var next = cloneState(currentState);
    var target = applicationById(next, check.application.applicationId);
    target.status = 'Withdrawn';
    target.reason = 'Withdrawn by the applicant.';

    return {
      ok: true,
      state: next,
      application: target,
      post: postById(next, target.postId),
      message: 'Application ' + target.applicationId + ' was withdrawn. Nothing else changed.'
    };
  }

  function cancelPost(currentState, input) {
    var check = canCancelPost(currentState, input.postId);
    if (!check.ok) { return check; }

    var next = cloneState(currentState);
    var post = postById(next, check.post.postId);
    post.status = 'Cancelled';
    post.confirmedApplicationId = null;

    var cancelled = [];
    applicationsOfPost(next, post.postId).forEach(function (application) {
      if (application.status !== 'Pending' && application.status !== 'Accepted') { return; }
      application.status = 'Cancelled';
      application.reason = 'The publisher cancelled this journey.';
      cancelled.push(application.applicationId);
    });

    return {
      ok: true,
      state: next,
      post: post,
      cancelled: cancelled,
      message: 'Journey ' + post.postId + ' was cancelled'
        + (cancelled.length > 0 ? ' and ' + cancelled.length + ' related application(s) were cancelled with it.' : '.')
    };
  }

  /* The applicant gives up a confirmed place. If the journey has not departed
     and the publisher did not cancel it, the journey goes back to Open — but old
     terminal applications (Not Selected / Automatically Cancelled) never revive. */
  function cancelJourney(currentState, input) {
    var check = canCancelJourney(currentState, input.applicationId);
    if (!check.ok) { return check; }

    var next = cloneState(currentState);
    var application = applicationById(next, check.application.applicationId);
    application.status = 'Cancelled';
    application.reason = 'Cancelled by the applicant.';

    var reopened = false;
    var post = postById(next, application.postId);
    if (post && post.status !== 'Cancelled' && !isPastDeparture(post)) {
      post.status = 'Open';
      post.confirmedApplicationId = null;
      reopened = true;
    }

    return {
      ok: true,
      state: next,
      application: application,
      post: post,
      reopened: reopened,
      message: 'Confirmed journey cancelled. ' + (reopened
        ? 'Journey ' + (post ? post.postId : '') + ' is public again and can receive new applications.'
        : 'The journey was not reopened.')
    };
  }

  function expireRecords(currentState) {
    var now = SJ.store.nzNow();
    var expiringPostIds = {};
    currentState.posts.forEach(function (post) {
      if (post.status === 'Open' && isPastDeparture(post, now)) { expiringPostIds[post.postId] = true; }
    });

    var postChanges = currentState.posts.filter(function (post) {
      return expiringPostIds[post.postId] === true;
    });
    var applicationChanges = currentState.applications.filter(function (application) {
      if (application.status !== 'Pending') { return false; }
      var post = postById(currentState, application.postId);
      if (!post) { return false; }
      return post.status === 'Expired' || expiringPostIds[post.postId] === true;
    });

    if (postChanges.length === 0 && applicationChanges.length === 0) {
      return { state: currentState, changed: false, postsExpired: 0, applicationsExpired: 0 };
    }

    var next = cloneState(currentState);
    postChanges.forEach(function (stale) {
      var post = postById(next, stale.postId);
      if (post) { post.status = 'Expired'; }
    });
    applicationChanges.forEach(function (stale) {
      var application = applicationById(next, stale.applicationId);
      if (application) {
        application.status = 'Expired';
        application.reason = 'The departure time passed before the publisher responded.';
      }
    });

    return {
      state: next,
      changed: true,
      postsExpired: postChanges.length,
      applicationsExpired: applicationChanges.length
    };
  }

  return {
    /* queries */
    filterPosts: filterPosts,
    knownCities: knownCities,
    profileById: profileById,
    profileIsComplete: profileIsComplete,
    postById: postById,
    applicationById: applicationById,
    applicationsOfPost: applicationsOfPost,
    liveApplicationFor: liveApplicationFor,
    activeAcceptedFor: activeAcceptedFor,
    selectionState: selectionState,
    isPastDeparture: isPastDeparture,
    isPubliclyVisible: isPubliclyVisible,
    departureKey: departureKey,
    getActivity: getActivity,
    verifyManagementCode: verifyManagementCode,

    /* validation */
    validateProfile: validateProfile,
    validatePost: validatePost,

    /* commands */
    saveProfileAndResume: saveProfileAndResume,
    switchPerson: switchPerson,
    createPost: createPost,
    applyToPosts: applyToPosts,
    expireRecords: expireRecords,

    /* DAY 2 commands and their permission predicates */
    canAccept: canAccept,
    canDecline: canDecline,
    canWithdraw: canWithdraw,
    canCancelPost: canCancelPost,
    canCancelJourney: canCancelJourney,
    acceptApplication: acceptApplication,
    declineApplication: declineApplication,
    withdrawApplication: withdrawApplication,
    cancelPost: cancelPost,
    cancelJourney: cancelJourney
  };
}());
