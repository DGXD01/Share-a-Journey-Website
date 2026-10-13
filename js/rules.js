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

  function hasUnfinishedAccepted(state, profileId) {
    return state.applications.some(function (application) {
      return application.applicantProfileId === profileId && application.status === 'Accepted';
    });
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
    var acceptanceBlocked = hasUnfinishedAccepted(next, profile.profileId);

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
      if (acceptanceBlocked) {
        results.push({ postId: post.postId, ok: false, error: 'You already have an accepted journey, so a second application is not allowed.', post: post });
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
    expireRecords: expireRecords
  };
}());
