/*
 * Lucid Sentence engine host: boots sdkjs for one document and hands the app
 * (the parent page, same origin) a handle to it. A new document gets a fresh
 * iframe, so sdkjs state never leaks between documents.
 *
 * Copyright (C) 2026 Lucid Systems and the Lucid Sentence contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/* global Asc */
(function () {
  'use strict';

  /**
   * boot({ bin, images, title, register, locale }) -> Promise<api>
   *   bin:      Uint8Array "DOCY" binary from x2t, or null for a blank document
   *   images:   { "media/image1.png": "blob:..." } for the document's pictures
   *   title:    file name shown in sdkjs messages
   *   register: called with the api before loading, to attach callbacks
   */
  function boot(opts) {
    return new Promise(function (resolve, reject) {
      var api = new Asc.asc_docs_api({ 'id-view': 'editor_sdk', translate: {} });
      window.LucidApi = api;
      var settled = false;
      api.asc_registerCallback('asc_onError', function (id, level) {
        if (!settled && level === Asc.c_oAscError.Level.Critical) {
          settled = true;
          reject(new Error('sdkjs error ' + id));
        }
      });
      api.asc_registerCallback('asc_onDocumentContentReady', function () {
        if (settled) return;
        settled = true;
        // No dictionaries ship offline yet.
        api.asc_setSpellCheck(false);
        resolve(api);
      });
      api.asc_registerCallback('asc_onGetEditorPermissions', function () {
        api.asc_LoadDocument();
      });
      if (opts.register) opts.register(api);

      window.LucidPendingOpen = opts.bin || null;
      window.LucidPendingImages = opts.images || null;

      var user = new Asc.asc_CUserInfo();
      user.put_Id('local');
      user.put_FullName(opts.author || 'Me');
      var info = new Asc.asc_CDocInfo();
      info.put_Id('lucid-' + Date.now());
      info.put_Url('_offline_');
      info.put_Title(opts.title || 'Document.docx');
      info.put_Format('docx');
      info.put_UserInfo(user);
      info.put_Permissions({ edit: true, download: true, print: true });
      info.put_CoEditingMode('strict');
      info.put_Lang(opts.locale || 'en-US');
      api.asc_setDocInfo(info);
      api.asc_getEditorPermissions();
      api.asc_setViewMode(false);
    });
  }

  window.LucidHost = { boot: boot };
  window.dispatchEvent(new Event('lucid-host-ready'));
})();
