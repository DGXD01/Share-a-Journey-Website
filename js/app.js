/* ==========================================================================
   Share-a-Journey — js/app.js
   Event wiring and initialization. Handlers read input, call the pure rules,
   commit the returned state once, then ask ui.js to render. A business button
   never writes state directly from the DOM.
   ========================================================================== */

window.SJ = window.SJ || {};

SJ.app = (function () {
  'use strict';

  var uiState = {
    view: 'browse',
    activityTab: 'my-posts',
    filters: { origin: '', destination: '', date: '', postType: '' },
    appliedFilters: { origin: '', destination: '', date: '', postType: '' },
    selectedPostIds: new Set(),
    pendingIntent: null,
    currentDetailsPostId: null
  };

  var isDemoMode = false;
  var personas = [];
  var busy = false;

  function $(id) { return document.getElementById(id); }

  function currentState() { return SJ.store.getState(); }

  function renderAll() {
    SJ.ui.render(currentState(), uiState, { showDemoTools: isDemoMode, personas: personas });
  }

  function renderBrowseAndSelection() {
    var state = currentState();
    SJ.ui.renderBrowse(state, uiState);
    SJ.ui.renderSelectionBar(state, uiState);
    SJ.ui.renderShortcut(state);
  }

  /* ------------------------------------------------------------- view switch */

  function switchView(view) {
    uiState.view = view;
    var onBrowse = view === 'browse';
    $('browse-shell').hidden = !onBrowse;
    $('browse-view').hidden = !onBrowse;
    $('activity-view').hidden = onBrowse;
    $('nav-browse').setAttribute('aria-current', onBrowse ? 'page' : 'false');
    $('nav-activity').setAttribute('aria-current', onBrowse ? 'false' : 'page');
    if (!onBrowse) {
      renderAll();
      $('activity-tabs').querySelector('.tab[aria-selected="true"]').focus();
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function switchActivityTab(name) {
    uiState.activityTab = name;
    SJ.ui.renderActivityTabs(uiState);
  }

  /* ------------------------------------------------------------------ filters */

  function readFilterForm() {
    return {
      origin: $('origin-filter').value.trim(),
      destination: $('destination-filter').value.trim(),
      date: $('date-filter').value,
      postType: $('type-filter').value
    };
  }

  function sameFilters(a, b) {
    return a.origin === b.origin && a.destination === b.destination &&
      a.date === b.date && a.postType === b.postType;
  }

  function writeFilterForm(filters) {
    $('origin-filter').value = filters.origin;
    $('destination-filter').value = filters.destination;
    $('date-filter').value = filters.date;
    $('type-filter').value = filters.postType;
  }

  function applyFilters() {
    var typed = readFilterForm();
    var changed = !sameFilters(typed, uiState.appliedFilters);

    uiState.filters = typed;
    uiState.appliedFilters = typed;

    if (changed && uiState.selectedPostIds.size > 0) {
      uiState.selectedPostIds.clear();
      SJ.ui.toast('Selection cleared because the filters changed.', 'warning');
    }
    SJ.ui.renderSelectionError('');
    renderBrowseAndSelection();
  }

  function clearFilters(announce) {
    var empty = { origin: '', destination: '', date: '', postType: '' };
    uiState.filters = empty;
    uiState.appliedFilters = empty;
    uiState.selectedPostIds.clear();
    writeFilterForm(empty);
    SJ.ui.renderSelectionError('');
    renderBrowseAndSelection();
    if (announce) { SJ.ui.toast('Filters cleared. Showing every open journey.'); }
  }

  /* ----------------------------------------------------------------- selection */

  function selectionTypes() {
    var types = {};
    uiState.selectedPostIds.forEach(function (postId) {
      var post = SJ.rules.postById(currentState(), postId);
      if (post) { types[post.postType] = true; }
    });
    return Object.keys(types);
  }

  function handleSelectToggle(checkbox) {
    var postId = checkbox.getAttribute('data-post-id');
    var state = currentState();
    var post = SJ.rules.postById(state, postId);

    if (!post) {
      checkbox.checked = false;
      SJ.ui.renderSelectionError('That journey is no longer in the local snapshot.');
      return;
    }

    if (!checkbox.checked) {
      uiState.selectedPostIds.delete(post.postId);
      SJ.ui.renderSelectionError('');
      renderBrowseAndSelection();
      return;
    }

    var selection = SJ.rules.selectionState(state, post.postId);
    if (!selection.selectable) {
      checkbox.checked = false;
      SJ.ui.renderSelectionError('That journey cannot be selected (' + (selection.label || selection.reason) + ').');
      renderBrowseAndSelection();
      return;
    }

    var types = selectionTypes();
    if (types.length === 1 && types[0] !== post.postType) {
      checkbox.checked = false;
      SJ.ui.renderSelectionError('A batch can only contain one post type. You already selected '
        + SJ.ui.helpers.postTypeLabel(types[0]) + ' journeys, so clear the selection before choosing a '
        + SJ.ui.helpers.postTypeLabel(post.postType) + ' journey.');
      SJ.ui.toast('Mixed post types cannot be applied to in one batch.', 'warning');
      return;
    }

    uiState.selectedPostIds.add(post.postId);
    SJ.ui.renderSelectionError('');
    renderBrowseAndSelection();
  }

  /* -------------------------------------------------------------- profile flow */

  function profileIsReady(state) {
    return SJ.rules.profileIsComplete(SJ.rules.profileById(state, state.activeProfileId));
  }

  function openProfileDialog(intentKind, trigger) {
    SJ.ui.renderProfileDialog(currentState(), intentKind);
    SJ.ui.openDialog('profile-dialog', trigger);
    $('profile-name').focus();
  }

  function startPublishIntent(trigger) {
    if (!profileIsReady(currentState())) {
      uiState.pendingIntent = { kind: 'publish', payload: {} };
      openProfileDialog('publish', trigger);
      return;
    }
    openPostDialog(trigger);
  }

  function startApplyIntent(postIds, trigger) {
    var kind = postIds.length > 1 ? 'batch-apply' : 'single-apply';
    if (!profileIsReady(currentState())) {
      uiState.pendingIntent = { kind: kind, payload: { postIds: postIds } };
      openProfileDialog(kind, trigger);
      return;
    }
    performApply(postIds);
  }

  function resumePendingIntent() {
    var intent = uiState.pendingIntent;
    uiState.pendingIntent = null;
    if (!intent) {
      renderAll();
      return;
    }
    if (intent.kind === 'publish') {
      openPostDialog($('post-journey-btn'));
      return;
    }
    performApply(intent.payload.postIds);
  }

  function openPostDialog(trigger) {
    SJ.ui.resetPostForm();
    SJ.ui.renderPostDialog(currentState());
    SJ.ui.openDialog('post-dialog', trigger && trigger.focus ? trigger : $('post-journey-btn'));
    $('post-origin').focus();
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    if (busy) { return; }

    var input = {
      name: $('profile-name').value,
      phone: $('profile-phone').value,
      email: $('profile-email').value
    };

    var result;
    var commit;
    busy = true;
    try {
      result = SJ.rules.saveProfileAndResume(currentState(), input);
      if (result.ok) { commit = SJ.store.commitState(result.state); }
    } finally {
      /* Released before the pending action resumes: the resume path runs
         through performApply, which has its own re-entrancy guard. */
      busy = false;
    }

    if (!result.ok) {
      SJ.ui.renderProfileErrors(result.errors || {});
      SJ.ui.setDialogError('profile-form-error', result.error || '');
      return;
    }
    if (!commit.ok) {
      SJ.ui.setDialogError('profile-form-error', commit.error);
      return;
    }

    SJ.ui.setDialogError('profile-form-error', '');
    SJ.ui.closeDialog('profile-dialog');
    SJ.ui.toast('Your details were saved in this browser.');
    renderAll();
    resumePendingIntent();
  }

  /* ------------------------------------------------------------------ publish */

  function handlePostSubmit(event) {
    event.preventDefault();
    if (busy) { return; }
    busy = true;
    try {
      var result = SJ.rules.createPost(currentState(), {
        postType: $('post-type-passenger').checked ? 'passenger' : 'driver',
        origin: $('post-origin').value,
        destination: $('post-destination').value,
        date: $('post-date').value,
        time: $('post-time').value,
        notes: $('post-notes').value
      });

      if (!result.ok) {
        if (result.needsProfile) {
          uiState.pendingIntent = { kind: 'publish', payload: {} };
          SJ.ui.closeDialog('post-dialog');
          openProfileDialog('publish', $('post-journey-btn'));
          return;
        }
        SJ.ui.renderPostErrors(result.errors || {});
        SJ.ui.setDialogError('post-form-error', result.error || '');
        return;
      }

      var commit = SJ.store.commitState(result.state);
      if (!commit.ok) {
        SJ.ui.setDialogError('post-form-error', commit.error);
        return;
      }

      SJ.ui.closeDialog('post-dialog');
      SJ.ui.resetPostForm();
      renderAll();

      SJ.ui.renderResults({
        kind: 'post',
        summary: 'Published to the local board. Refreshing the page keeps it, because the snapshot lives in this browser.',
        results: [{ ok: true, post: result.post }]
      });
      SJ.ui.openDialog('results-dialog', $('post-journey-btn'));
    } finally {
      busy = false;
    }
  }

  /* -------------------------------------------------------------------- apply */

  function performApply(postIds) {
    if (busy) { return; }
    busy = true;
    try {
      var result = SJ.rules.applyToPosts(currentState(), { postIds: postIds });

      if (!result.ok && result.needsProfile) {
        uiState.pendingIntent = { kind: postIds.length > 1 ? 'batch-apply' : 'single-apply', payload: { postIds: postIds } };
        openProfileDialog(uiState.pendingIntent.kind, $('details-apply-btn'));
        return;
      }

      if (!result.ok && !result.results) {
        SJ.ui.toast(result.error, 'error');
        return;
      }

      if (result.ok) {
        var commit = SJ.store.commitState(result.state);
        if (!commit.ok) {
          SJ.ui.renderResults({
            kind: 'applications',
            error: commit.error,
            summary: 'Nothing was saved, so no application was created.',
            results: []
          });
          SJ.ui.openDialog('results-dialog', $('details-apply-btn'));
          return;
        }
        uiState.selectedPostIds.clear();
        SJ.ui.closeDialog('details-dialog');
        SJ.ui.renderSelectionError('');
        renderAll();
      } else {
        renderAll();
      }

      var successCount = result.results.filter(function (item) { return item.ok; }).length;
      var failureCount = result.results.length - successCount;
      var summary = successCount === 0
        ? 'No application was created. Each selected journey is shown below with the reason.'
        : successCount + ' application' + (successCount === 1 ? '' : 's') + ' created'
          + (failureCount > 0 ? ' and ' + failureCount + ' not submitted.' : '.')
          + ' Every application keeps its own record ID and management code.';

      SJ.ui.renderResults({ kind: 'applications', summary: summary, results: result.results });
      SJ.ui.openDialog('results-dialog', $('details-apply-btn'));
    } finally {
      busy = false;
    }
  }

  /* ------------------------------------------------------- details and dialogs */

  function openDetails(postId, trigger) {
    uiState.currentDetailsPostId = postId;
    SJ.ui.renderDetails(currentState(), postId);
    SJ.ui.openDialog('details-dialog', trigger);
    $('details-dialog').querySelector('.dialog-header h2').focus();
  }

  function openReceived(postId, trigger) {
    SJ.ui.renderReceivedDialog(currentState(), postId);
    SJ.ui.openDialog('received-dialog', trigger);
  }

  function requestClose(dialogId) {
    if (dialogId === 'post-dialog') {
      if (SJ.ui.postFormIsDirty()) {
        SJ.ui.confirmAsk({
          title: 'Discard this draft?',
          message: 'This journey has not been published. Closing the dialog now discards everything you typed.',
          note: 'Nothing has been saved yet.',
          confirmLabel: 'Discard draft',
          cancelLabel: 'Keep editing'
        }).then(function (discard) {
          if (discard) {
            SJ.ui.resetPostForm();
            SJ.ui.closeDialog('post-dialog');
          } else {
            $('post-origin').focus();
          }
        });
        return;
      }
      SJ.ui.resetPostForm();
      SJ.ui.closeDialog('post-dialog');
      return;
    }

    if (dialogId === 'profile-dialog') {
      var hadIntent = !!uiState.pendingIntent;
      uiState.pendingIntent = null;
      SJ.ui.closeDialog('profile-dialog');
      if (hadIntent) { SJ.ui.toast('Cancelled — nothing was saved and no application was sent.', 'warning'); }
      return;
    }

    if (dialogId === 'manage-dialog') {
      SJ.ui.resetManageDialog();
    }

    SJ.ui.closeDialog(dialogId);
  }

  /* --------------------------------------------------------------- copy helper */

  function copyToClipboard(text, button) {
    var original = button.textContent;

    function succeeded() {
      button.textContent = 'Copied';
      button.disabled = true;
      window.setTimeout(function () {
        button.textContent = original;
        button.disabled = false;
      }, 1600);
    }
    function failed() {
      button.textContent = 'Copy failed';
      SJ.ui.toast('Copying is not available in this browser. Select the code manually.', 'error');
      window.setTimeout(function () { button.textContent = original; }, 2000);
    }
    function legacyCopy() {
      try {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.top = '-1000px';
        document.body.appendChild(area);
        area.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (ok) { succeeded(); } else { failed(); }
      } catch (err) {
        failed();
      }
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(succeeded, legacyCopy);
    } else {
      legacyCopy();
    }
  }

  /* -------------------------------------------------------------- demo controls */

  function applyDemoDefaultPerson(reason) {
    var state = currentState();
    if (state.activeProfileId) { return; }
    var alex = SJ.store.personas().filter(function (person) { return person.alias === 'alex'; })[0];
    if (!alex) { return; }
    var result = SJ.rules.switchPerson(state, alex.profileId);
    if (!result.ok) { return; }
    var commit = SJ.store.commitState(result.state);
    if (!commit.ok) {
      SJ.ui.toast(commit.error, 'error');
      return;
    }
    if (reason) { SJ.ui.toast(reason); }
  }

  function handlePersonSwitch(profileId) {
    var result = SJ.rules.switchPerson(currentState(), profileId);
    if (!result.ok) {
      SJ.ui.toast(result.error, 'error');
      return;
    }
    var commit = SJ.store.commitState(result.state);
    if (!commit.ok) {
      SJ.ui.toast(commit.error, 'error');
      return;
    }
    uiState.selectedPostIds.clear();
    SJ.ui.renderSelectionError('');
    renderAll();
    SJ.ui.toast(profileId
      ? 'Now browsing as ' + result.profile.name + '.'
      : 'Identity cleared. Your details will be asked for on the next action.');
  }

  function handleReset() {
    SJ.ui.confirmAsk({
      title: 'Reset the demo data?',
      message: 'Every journey, application and management code created in this browser is replaced by the original six seed journeys. This cannot be undone.',
      note: 'The seed dates are recalculated so nothing starts in the past.',
      confirmLabel: 'Reset Demo Data',
      cancelLabel: 'Keep my data'
    }).then(function (confirmed) {
      if (!confirmed) { return; }
      SJ.store.resetDemoData().then(function (result) {
        if (!result.ok) {
          SJ.ui.toast(result.error, 'error');
          return;
        }
        uiState.selectedPostIds.clear();
        uiState.pendingIntent = null;
        uiState.currentDetailsPostId = null;
        uiState.activityTab = 'my-posts';
        clearFilters(false);
        if (isDemoMode) { applyDemoDefaultPerson(null); }
        renderAll();
        SJ.ui.renderSeedNotice(SJ.store.seedSource(), '');
        SJ.ui.toast('Demo data reset to the six seed journeys.', 'success');
      });
    });
  }

  /* ------------------------------------------------------------------ refresh */

  function handleRefreshStatus() {
    var reloaded = SJ.store.reload();
    if (!reloaded.ok) {
      SJ.ui.toast(reloaded.error, 'error');
      return;
    }
    var expired = SJ.rules.expireRecords(currentState());
    if (expired.changed) {
      var commit = SJ.store.commitState(expired.state);
      if (!commit.ok) {
        SJ.ui.toast(commit.error, 'error');
        return;
      }
    }
    renderAll();
    SJ.ui.toast('Status re-read from this browser\'s local storage'
      + (expired.changed ? ' — ' + expired.postsExpired + ' journey(s) passed their departure time.' : '.')
      + ' No server was contacted.', 'success');
  }

  /* --------------------------------------------------------------- event wiring */

  function wireHeader() {
    $('nav-browse').addEventListener('click', function () { switchView('browse'); });
    $('nav-activity').addEventListener('click', function () { switchView('activity'); });
    $('nav-help').addEventListener('click', function () {
      SJ.ui.openDialog('help-dialog', $('nav-help'));
      $('help-dialog').querySelector('.dialog-header h2').focus();
    });
    $('nav-manage').addEventListener('click', function () {
      SJ.ui.resetManageDialog();
      SJ.ui.openDialog('manage-dialog', $('nav-manage'));
      $('manage-record-id').focus();
    });

    $('brand-home').addEventListener('click', function (event) {
      event.preventDefault();
      switchView('browse');
    });

    $('post-journey-btn').addEventListener('click', function () { startPublishIntent($('post-journey-btn')); });
    $('activity-post-btn').addEventListener('click', function () { startPublishIntent($('activity-post-btn')); });
    $('empty-post-btn').addEventListener('click', function () { startPublishIntent($('empty-post-btn')); });
    $('open-activity-btn').addEventListener('click', function () { switchView('activity'); });
    $('activity-shortcut').addEventListener('click', function (event) {
      if (event.target === $('activity-shortcut')) { switchView('activity'); }
    });

    $('demo-person-select').addEventListener('change', function (event) {
      handlePersonSwitch(event.target.value);
    });
    $('demo-reset-btn').addEventListener('click', handleReset);
  }

  function wireFilters() {
    $('filter-form').addEventListener('submit', function (event) {
      event.preventDefault();
      applyFilters();
    });
    $('clear-filters-btn').addEventListener('click', function () { clearFilters(true); });
    $('empty-clear-btn').addEventListener('click', function () { clearFilters(true); });
  }

  function wireSelection() {
    $('clear-selection-btn').addEventListener('click', function () {
      uiState.selectedPostIds.clear();
      SJ.ui.renderSelectionError('');
      renderBrowseAndSelection();
    });
    $('apply-selected-btn').addEventListener('click', function () {
      var postIds = Array.from(uiState.selectedPostIds);
      if (postIds.length === 0) {
        SJ.ui.renderSelectionError('Select at least one journey first.');
        return;
      }
      startApplyIntent(postIds, $('apply-selected-btn'));
    });
  }

  function wireActivity() {
    $('refresh-status-btn').addEventListener('click', handleRefreshStatus);

    $('activity-tabs').addEventListener('click', function (event) {
      var tab = event.target.closest('.tab');
      if (tab) { switchActivityTab(tab.getAttribute('data-tab')); }
    });

    $('activity-tabs').addEventListener('keydown', function (event) {
      var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (keys.indexOf(event.key) === -1) { return; }
      event.preventDefault();
      var tabs = Array.prototype.slice.call($('activity-tabs').querySelectorAll('.tab'));
      var index = tabs.indexOf(document.activeElement);
      if (index === -1) { index = 0; }
      if (event.key === 'ArrowRight') { index = (index + 1) % tabs.length; }
      if (event.key === 'ArrowLeft') { index = (index - 1 + tabs.length) % tabs.length; }
      if (event.key === 'Home') { index = 0; }
      if (event.key === 'End') { index = tabs.length - 1; }
      switchActivityTab(tabs[index].getAttribute('data-tab'));
      tabs[index].focus();
    });
  }

  function wireDialogs() {
    document.addEventListener('click', function (event) {
      var closeBtn = event.target.closest('[data-close-dialog]');
      if (closeBtn) {
        event.preventDefault();
        var dialog = closeBtn.closest('dialog');
        if (dialog) { requestClose(dialog.id); }
        return;
      }

      var actionNode = event.target.closest('[data-action]');
      if (!actionNode || actionNode.tagName === 'INPUT') { return; }

      var action = actionNode.getAttribute('data-action');
      if (action === 'view-details') {
        openDetails(actionNode.getAttribute('data-post-id'), actionNode);
      } else if (action === 'open-received') {
        openReceived(actionNode.getAttribute('data-post-id'), actionNode);
      } else if (action === 'open-post') {
        startPublishIntent(actionNode);
      } else if (action === 'open-browse') {
        switchView('browse');
      } else if (action === 'copy-record') {
        copyToClipboard(actionNode.getAttribute('data-copy') || '', actionNode);
      }
    });

    document.addEventListener('change', function (event) {
      var node = event.target;
      if (node && node.getAttribute && node.getAttribute('data-action') === 'toggle-select') {
        handleSelectToggle(node);
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('dialog.dialog'), function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) { requestClose(dialog.id); }
      });
      dialog.addEventListener('cancel', function (event) {
        if (dialog.id === 'post-dialog' || dialog.id === 'profile-dialog') {
          event.preventDefault();
          requestClose(dialog.id);
        }
      });
    });

    $('profile-form').addEventListener('submit', handleProfileSubmit);
    $('post-form').addEventListener('submit', handlePostSubmit);
    $('post-notes').addEventListener('input', SJ.ui.updateNotesCount);

    $('details-apply-btn').addEventListener('click', function () {
      var postId = uiState.currentDetailsPostId;
      if (!postId) { return; }
      startApplyIntent([postId], $('details-apply-btn'));
    });

    $('results-view-activity').addEventListener('click', function () {
      var tab = $('results-view-activity').getAttribute('data-tab') || 'my-applications';
      SJ.ui.closeDialog('results-dialog');
      uiState.activityTab = tab;
      switchView('activity');
    });

    $('manage-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var result = SJ.rules.verifyManagementCode(
        currentState(),
        $('manage-record-id').value,
        $('manage-code').value
      );
      SJ.ui.renderManageResult(result);
      if (result.ok) {
        SJ.ui.toast('Management code verified in this browser.', 'success');
      }
    });
  }

  /* --------------------------------------------------------------------- boot */

  function boot() {
    isDemoMode = new URLSearchParams(window.location.search).get('demo') === '1';
    personas = SJ.store.personas();
    $('demo-tools').hidden = !isDemoMode;

    SJ.store.init().then(function (result) {
      if (!result.ok) {
        SJ.ui.renderSeedNotice(null, 'The demo data could not be initialised, so the page stays empty: ' + result.error, 'error');
        $('journey-grid').hidden = true;
        $('empty-state').hidden = true;
        $('browse-hint').hidden = true;
        SJ.ui.toast(result.error, 'error');
        return;
      }

      if (isDemoMode) { applyDemoDefaultPerson(null); }

      var expired = SJ.rules.expireRecords(currentState());
      if (expired.changed) {
        SJ.store.commitState(expired.state);
        window.setTimeout(function () {
          SJ.ui.toast(expired.postsExpired + ' journey(s) had already departed and were marked Expired.', 'warning');
        }, 400);
      }

      var persistenceMessage = SJ.store.persistenceError() || (SJ.store.storageAvailable() ? '' : 'This browser blocks local storage, so nothing can be saved between refreshes.');
      SJ.ui.renderSeedNotice(SJ.store.seedSource(), persistenceMessage, 'warning');

      wireHeader();
      wireFilters();
      wireSelection();
      wireActivity();
      wireDialogs();

      renderAll();
      switchView('browse');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    uiState: uiState,
    isDemoMode: function () { return isDemoMode; },
    switchView: switchView,
    renderAll: renderAll
  };
}());
