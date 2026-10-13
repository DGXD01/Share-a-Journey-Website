/* ==========================================================================
   Share-a-Journey — js/ui.js
   Rendering only. Every user supplied value is written with textContent or
   createElement — user input is never concatenated into innerHTML.
   ========================================================================== */

window.SJ = window.SJ || {};

SJ.ui = (function () {
  'use strict';

  var focusReturn = {};

  /* --------------------------------------------------------------- utilities */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = String(text); }
    return node;
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i += 1) {
      var child = arguments[i];
      if (child) { parent.appendChild(child); }
    }
    return parent;
  }

  function clear(node) {
    if (node) { node.replaceChildren(); }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function initial(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    if (parts.length === 0 || parts[0] === '') { return '?'; }
    if (parts.length === 1) { return parts[0].charAt(0).toUpperCase(); }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function formatDate(iso) {
    return SJ.store.formatDateNZ(iso);
  }

  function daysUntil(iso) {
    return SJ.store.daysUntilNZ(iso);
  }

  function departurePhrase(post) {
    var days = daysUntil(post.date);
    if (days === null) { return ''; }
    if (days < 0) { return 'Departed'; }
    if (days === 0) { return 'Departs today at ' + post.time; }
    if (days === 1) { return 'Departs tomorrow at ' + post.time; }
    return 'Departs in ' + days + ' days at ' + post.time;
  }

  function postTypeLabel(type) {
    return type === 'passenger' ? 'Passenger' : 'Driver';
  }

  function postTypeClass(type) {
    return type === 'passenger' ? 'badge badge-passenger' : 'badge badge-driver';
  }

  function statusClass(status) {
    return 'badge badge-' + String(status).toLowerCase().replace(/\s+/g, '-');
  }

  function avatar(name) {
    var node = el('span', 'avatar', initial(name));
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function routeLine(post) {
    var wrap = el('div', 'card-route');
    append(wrap,
      el('span', 'city', post.origin),
      el('span', 'arrow', '\u2192'),
      el('span', 'city', post.destination)
    );
    return wrap;
  }

  function routeText(post) {
    return post.origin + ' \u2192 ' + post.destination;
  }

  /* ------------------------------------------------------------------ header */

  function renderHeader(state, options) {
    var profile = SJ.rules.profileById(state, state.activeProfileId);
    var nameNode = $('current-person-name');
    var avatarNode = $('current-person-avatar');

    if (profile) {
      nameNode.textContent = profile.name;
      avatarNode.textContent = initial(profile.name);
    } else {
      nameNode.textContent = 'Not selected';
      avatarNode.textContent = '?';
    }

    var chip = $('current-person');
    chip.title = profile
      ? (SJ.rules.profileIsComplete(profile)
        ? 'Saved contact: ' + profile.phone + ' · ' + profile.email
        : 'No saved contact details yet — they are asked for on your first action.')
      : 'No demo person is active. Your details are saved from the first action.';

    var select = $('demo-person-select');
    if (options.showDemoTools) {
      clear(select);
      var placeholder = el('option', null, 'No one (guest)');
      placeholder.value = '';
      select.appendChild(placeholder);
      options.personas.forEach(function (person) {
        var option = el('option', null, person.name + (person.phone ? '' : ' · no details yet'));
        option.value = person.profileId;
        select.appendChild(option);
      });
      select.value = state.activeProfileId || '';
    }
  }

  function renderCities(state) {
    var list = $('city-list');
    clear(list);
    SJ.rules.knownCities(state).forEach(function (city) {
      var option = document.createElement('option');
      option.value = city;
      list.appendChild(option);
    });
  }

  /* ------------------------------------------------------------- browse view */

  function renderBrowse(state, uiState) {
    var posts = SJ.rules.filterPosts(state, uiState.filters);
    var grid = $('journey-grid');
    clear(grid);

    posts.forEach(function (post) {
      grid.appendChild(buildCard(state, post, uiState));
    });

    $('empty-state').hidden = posts.length !== 0;
    $('results-count').textContent = posts.length === 1 ? '1 journey' : posts.length + ' journeys';
    renderBrowseHint(state, uiState, posts.length);
  }

  function renderBrowseHint(state, uiState, visibleCount) {
    var hint = $('browse-hint');
    var filters = uiState.filters;
    var active = [];
    if (filters.origin) { active.push('from "' + filters.origin + '"'); }
    if (filters.destination) { active.push('to "' + filters.destination + '"'); }
    if (filters.date) { active.push('on ' + formatDate(filters.date)); }
    if (filters.postType) { active.push(postTypeLabel(filters.postType) + ' posts only'); }

    var profile = SJ.rules.profileById(state, state.activeProfileId);
    var parts = [];

    if (active.length > 0) {
      parts.push('Filter applied: ' + active.join(', ') + '. ' + visibleCount + ' open journey' + (visibleCount === 1 ? '' : 's') + ' matched.');
    } else {
      parts.push('Showing every open journey, soonest departure first.');
    }
    parts.push(profile
      ? 'You are browsing as ' + profile.name + '. Journeys you already applied to stay visible and are marked Pending.'
      : 'No person is selected yet — your details will be asked for on your first post or application.');

    hint.textContent = parts.join(' ');
    hint.hidden = false;
  }

  function buildCard(state, post, uiState) {
    var selection = SJ.rules.selectionState(state, post.postId);
    var card = el('article', 'journey-card');
    card.setAttribute('data-post-id', post.postId);

    var selected = uiState.selectedPostIds.has(post.postId);
    if (selected) { card.classList.add('is-selected'); }

    var top = el('div', 'card-top');
    append(top, el('span', postTypeClass(post.postType), postTypeLabel(post.postType)));
    if (selection.reason === 'own') {
      append(top, el('span', 'badge badge-own', 'Your Post'));
    } else if (selection.reason === 'pending') {
      append(top, el('span', 'badge badge-pending', 'Pending'));
    } else if (selection.reason === 'accepted') {
      append(top, el('span', 'badge badge-accepted', 'Accepted'));
    } else if (selection.reason === 'closed') {
      append(top, el('span', statusClass(post.status), post.status));
    }
    card.appendChild(top);

    card.appendChild(routeLine(post));

    var meta = el('div', 'card-meta');
    append(meta,
      el('span', null, formatDate(post.date) + ' at ' + post.time),
      el('span', null, departurePhrase(post))
    );
    card.appendChild(meta);

    var publisher = el('div', 'card-publisher');
    var ptext = el('span', 'publisher-text');
    append(ptext,
      el('strong', null, post.name),
      el('span', null, 'Publisher · ' + postTypeLabel(post.postType).toLowerCase())
    );
    append(publisher, avatar(post.name), ptext);
    card.appendChild(publisher);

    if (post.notes) {
      card.appendChild(el('p', 'card-notes', post.notes));
    }

    var foot = el('div', 'card-foot');
    var toggle = el('label', 'select-toggle' + (selection.selectable ? '' : ' is-disabled'));
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected;
    box.disabled = !selection.selectable;
    box.setAttribute('data-action', 'toggle-select');
    box.setAttribute('data-post-id', post.postId);
    box.setAttribute('aria-label', 'Select ' + routeText(post) + ' for a batch application');
    append(toggle, box, el('span', null, selection.selectable ? 'Select' : (selection.label || 'Unavailable')));
    foot.appendChild(toggle);

    var detailsBtn = el('button', 'btn btn-secondary btn-small', 'View Details');
    detailsBtn.type = 'button';
    detailsBtn.setAttribute('data-action', 'view-details');
    detailsBtn.setAttribute('data-post-id', post.postId);
    foot.appendChild(detailsBtn);
    card.appendChild(foot);

    var record = el('div', 'card-record', post.postId);
    card.appendChild(record);

    return card;
  }

  function renderSelectionBar(state, uiState) {
    var bar = $('selection-bar');
    var count = uiState.selectedPostIds.size;

    if (count === 0) {
      bar.hidden = true;
      $('selected-count').textContent = '0 journeys selected';
      $('selected-type').textContent = '';
      return;
    }

    var types = {};
    uiState.selectedPostIds.forEach(function (postId) {
      var post = SJ.rules.postById(state, postId);
      if (post) { types[post.postType] = true; }
    });
    var typeKeys = Object.keys(types);

    bar.hidden = false;
    $('selected-count').textContent = count === 1 ? '1 journey selected' : count + ' journeys selected';
    $('selected-type').textContent = typeKeys.length === 1
      ? 'All selected journeys are ' + postTypeLabel(typeKeys[0]) + ' posts — they can be applied to in one batch.'
      : 'Mixed post types selected. A batch may only contain one post type.';
  }

  function renderSelectionError(message) {
    var node = $('selection-error');
    if (!message) {
      node.hidden = true;
      node.textContent = '';
      return;
    }
    node.textContent = message;
    node.hidden = false;
  }

  function renderShortcut(state) {
    var activity = SJ.rules.getActivity(state, state.activeProfileId);
    $('shortcut-posts').textContent = activity.counts.posts;
    $('shortcut-applications').textContent = activity.counts.applications;
    $('shortcut-received').textContent = activity.counts.received;
  }

  /* ----------------------------------------------------------- activity view */

  function renderActivity(state, uiState) {
    var activity = SJ.rules.getActivity(state, state.activeProfileId);
    var profile = activity.profile;

    $('activity-person-line').textContent = profile
      ? (SJ.rules.profileIsComplete(profile)
        ? 'Showing records of ' + profile.name + ' (' + profile.phone + ' · ' + profile.email + ').'
        : 'Showing records of ' + profile.name + '. No contact details are saved yet — they are asked for on the next post or application.')
      : 'No person is selected. Use the demo identity switch, or post or apply once to create your local profile.';

    $('tab-count-posts').textContent = activity.counts.posts;
    $('tab-count-applications').textContent = activity.counts.applications;
    $('tab-count-received').textContent = activity.counts.received;

    renderMyPosts(activity, state);
    renderMyApplications(activity, state);
    renderReceived(activity);

    Array.prototype.forEach.call(document.querySelectorAll('#activity-tabs .tab'), function (tab) {
      var isActive = tab.getAttribute('data-tab') === uiState.activityTab;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
    });
    ['my-posts', 'my-applications', 'received'].forEach(function (name) {
      $(name + '-panel').hidden = name !== uiState.activityTab;
    });

    $('activity-scope-note').textContent = 'Local demo note: every row below is read from this browser\'s storage. '
      + 'Approvals, declines, withdrawals and cancellations are real state changes and are saved in the same snapshot the moment you use them.';
  }

  function cell(label, valueNode, extraClass) {
    var node = el('div', 'record-cell' + (extraClass ? ' ' + extraClass : ''));
    append(node, el('span', 'cell-label', label), valueNode);
    return node;
  }

  function valueNode(primary, secondary) {
    var wrap = el('span', 'cell-value');
    append(wrap, el('span', 'record-primary', primary));
    if (secondary) { append(wrap, el('span', 'record-secondary', secondary)); }
    return wrap;
  }

  function listEmpty(container, message, actionLabel, actionName) {
    var box = el('div', 'list-empty');
    box.appendChild(el('p', null, message));
    if (actionLabel) {
      var btn = el('button', 'btn btn-primary btn-small', actionLabel);
      btn.type = 'button';
      btn.setAttribute('data-action', actionName);
      box.appendChild(btn);
    }
    container.appendChild(box);
  }

  function actionButton(label, action, dataset, variant, check) {
    var btn = el('button', 'btn ' + (variant || 'btn-secondary') + ' btn-small', label);
    btn.type = 'button';
    btn.setAttribute('data-action', action);
    Object.keys(dataset || {}).forEach(function (key) {
      btn.setAttribute('data-' + key, dataset[key]);
    });
    if (check && check.ok === false) {
      btn.disabled = true;
      btn.title = check.error;
    }
    return btn;
  }

  function renderMyPosts(activity, state) {
    var list = $('my-posts-list');
    clear(list);

    if (!activity.profile) {
      listEmpty(list, 'No person is selected, so there are no posts of your own to show.');
      return;
    }
    if (activity.posts.length === 0) {
      listEmpty(list, 'You have not published any journey yet.', 'Post a Journey', 'open-post');
      return;
    }

    activity.posts.forEach(function (post) {
      var row = el('div', 'record-row posts');
      var applications = activity.received.filter(function (entry) { return entry.post.postId === post.postId; });
      var pending = applications.filter(function (entry) { return entry.application.status === 'Pending'; }).length;
      var accepted = applications.filter(function (entry) { return entry.application.status === 'Accepted'; })[0];

      row.appendChild(cell('Journey', valueNode(routeText(post), post.notes || 'No notes added yet.')));
      row.appendChild(cell('Departure', valueNode(formatDate(post.date), post.time + ' · ' + departurePhrase(post)), 'optional-cell'));

      var idNode = el('span', 'cell-value record-mono', post.postId);
      row.appendChild(cell('Record ID', idNode, 'optional-cell'));

      var statusWrap = el('span', 'cell-value');
      append(statusWrap, el('span', statusClass(post.status), post.status));
      var statusDetail = applications.length === 0
        ? 'Management code ' + post.managementCode
        : pending + ' pending · ' + applications.length + ' total application' + (applications.length === 1 ? '' : 's');
      if (accepted) { statusDetail = 'Confirmed with ' + accepted.application.applicantName; }
      append(statusWrap, el('span', 'record-secondary', statusDetail));
      row.appendChild(cell('Status', statusWrap));

      var actions = el('div', 'record-cell record-actions');
      actions.appendChild(actionButton('View Details', 'view-details', { 'post-id': post.postId }, 'btn-secondary'));
      actions.appendChild(actionButton('Manage', 'open-received', { 'post-id': post.postId }, 'btn-secondary'));
      actions.appendChild(actionButton('Cancel Post', 'cancel-post', { 'post-id': post.postId }, 'btn-danger',
        SJ.rules.canCancelPost(state, post.postId)));
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  function renderMyApplications(activity, state) {
    var banner = $('my-applications-banner');
    var list = $('my-applications-list');
    clear(banner);
    clear(list);

    if (!activity.profile) {
      listEmpty(list, 'No person is selected, so there are no applications to show.');
      return;
    }
    if (activity.applications.length === 0) {
      listEmpty(list, 'You have not applied to any journey yet.', 'Browse journeys', 'open-browse');
      return;
    }

    var pending = activity.applications.filter(function (entry) { return entry.application.status === 'Pending'; }).length;
    var acceptedEntries = activity.applications.filter(function (entry) { return entry.application.status === 'Accepted'; });
    var autoCancelled = activity.applications.filter(function (entry) { return entry.application.status === 'Automatically Cancelled'; }).length;
    var closed = activity.applications.length - pending - acceptedEntries.length;

    if (acceptedEntries.length > 0) {
      acceptedEntries.forEach(function (entry) {
        var post = entry.post;
        var bannerBox = el('div', 'status-banner accepted');
        var bannerText = el('div', null);
        append(bannerText,
          el('p', 'banner-title', 'Accepted — you are confirmed for ' + (post ? routeText(post) : 'a journey') + '.'),
          el('p', 'banner-text', post
            ? 'Departure ' + formatDate(post.date) + ' at ' + post.time + ' · published by ' + post.name
              + (autoCancelled > 0 ? ' · ' + autoCancelled + ' of your other application(s) were automatically cancelled because this journey was confirmed.' : '')
            : 'The journey record is no longer in the snapshot.')
        );
        var bannerActions = el('div', 'banner-actions');
        if (post) {
          bannerActions.appendChild(actionButton('View Confirmed Journey', 'view-details', { 'post-id': post.postId }, 'btn-secondary'));
        }
        bannerActions.appendChild(actionButton('Cancel Confirmed Journey', 'cancel-journey',
          { 'application-id': entry.application.applicationId }, 'btn-danger',
          SJ.rules.canCancelJourney(state, entry.application.applicationId)));
        append(bannerBox, bannerText, bannerActions);
        banner.appendChild(bannerBox);
      });
    } else if (pending > 0) {
      var waitBox = el('div', 'status-banner pending');
      var waitText = el('div', null);
      append(waitText,
        el('p', 'banner-title', pending + ' application' + (pending === 1 ? '' : 's') + ' still waiting for the publisher.'),
        el('p', 'banner-text', pending + ' Pending · 0 Accepted · ' + closed + ' closed or cancelled')
      );
      append(waitBox, waitText);
      banner.appendChild(waitBox);
    } else {
      var calmBox = el('div', 'status-banner neutral');
      var calmText = el('div', null);
      append(calmText,
        el('p', 'banner-title', 'No application is still waiting for an answer.'),
        el('p', 'banner-text', '0 Pending · 0 Accepted · ' + closed + ' closed or cancelled')
      );
      append(calmBox, calmText);
      banner.appendChild(calmBox);
    }

    activity.applications.forEach(function (entry) {
      var application = entry.application;
      var post = entry.post;
      var row = el('div', 'record-row apps');

      row.appendChild(cell('Journey / Publisher',
        valueNode(post ? routeText(post) : 'Journey removed from the snapshot',
          post ? 'Published by ' + post.name + ' · ' + postTypeLabel(post.postType) : ''),
        'optional-cell'));
      row.appendChild(cell('Departure',
        valueNode(post ? formatDate(post.date) : '—', post ? post.time : ''),
        'optional-cell'));

      row.appendChild(cell('Record ID', el('span', 'cell-value record-mono', application.applicationId), 'optional-cell'));

      var statusWrap = el('span', 'cell-value');
      append(statusWrap, el('span', statusClass(application.status), application.status));
      if (application.reason) { append(statusWrap, el('span', 'record-secondary', application.reason)); }
      else { append(statusWrap, el('span', 'record-secondary', 'Applied ' + application.appliedAt + ' · code ' + application.managementCode)); }
      row.appendChild(cell('Application status', statusWrap));

      var actions = el('div', 'record-cell record-actions');
      if (post) {
        actions.appendChild(actionButton('View Journey', 'view-details', { 'post-id': post.postId }, 'btn-secondary'));
      }
      if (application.status === 'Pending') {
        actions.appendChild(actionButton('Withdraw', 'withdraw-application',
          { 'application-id': application.applicationId }, 'btn-secondary',
          SJ.rules.canWithdraw(state, application.applicationId)));
      }
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  function renderReceived(activity) {
    var list = $('received-list');
    clear(list);

    if (!activity.profile) {
      listEmpty(list, 'No person is selected, so there are no received applications to show.');
      return;
    }
    if (activity.posts.length === 0) {
      listEmpty(list, 'You have not published a journey yet, so nothing can be applied to.', 'Post a Journey', 'open-post');
      return;
    }
    if (activity.received.length === 0) {
      listEmpty(list, 'Your published journeys have no applications yet.');
      return;
    }

    var grouped = {};
    activity.received.forEach(function (entry) {
      var key = entry.post.postId;
      if (!grouped[key]) { grouped[key] = { post: entry.post, entries: [] }; }
      grouped[key].entries.push(entry);
    });

    Object.keys(grouped).forEach(function (key) {
      var group = grouped[key];
      var head = el('div', 'group-head');
      var title = el('h3', 'group-title', routeText(group.post) + ' ');
      append(title, el('span', null, '· ' + group.post.postId + ' · ' + formatDate(group.post.date) + ' at ' + group.post.time + ' · ' + group.entries.length + ' application' + (group.entries.length === 1 ? '' : 's')));
      var manage = el('button', 'btn btn-secondary btn-small', 'Open Received Applications');
      manage.type = 'button';
      manage.setAttribute('data-action', 'open-received');
      manage.setAttribute('data-post-id', group.post.postId);
      append(head, title, manage);
      list.appendChild(head);

      group.entries.forEach(function (entry) {
        var application = entry.application;
        var row = el('div', 'record-row received');

        var applicant = el('span', 'cell-value');
        var line = el('span', 'applicant-main');
        append(line, avatar(application.applicantName), el('span', 'record-primary', application.applicantName));
        append(applicant, line);
        row.appendChild(cell('Applicant', applicant, 'optional-cell'));

        var contact = el('span', 'cell-value');
        append(contact,
          el('span', 'record-secondary', application.applicantPhone + ' · ' + application.applicantEmail),
          el('span', 'record-secondary', 'Visible to you because you published this journey.')
        );
        row.appendChild(cell('Contact (publisher view)', contact, 'optional-cell'));

        row.appendChild(cell('Applied', el('span', 'cell-value record-mono', application.appliedAt), 'optional-cell'));

        var statusWrap = el('span', 'cell-value');
        append(statusWrap, el('span', statusClass(application.status), application.status));
        row.appendChild(cell('Status', statusWrap));

        var actions = el('div', 'record-cell record-actions');
        var openBtn = el('button', 'btn btn-secondary btn-small', 'Manage');
        openBtn.type = 'button';
        openBtn.setAttribute('data-action', 'open-received');
        openBtn.setAttribute('data-post-id', entry.post.postId);
        actions.appendChild(openBtn);
        row.appendChild(actions);

        list.appendChild(row);
      });
    });
  }

  function renderActivityTabs(uiState) {
    Array.prototype.forEach.call(document.querySelectorAll('#activity-tabs .tab'), function (tab) {
      var isActive = tab.getAttribute('data-tab') === uiState.activityTab;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
    });
    ['my-posts', 'my-applications', 'received'].forEach(function (name) {
      $(name + '-panel').hidden = name !== uiState.activityTab;
    });
  }

  /* ------------------------------------------------------------------ dialogs */

  function openDialog(id, trigger) {
    var dialog = $(id);
    if (!dialog) { return; }
    focusReturn[id] = trigger || document.activeElement;

    /* Escape and other native close paths bypass closeDialog(), so focus is
       restored from the dialog's own close event as well. */
    if (dialog.getAttribute('data-focus-hooked') !== '1') {
      dialog.setAttribute('data-focus-hooked', '1');
      dialog.addEventListener('close', function () { restoreFocus(id); });
    }

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) { dialog.showModal(); }
    } else {
      dialog.setAttribute('open', 'open');
    }
    var target = dialog.querySelector('[data-autofocus]') || dialog.querySelector('.dialog-header h2') || dialog;
    if (target && typeof target.focus === 'function') {
      target.setAttribute('tabindex', '-1');
      target.focus();
    }
  }

  function restoreFocus(id) {
    var trigger = focusReturn[id];
    delete focusReturn[id];
    if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  function closeDialog(id) {
    var dialog = $(id);
    if (!dialog) { return; }
    if (dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    restoreFocus(id);
  }

  function isOpen(id) {
    var dialog = $(id);
    return !!dialog && dialog.open === true;
  }

  function setDialogError(nodeId, message) {
    var node = $(nodeId);
    if (!message) {
      node.hidden = true;
      node.textContent = '';
      return;
    }
    node.textContent = message;
    node.hidden = false;
  }

  function fieldError(fieldId, message) {
    var input = $(fieldId);
    var error = $(fieldId + '-error');
    if (input) {
      if (message) { input.setAttribute('aria-invalid', 'true'); }
      else { input.removeAttribute('aria-invalid'); }
    }
    if (error) {
      error.textContent = message || '';
      error.hidden = !message;
    }
  }

  /* ----------------------------------------------------------- profile dialog */

  function renderProfileDialog(state, intentKind) {
    var profile = SJ.rules.profileById(state, state.activeProfileId);
    $('profile-name').value = profile ? profile.name : '';
    $('profile-phone').value = profile ? profile.phone : '';
    $('profile-email').value = profile ? profile.email : '';

    var intro = $('profile-dialog-intro');
    var note = $('profile-dialog-note');
    if (intentKind === 'publish') {
      intro.textContent = 'Your details are needed once before a journey can be published. After saving, the Post a Journey form opens with your contact details already filled in.';
      note.textContent = 'Save and Continue stores your details and reopens the post form. Cancel stops the action completely.';
    } else if (intentKind === 'batch-apply') {
      intro.textContent = 'Your details are needed once before applications can be sent. After saving, the selected journeys are applied to in one batch.';
      note.textContent = 'Save and Continue sends the applications you already selected. Cancel sends nothing.';
    } else if (intentKind === 'single-apply') {
      intro.textContent = 'Your details are needed once before you can apply. After saving, this application is sent straight away.';
      note.textContent = 'Save and Continue applies to the journey you opened. Cancel sends nothing.';
    } else {
      intro.textContent = 'We ask for your details once. They are reused for every journey you post and every application you send.';
      note.textContent = 'Saved once, then reused automatically.';
    }

    ['profile-name', 'profile-phone', 'profile-email'].forEach(function (id) {
      fieldError(id, '');
    });
  }

  function renderProfileErrors(errors) {
    ['name', 'phone', 'email'].forEach(function (key) {
      fieldError('profile-' + key, errors[key] || '');
    });
  }

  /* -------------------------------------------------------------- post dialog */

  function renderPostDialog(state) {
    var profile = SJ.rules.profileById(state, state.activeProfileId);
    var contact = $('post-contact');
    clear(contact);

    if (!profile) {
      contact.appendChild(el('p', null, 'No saved contact details yet. Save Your Details first, then post the journey.'));
      return;
    }

    contact.appendChild(el('h3', null, 'Saved contact details (read only)'));
    var rows = el('div', 'contact-rows');
    [['Name', profile.name], ['Phone', profile.phone], ['Email', profile.email]].forEach(function (pair) {
      var item = el('div', 'contact-item');
      append(item, el('span', null, pair[0]), el('strong', null, pair[1] || '—'));
      rows.appendChild(item);
    });
    contact.appendChild(rows);
    contact.appendChild(el('p', 'field-hint', 'These saved details are published with the journey. Everyone who sees the card or the details sees them.'));

    $('post-date').min = SJ.store.todayNZ();
    if (!$('post-date').value) { $('post-date').value = SJ.store.addDaysISO(SJ.store.todayNZ(), 1); }
    if (!$('post-time').value) { $('post-time').value = '09:00'; }
    updateNotesCount();
  }

  function updateNotesCount() {
    $('post-notes-count').textContent = String($('post-notes').value.length);
  }

  function renderPostErrors(errors) {
    ['origin', 'destination', 'date', 'time', 'notes'].forEach(function (key) {
      fieldError('post-' + key, errors[key] || '');
    });
  }

  function postFormIsDirty() {
    return $('post-origin').value.trim() !== '' ||
      $('post-destination').value.trim() !== '' ||
      $('post-notes').value.trim() !== '';
  }

  function resetPostForm() {
    $('post-form').reset();
    $('post-type-driver').checked = true;
    $('post-date').value = SJ.store.addDaysISO(SJ.store.todayNZ(), 1);
    $('post-time').value = '09:00';
    renderPostErrors({});
    setDialogError('post-form-error', '');
    updateNotesCount();
  }

  /* ----------------------------------------------------------- details dialog */

  function renderDetails(state, postId) {
    var post = SJ.rules.postById(state, postId);
    var body = $('details-body');
    clear(body);

    if (!post) {
      body.appendChild(el('p', 'notice notice-error', 'This journey is no longer in the local snapshot.'));
      $('details-apply-btn').disabled = true;
      $('details-note').textContent = '';
      return;
    }

    var selection = SJ.rules.selectionState(state, post.postId);

    var head = el('div', 'card-top');
    append(head, el('span', postTypeClass(post.postType), postTypeLabel(post.postType)), el('span', statusClass(post.status), post.status));
    body.appendChild(head);

    var route = el('div', 'detail-route');
    var from = el('div');
    append(from, el('span', 'detail-label', 'Origin'), el('strong', null, post.origin));
    var to = el('div');
    append(to, el('span', 'detail-label', 'Destination'), el('strong', null, post.destination));
    append(route, from, to);
    body.appendChild(route);

    var grid = el('div', 'detail-grid');
    [['Departure date', formatDate(post.date)],
      ['Departure time', post.time],
      ['Publisher', post.name + ' (' + postTypeLabel(post.postType).toLowerCase() + ')'],
      ['Record ID', post.postId]
    ].forEach(function (pair) {
      var block = el('div', 'detail-block');
      append(block, el('span', 'detail-label', pair[0]), el('span', 'detail-value', pair[1]));
      grid.appendChild(block);
    });
    body.appendChild(grid);

    var contact = el('div', 'contact-card');
    contact.appendChild(el('h3', null, 'Publisher contact details (public)'));
    var rows = el('div', 'contact-rows');
    [['Phone', post.phone], ['Email', post.email]].forEach(function (pair) {
      var item = el('div', 'contact-item');
      append(item, el('span', null, pair[0]), el('strong', null, pair[1] || '—'));
      rows.appendChild(item);
    });
    contact.appendChild(rows);
    contact.appendChild(el('p', 'field-hint', 'These details are shown publicly so travellers can make contact. Your own details stay private until you apply.'));
    body.appendChild(contact);

    var notes = el('div', 'detail-notes');
    append(notes, el('span', 'detail-label', 'Notes'), el('p', null, post.notes || 'No notes were added to this journey.'));
    body.appendChild(notes);

    var info = el('div', 'info-panel');
    info.appendChild(el('h3', null, 'Before you apply'));
    var list = el('ul');
    [
      'Applying only sets your status to Pending — the journey stays public until the publisher decides.',
      'Your name, phone and email are shared with this publisher only.',
      'You need your record ID and management code to reopen this application later.'
    ].forEach(function (line) { list.appendChild(el('li', null, line)); });
    info.appendChild(list);
    if (selection.reason === 'own') {
      var ownActions = el('div', 'banner-actions');
      ownActions.appendChild(actionButton('Open Received Applications', 'open-received', { 'post-id': post.postId }, 'btn-secondary'));
      ownActions.appendChild(actionButton('Cancel Post', 'cancel-post', { 'post-id': post.postId }, 'btn-danger',
        SJ.rules.canCancelPost(state, post.postId)));
      info.appendChild(ownActions);
    }
    body.appendChild(info);

    var applyBtn = $('details-apply-btn');
    var note = $('details-note');
    applyBtn.disabled = !selection.selectable;
    applyBtn.removeAttribute('title');

    if (selection.reason === 'open') {
      applyBtn.textContent = 'Apply for this Journey';
      note.textContent = 'You will get your own record ID and management code straight after applying.';
    } else if (selection.reason === 'own') {
      applyBtn.textContent = 'Your own journey';
      note.textContent = 'You cannot apply to a journey you published yourself. Open Received Applications instead.';
    } else if (selection.reason === 'pending') {
      applyBtn.textContent = 'Application pending';
      note.textContent = 'Your application ' + selection.application.applicationId + ' is still waiting for the publisher. The journey stays visible.';
    } else if (selection.reason === 'accepted') {
      applyBtn.textContent = 'Already accepted';
      note.textContent = 'You already have an accepted application for this journey.';
    } else {
      applyBtn.textContent = 'Not available';
      note.textContent = 'This journey is ' + post.status + ' and cannot be applied to.';
    }
  }

  /* ----------------------------------------------------------- results dialog */

  function renderResults(options) {
    var results = options.results || [];
    var isPost = options.kind === 'post';
    var body = $('results-body');
    clear(body);

    var successCount = results.filter(function (item) { return item.ok; }).length;
    var failureCount = results.length - successCount;

    if (options.error) {
      $('results-dialog-eyebrow').textContent = 'Not saved';
      $('results-dialog-title').textContent = 'Nothing was saved';
      $('results-dialog-intro').textContent = 'The operation was rejected before any record changed, so the numbers below would be misleading.';
      $('results-note').textContent = 'Fix the storage problem and try again — the demo never reports a success it did not store.';
    } else if (isPost) {
      $('results-dialog-eyebrow').textContent = 'Published';
      $('results-dialog-title').textContent = 'Journey published';
      $('results-dialog-intro').textContent = 'This journey is now on the public list. Keep the record ID and management code to manage it later.';
      $('results-note').textContent = 'Use the record ID and management code to reopen this record in this local demo.';
      $('results-view-activity').textContent = 'View My Posts';
      $('results-view-activity').setAttribute('data-tab', 'my-posts');
    } else {
      $('results-dialog-eyebrow').textContent = 'Submitted';
      $('results-dialog-title').textContent = successCount === 1
        ? '1 application submitted'
        : successCount + ' applications submitted';
      $('results-dialog-intro').textContent = failureCount === 0
        ? 'Each application is a separate record with its own record ID and management code. All statuses are Pending until the publisher decides.'
        : failureCount + ' of ' + results.length + ' selected journeys could not be applied to. The reasons are listed with each row.';
      $('results-note').textContent = 'Use the record ID and management code to reopen a record in this local demo.';
      $('results-view-activity').textContent = 'View My Applications';
      $('results-view-activity').setAttribute('data-tab', 'my-applications');
    }

    if (options.error) {
      body.appendChild(el('p', 'notice notice-error', options.error));
    }
    if (options.summary) {
      body.appendChild(el('p', 'results-summary', options.summary));
    }

    results.forEach(function (item) {
      var card = el('div', 'result-card' + (item.ok ? '' : ' is-failed'));
      var head = el('div', 'result-head');
      var post = item.post;
      var title = el('div');
      append(title, el('p', 'result-route', post ? routeText(post) : item.postId));
      if (post) {
        append(title, el('p', 'record-secondary', formatDate(post.date) + ' at ' + post.time + ' · published by ' + post.name));
      }
      head.appendChild(title);

      if (item.ok) {
        head.appendChild(el('span', statusClass(isPost ? post.status : item.application.status), isPost ? post.status : item.application.status));
      } else {
        head.appendChild(el('span', 'badge badge-declined', 'Not submitted'));
      }
      card.appendChild(head);

      if (item.ok) {
        var recordId = isPost ? post.postId : item.application.applicationId;
        var code = isPost ? post.managementCode : item.application.managementCode;

        var credentials = el('div', 'result-credentials');
        var idBlock = el('div', 'credential');
        append(idBlock, el('span', null, 'Record ID'), el('strong', null, recordId));
        var codeBlock = el('div', 'credential');
        append(codeBlock, el('span', null, 'Management Code'), el('strong', null, code));
        append(credentials, idBlock, codeBlock);

        var actions = el('div', 'result-actions');
        var copy = el('button', 'btn btn-secondary btn-small', 'Copy');
        copy.type = 'button';
        copy.setAttribute('data-action', 'copy-record');
        copy.setAttribute('data-copy', 'Record ID: ' + recordId + ' | Management Code: ' + code);
        actions.appendChild(copy);
        append(credentials, actions);
        card.appendChild(credentials);
      } else {
        card.appendChild(el('p', 'field-error', item.error || 'This application could not be submitted.'));
      }

      body.appendChild(card);
    });
  }

  /* ---------------------------------------------------------- received dialog */

  function renderReceivedDialog(state, postId) {
    var body = $('received-body');
    clear(body);

    var post = SJ.rules.postById(state, postId);
    if (!post) {
      body.appendChild(el('p', 'notice notice-error', 'This journey is no longer in the local snapshot.'));
      return;
    }

    var profile = SJ.rules.profileById(state, state.activeProfileId);
    var isOwner = !!profile && post.ownerProfileId === profile.profileId;

    if (!isOwner) {
      body.appendChild(el('p', 'notice notice-warning', 'Only the publisher of this journey can process its applications. Switch to ' + post.name + ' with the demo identity control to try it.'));
      return;
    }

    var applications = SJ.rules.applicationsOfPost(state, post.postId);

    var summary = el('div', 'record-summary');
    var head = el('div', 'record-summary-head');
    var headText = el('div');
    append(headText,
      el('p', 'result-route', routeText(post)),
      el('p', 'record-secondary', formatDate(post.date) + ' at ' + post.time + ' · ' + post.postId)
    );
    var headActions = el('div', 'banner-actions');
    headActions.appendChild(el('span', statusClass(post.status), post.status));
    headActions.appendChild(actionButton('Cancel Post', 'cancel-post', { 'post-id': post.postId }, 'btn-danger',
      SJ.rules.canCancelPost(state, post.postId)));
    append(head, headText, headActions);
    summary.appendChild(head);

    var summaryBody = el('div', 'record-summary-body');
    var rows = el('div', 'contact-rows');
    [['Your published phone', post.phone], ['Your published email', post.email], ['Management code', post.managementCode]].forEach(function (pair) {
      var item = el('div', 'contact-item');
      append(item, el('span', null, pair[0]), el('strong', null, pair[1] || '—'));
      rows.appendChild(item);
    });
    summaryBody.appendChild(rows);
    summaryBody.appendChild(el('p', 'field-hint', 'Published notes: ' + (post.notes || 'none')));
    summary.appendChild(summaryBody);
    body.appendChild(summary);

    if (applications.length === 0) {
      body.appendChild(el('p', 'list-empty', 'No one has applied to this journey yet.'));
    } else {
      applications.forEach(function (application) {
        var row = el('div', 'applicant-row');
        var main = el('div', 'applicant-main');
        var text = el('span', 'publisher-text');
        append(text,
          el('strong', null, application.applicantName + ' · ' + application.applicationId),
          el('span', null, application.applicantPhone + ' · ' + application.applicantEmail),
          el('span', null, 'Applied ' + application.appliedAt + (application.reason ? ' · ' + application.reason : ''))
        );
        append(main, avatar(application.applicantName), text);
        row.appendChild(main);

        var actions = el('div', 'applicant-actions');
        actions.appendChild(el('span', statusClass(application.status), application.status));

        if (application.status === 'Pending') {
          actions.appendChild(actionButton('Accept', 'accept-application',
            { 'application-id': application.applicationId }, 'btn-primary',
            SJ.rules.canAccept(state, application.applicationId)));
          actions.appendChild(actionButton('Decline', 'decline-application',
            { 'application-id': application.applicationId }, 'btn-secondary',
            SJ.rules.canDecline(state, application.applicationId)));
        }
        row.appendChild(actions);
        body.appendChild(row);
      });
    }

    var note = $('received-note');
    note.textContent = post.status === 'Confirmed'
      ? 'This journey is confirmed. Other applicants were marked Not Selected, and the accepted traveller\'s other pending applications were cancelled automatically.'
      : 'Accepting one applicant confirms this journey, hides it from Browse, marks the other applicants Not Selected and automatically cancels the accepted traveller\'s other pending applications — in one save.';
  }

  /* ------------------------------------------------------------ manage dialog */

  function renderManageResult(state, result) {
    var box = $('manage-result');
    clear(box);

    if (!result) { return; }

    if (!result.ok) {
      setDialogError('manage-error', result.error);
      return;
    }
    setDialogError('manage-error', '');

    var record = result.record;
    var summary = el('div', 'record-summary');
    var head = el('div', 'record-summary-head');
    var headText = el('div');
    var headActions = el('div', 'banner-actions');
    var body = el('div', 'record-summary-body');
    var grid = el('div', 'detail-grid');

    if (result.kind === 'post') {
      append(headText,
        el('p', 'result-route', routeText(record)),
        el('p', 'record-secondary', 'Journey record · ' + record.postId + ' · ' + formatDate(record.date) + ' at ' + record.time)
      );
      append(headActions, el('span', statusClass(record.status), record.status));
      var received = SJ.rules.applicationsOfPost(state, record.postId);
      if (received.length > 0) {
        headActions.appendChild(actionButton('Received Applications', 'open-received',
          { 'post-id': record.postId }, 'btn-secondary'));
      }
      headActions.appendChild(actionButton('Cancel Post', 'cancel-post', { 'post-id': record.postId }, 'btn-danger',
        SJ.rules.canCancelPost(state, record.postId)));

      [['Publisher', record.name + ' (' + postTypeLabel(record.postType).toLowerCase() + ')'],
        ['Contact', record.phone + ' · ' + record.email],
        ['Management code', record.managementCode],
        ['Applications', received.length === 0 ? 'none yet' : received.length + ' (' + received.map(function (application) {
          return application.applicationId + ' ' + application.status;
        }).join(', ') + ')'],
        ['Notes', record.notes || 'none']
      ].forEach(function (pair) {
        var block = el('div', 'detail-block');
        append(block, el('span', 'detail-label', pair[0]), el('span', 'detail-value', pair[1]));
        grid.appendChild(block);
      });
      body.appendChild(grid);
      body.appendChild(el('p', 'field-hint', 'Management code verified in this browser. '
        + 'Cancelling a post hides it from Browse and cancels its live applications; finished records keep their history.'));
    } else {
      append(headText,
        el('p', 'result-route', 'Application ' + record.applicationId),
        el('p', 'record-secondary', 'Applied ' + record.appliedAt + ' to ' + record.postId)
      );
      append(headActions, el('span', statusClass(record.status), record.status));
      if (SJ.rules.postById(state, record.postId)) {
        headActions.appendChild(actionButton('View Journey', 'view-details', { 'post-id': record.postId }, 'btn-secondary'));
      }
      if (record.status === 'Pending') {
        headActions.appendChild(actionButton('Withdraw', 'withdraw-application',
          { 'application-id': record.applicationId }, 'btn-secondary', SJ.rules.canWithdraw(state, record.applicationId)));
      } else if (record.status === 'Accepted') {
        headActions.appendChild(actionButton('Cancel Confirmed Journey', 'cancel-journey',
          { 'application-id': record.applicationId }, 'btn-danger', SJ.rules.canCancelJourney(state, record.applicationId)));
      }

      [['Applicant', record.applicantName],
        ['Contact', record.applicantPhone + ' · ' + record.applicantEmail],
        ['Management code', record.managementCode],
        ['Reason', record.reason || 'none']
      ].forEach(function (pair) {
        var block = el('div', 'detail-block');
        append(block, el('span', 'detail-label', pair[0]), el('span', 'detail-value', pair[1]));
        grid.appendChild(block);
      });
      body.appendChild(grid);
      body.appendChild(el('p', 'field-hint', 'Management code verified in this browser. Withdrawing only changes this record; '
        + 'cancelling a confirmed journey reopens the publisher\'s journey while it has not departed.'));
    }

    append(head, headText, headActions);
    append(summary, head, body);
    box.appendChild(summary);
  }

  function resetManageDialog() {
    $('manage-record-id').value = '';
    $('manage-code').value = '';
    setDialogError('manage-error', '');
    clear($('manage-result'));
  }

  /* --------------------------------------------------------------- feedback */

  function toast(message, tone) {
    var region = $('toast-region');
    var node = el('div', 'toast' + (tone ? ' is-' + tone : ''), message);
    region.appendChild(node);
    window.setTimeout(function () {
      if (node.parentNode) { node.parentNode.removeChild(node); }
    }, 4200);
  }

  function renderSeedNotice(source, extraMessage, tone) {
    var node = $('seed-notice');
    var messages = [];
    if (source === 'embedded') {
      messages.push('The seed table data/posts_seed.csv could not be fetched (this happens when the page is opened directly from a file), '
        + 'so the identical embedded copy was used. Serve the folder over http:// (for example with Live Server) for the normal path.');
    }
    if (extraMessage) {
      messages.push(extraMessage);
    }
    if (messages.length === 0) {
      node.hidden = true;
      node.textContent = '';
      return;
    }
    node.className = 'notice ' + (tone === 'error' ? 'notice-error' : (tone === 'info' ? 'notice-info' : 'notice-warning'));
    node.textContent = messages.join(' ');
    node.hidden = false;
  }

  function confirmAsk(options) {
    return new Promise(function (resolve) {
      var dialog = $('confirm-dialog');
      $('confirm-title').textContent = options.title || 'Are you sure?';
      $('confirm-message').textContent = options.message || '';
      $('confirm-note').textContent = options.note || '';
      $('confirm-ok-btn').textContent = options.confirmLabel || 'Confirm';
      $('confirm-cancel-btn').textContent = options.cancelLabel || 'Cancel';
      $('confirm-ok-btn').className = 'btn ' + (options.danger === false ? 'btn-primary' : 'btn-danger-solid');

      var settled = false;
      function finish(value) {
        if (settled) { return; }
        settled = true;
        $('confirm-ok-btn').removeEventListener('click', onOk);
        $('confirm-cancel-btn').removeEventListener('click', onCancel);
        dialog.removeEventListener('close', onClose);
        if (dialog.open) { closeDialog('confirm-dialog'); }
        resolve(value);
      }
      function onOk() { finish(true); }
      function onCancel() { finish(false); }
      function onClose() { finish(false); }

      $('confirm-ok-btn').addEventListener('click', onOk);
      $('confirm-cancel-btn').addEventListener('click', onCancel);
      dialog.addEventListener('close', onClose);
      openDialog('confirm-dialog', options.trigger);
    });
  }

  function render(state, uiState, options) {
    renderHeader(state, options);
    renderCities(state);
    renderBrowse(state, uiState);
    renderSelectionBar(state, uiState);
    renderShortcut(state);
    renderActivity(state, uiState);
    renderActivityTabs(uiState);
  }

  return {
    render: render,
    renderBrowse: renderBrowse,
    renderSelectionBar: renderSelectionBar,
    renderSelectionError: renderSelectionError,
    renderActivity: renderActivity,
    renderActivityTabs: renderActivityTabs,
    renderShortcut: renderShortcut,
    renderSeedNotice: renderSeedNotice,

    openDialog: openDialog,
    closeDialog: closeDialog,
    isOpen: isOpen,
    setDialogError: setDialogError,
    fieldError: fieldError,

    renderProfileDialog: renderProfileDialog,
    renderProfileErrors: renderProfileErrors,
    renderPostDialog: renderPostDialog,
    renderPostErrors: renderPostErrors,
    resetPostForm: resetPostForm,
    postFormIsDirty: postFormIsDirty,
    updateNotesCount: updateNotesCount,
    renderDetails: renderDetails,
    renderResults: renderResults,
    renderReceivedDialog: renderReceivedDialog,
    renderManageResult: renderManageResult,
    resetManageDialog: resetManageDialog,

    toast: toast,
    confirmAsk: confirmAsk,

    helpers: {
      el: el,
      append: append,
      clear: clear,
      formatDate: formatDate,
      initial: initial,
      avatar: avatar,
      postTypeLabel: postTypeLabel,
      postTypeClass: postTypeClass,
      statusClass: statusClass,
      routeText: routeText,
      departurePhrase: departurePhrase
    }
  };
}());
