/* ==========================================================================
   Share-a-Journey — js/store.js
   Owns: CSV seed import, New Zealand demo dates, the single localStorage
   snapshot, schema checking, demo people and record IDs / management codes.
   It never renders and never decides business rules.
   ========================================================================== */

window.SJ = window.SJ || {};

SJ.store = (function () {
  'use strict';

  var STORAGE_KEY = 'sj_demo_state_v2';
  var SCHEMA_VERSION = 2;
  var SEED_URL = 'data/posts_seed.csv';
  var NZ_TIME_ZONE = 'Pacific/Auckland';
  var ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

  /* Demo people. Alex deliberately has no saved contact details yet so that
     "Your Details" (reference image 02) really appears on his first action.
     The others are fixture publishers with a saved contact already. */
  var DEMO_PERSONAS = [
    { alias: 'alex', profileId: 'PROF-ALEX', name: 'Alex Taylor', phone: '', email: '' },
    { alias: 'adam', profileId: 'PROF-ADAM', name: 'Adam Wilson', phone: '+64 21 555 0102', email: 'adam.wilson@example.com' },
    { alias: 'mia', profileId: 'PROF-MIA', name: 'Mia Chen', phone: '+64 21 555 0103', email: 'mia.chen@example.com' },
    { alias: 'tom', profileId: 'PROF-TOM', name: 'Tom Reed', phone: '+64 21 555 0104', email: 'tom.reed@example.com' },
    { alias: 'zoe', profileId: 'PROF-ZOE', name: 'Zoe Parker', phone: '+64 21 555 0105', email: 'zoe.parker@example.com' },
    { alias: 'liam', profileId: 'PROF-LIAM', name: 'Liam Scott', phone: '+64 21 555 0106', email: 'liam.scott@example.com' },
    { alias: 'emma', profileId: 'PROF-EMMA', name: 'Emma Brown', phone: '+64 21 555 0107', email: 'emma.brown@example.com' }
  ];

  /* Byte-for-byte copy of data/posts_seed.csv. It is only used when the CSV
     cannot be fetched (for example when index.html is opened from file://),
     so the demo still starts instead of showing an empty page. */
  var SEED_CSV_FALLBACK = [
    'postId,ownerAlias,postType,name,phone,email,origin,destination,daysAhead,time,notes',
    'P001,adam,driver,Adam Wilson,+64 21 555 0102,adam.wilson@example.com,Auckland,Hamilton,7,08:30,One way trip. One small bag per passenger.',
    'P002,mia,driver,Mia Chen,+64 21 555 0103,mia.chen@example.com,Auckland,Hamilton,7,09:00,Flexible departure time if we agree the day before.',
    'P003,tom,driver,Tom Reed,+64 21 555 0104,tom.reed@example.com,Auckland,Hamilton,7,10:00,Happy to share fuel costs.',
    'P004,zoe,passenger,Zoe Parker,+64 21 555 0105,zoe.parker@example.com,Wellington,Palmerston North,8,09:30,"Looking for a driver. ""Morning preferred."""',
    'P005,liam,passenger,Liam Scott,+64 21 555 0106,liam.scott@example.com,Christchurch,Dunedin,8,11:00,Looking for transport with room for one suitcase.',
    'P006,emma,driver,Emma Brown,+64 21 555 0107,emma.brown@example.com,Tauranga,Rotorua,9,14:00,"Day trip, back the same evening."'
  ].join('\n');

  var state = null;
  var seedSource = 'csv';
  var persistenceError = '';

  /* ------------------------------------------------------------------ dates */

  function nzNow() {
    var parts = new Intl.DateTimeFormat('en-NZ', {
      timeZone: NZ_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    var map = {};
    parts.forEach(function (part) { map[part.type] = part.value; });
    var hour = map.hour === '24' ? '00' : map.hour;
    return { date: map.year + '-' + map.month + '-' + map.day, time: hour + ':' + map.minute };
  }

  function addDaysISO(isoDate, days) {
    var base = Date.parse(isoDate + 'T00:00:00Z');
    if (isNaN(base)) { return isoDate; }
    return new Date(base + days * 86400000).toISOString().slice(0, 10);
  }

  /* Display form of a YYYY-MM-DD date, e.g. "Tue, 20 Oct 2026". The date is
     formatted in UTC so a date-only value never shifts by a day. */
  function formatDateNZ(isoDate) {
    var ms = Date.parse(String(isoDate) + 'T00:00:00Z');
    if (isNaN(ms)) { return String(isoDate); }
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(ms));
  }

  function daysUntilNZ(isoDate) {
    var target = Date.parse(String(isoDate) + 'T00:00:00Z');
    var today = Date.parse(nzNow().date + 'T00:00:00Z');
    if (isNaN(target)) { return null; }
    return Math.round((target - today) / 86400000);
  }

  /* -------------------------------------------------------------- CSV import */

  function parseCsv(text) {
    var src = String(text).replace(/^\uFEFF/, '');
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < src.length; i += 1) {
      var ch = src.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (src.charAt(i + 1) === '"') { field += '"'; i += 1; }
          else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (ch !== '\r') {
        field += ch;
      }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(function (cells) {
      return cells.some(function (cell) { return String(cell).trim() !== ''; });
    });
  }

  function rowsToObjects(rows) {
    if (rows.length === 0) { return []; }
    var header = rows[0].map(function (cell) { return String(cell).trim(); });
    return rows.slice(1).map(function (cells) {
      var obj = {};
      header.forEach(function (key, index) {
        obj[key] = cells[index] === undefined ? '' : String(cells[index]).trim();
      });
      return obj;
    });
  }

  function normalizePostId(rawId, index) {
    var match = /^P0*(\d+)$/i.exec(String(rawId).trim());
    if (match) { return 'POST-' + String(match[1]).padStart(3, '0'); }
    var text = String(rawId).trim();
    return text !== '' ? text : 'POST-' + String(index + 1).padStart(3, '0');
  }

  function postTypeOf(value) {
    return String(value).trim().toLowerCase() === 'passenger' ? 'passenger' : 'driver';
  }

  /* --------------------------------------------------------------- new state */

  function buildSeedState(csvText) {
    var today = nzNow().date;
    var records = rowsToObjects(parseCsv(csvText));
    if (records.length === 0) {
      throw new Error('The journey table is empty, so no journeys could be created.');
    }

    var next = {
      schemaVersion: SCHEMA_VERSION,
      profiles: DEMO_PERSONAS.map(function (person) {
        return {
          profileId: person.profileId,
          name: person.name,
          phone: person.phone,
          email: person.email,
          demoPerson: true,
          createdAt: today
        };
      }),
      posts: [],
      applications: [],
      activityRefs: {},
      activeProfileId: null,
      nextSequence: { post: 1, application: 41 },
      seededAt: today
    };

    var usedIds = {};
    records.forEach(function (record, index) {
      var postId = normalizePostId(record.postId, index);
      while (usedIds[postId]) { postId = postId + '-B'; }
      usedIds[postId] = true;

      var owner = DEMO_PERSONAS.filter(function (person) {
        return person.alias === String(record.ownerAlias).trim().toLowerCase();
      })[0];

      var daysAhead = Number(record.daysAhead);
      if (!isFinite(daysAhead)) { daysAhead = 7; }

      next.posts.push({
        postId: postId,
        ownerProfileId: owner ? owner.profileId : null,
        ownerAlias: owner ? owner.alias : '',
        postType: postTypeOf(record.postType),
        name: record.name || (owner ? owner.name : 'Journey publisher'),
        phone: record.phone || '',
        email: record.email || '',
        origin: record.origin || '',
        destination: record.destination || '',
        date: addDaysISO(today, daysAhead),
        time: record.time || '09:00',
        notes: record.notes || '',
        status: 'Open',
        confirmedApplicationId: null,
        managementCode: 'DEMO-' + String(index + 1).padStart(4, '0'),
        createdAt: today
      });
    });

    next.nextSequence.post = next.posts.length + 1;
    next.posts.forEach(function (post) {
      if (post.ownerProfileId) {
        pushActivityRef(next, post.ownerProfileId, post.postId, post.managementCode);
      }
    });
    return next;
  }

  function pushActivityRef(target, profileId, recordId, managementCode) {
    if (!target.activityRefs[profileId]) { target.activityRefs[profileId] = []; }
    target.activityRefs[profileId].push({ recordId: recordId, managementCode: managementCode });
  }

  /* ------------------------------------------------------------- persistence */

  function storageAvailable() {
    try {
      var probe = '__sj_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  function isValidState(candidate) {
    return !!candidate &&
      candidate.schemaVersion === SCHEMA_VERSION &&
      Array.isArray(candidate.profiles) &&
      Array.isArray(candidate.posts) &&
      Array.isArray(candidate.applications) &&
      candidate.nextSequence &&
      typeof candidate.nextSequence.post === 'number' &&
      typeof candidate.nextSequence.application === 'number';
  }

  function readStoredState() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return { ok: false, error: 'This browser refused access to local storage, so the saved data cannot be read.' };
    }
    if (!raw) { return { ok: true, state: null }; }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { ok: false, error: 'The saved data is damaged. Use Reset Data to rebuild it.' };
    }
    if (!isValidState(parsed)) {
      return { ok: false, error: 'The saved data uses an older or unknown format. Use Reset Data to rebuild it.' };
    }
    return { ok: true, state: parsed };
  }

  function commitState(nextState) {
    if (!isValidState(nextState)) {
      return { ok: false, error: 'The new state failed the schema check, so nothing was saved.' };
    }
    var serialized;
    try {
      serialized = JSON.stringify(nextState);
    } catch (err) {
      return { ok: false, error: 'The new state could not be serialized, so nothing was saved.' };
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch (err) {
      return { ok: false, error: 'Saving to this browser failed (storage may be full or blocked). Nothing was changed.' };
    }
    state = nextState;
    return { ok: true };
  }

  /* ------------------------------------------------------------- seed loading */

  function fetchSeedCsv() {
    if (typeof window.fetch !== 'function') {
      return Promise.resolve({ text: SEED_CSV_FALLBACK, source: 'embedded' });
    }
    var request;
    try {
      request = window.fetch(SEED_URL, { cache: 'no-store' });
    } catch (err) {
      return Promise.resolve({ text: SEED_CSV_FALLBACK, source: 'embedded' });
    }
    return Promise.resolve(request).then(function (response) {
      if (!response.ok) { throw new Error('HTTP ' + response.status); }
      return response.text();
    }).then(function (text) {
      if (!text || text.indexOf(',') === -1) { throw new Error('The seed table looks empty.'); }
      return { text: text, source: 'csv' };
    }).catch(function () {
      return { text: SEED_CSV_FALLBACK, source: 'embedded' };
    });
  }

  function init() {
    var stored = readStoredState();
    if (stored.ok && stored.state) {
      state = stored.state;
      seedSource = 'stored';
      return Promise.resolve({ ok: true });
    }
    if (!stored.ok) {
      persistenceError = stored.error;
    }
    return fetchSeedCsv().then(function (seed) {
      seedSource = seed.source;
      var fresh;
      try {
        fresh = buildSeedState(seed.text);
      } catch (err) {
        return { ok: false, error: err.message };
      }
      var result = commitState(fresh);
      if (!result.ok) {
        state = fresh;
        persistenceError = result.error;
        return { ok: true, persisted: false, error: result.error };
      }
      return { ok: true, persisted: true };
    });
  }

  function resetDemoData() {
    return fetchSeedCsv().then(function (seed) {
      seedSource = seed.source;
      var fresh = buildSeedState(seed.text);
      var result = commitState(fresh);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      persistenceError = '';
      return { ok: true, state: fresh };
    });
  }

  /* Re-reads the snapshot from localStorage. Used by "Refresh Status" so the
     list is genuinely re-read instead of being re-rendered from memory. */
  function reload() {
    var stored = readStoredState();
    if (!stored.ok) {
      return { ok: false, error: stored.error };
    }
    if (!stored.state) {
      return { ok: false, error: 'There is no saved data in this browser yet. Post or apply once, or use Reset Data.' };
    }
    state = stored.state;
    return { ok: true };
  }

  /* ------------------------------------------------------------------ records */

  function allocatePostId(target) {
    var sequence = target.nextSequence.post;
    target.nextSequence.post = sequence + 1;
    return 'POST-' + String(sequence).padStart(3, '0');
  }

  function allocateApplicationId(target) {
    var sequence = target.nextSequence.application;
    target.nextSequence.application = sequence + 1;
    return 'APP-' + String(sequence).padStart(3, '0');
  }

  function newManagementCode() {
    var bytes = new Uint8Array(8);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    var code = '';
    for (var j = 0; j < bytes.length; j += 1) {
      code += ID_ALPHABET.charAt(bytes[j] % ID_ALPHABET.length);
    }
    return code.slice(0, 4) + '-' + code.slice(4);
  }

  function normalizeCode(value) {
    return String(value == null ? '' : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normalizeRecordId(value) {
    return String(value == null ? '' : value).trim().toUpperCase();
  }

  function addActivityRef(target, profileId, recordId, managementCode) {
    pushActivityRef(target, profileId, recordId, managementCode);
  }

  /* ---------------------------------------------------------------- public API */

  return {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    SEED_URL: SEED_URL,

    init: init,
    resetDemoData: resetDemoData,
    reload: reload,
    getState: function () { return state; },
    commitState: commitState,
    storageAvailable: storageAvailable,
    persistenceError: function () { return persistenceError; },
    seedSource: function () { return seedSource; },

    personas: function () {
      return DEMO_PERSONAS.map(function (person) {
        return { alias: person.alias, profileId: person.profileId, name: person.name };
      });
    },
    personaByProfileId: function (profileId) {
      return DEMO_PERSONAS.filter(function (person) { return person.profileId === profileId; })[0] || null;
    },

    nzNow: nzNow,
    todayNZ: function () { return nzNow().date; },
    addDaysISO: addDaysISO,
    formatDateNZ: formatDateNZ,
    daysUntilNZ: daysUntilNZ,

    allocatePostId: allocatePostId,
    allocateApplicationId: allocateApplicationId,
    newManagementCode: newManagementCode,
    normalizeCode: normalizeCode,
    normalizeRecordId: normalizeRecordId,
    addActivityRef: addActivityRef,

    /* exposed for the offline check script in tools/ */
    _parseCsv: parseCsv,
    _rowsToObjects: rowsToObjects,
    _buildSeedState: buildSeedState,
    _fallbackCsv: function () { return SEED_CSV_FALLBACK; }
  };
}());
