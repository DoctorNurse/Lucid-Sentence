/*
 * Lucid Sentence: runs x2t (ONLYOFFICE core, AGPL-3.0, compiled to WebAssembly
 * by CryptPad) in a Web Worker so conversions never block the page.
 *
 * Request:  { id, data: Uint8Array, from: "docx"|"bin", to: "bin"|"docx", media?: { name: Uint8Array } }
 * Response: { id, ok: true, data: Uint8Array, media: { name: Uint8Array } } or { id, ok: false, error }
 *
 * Copyright (C) 2026 Lucid Systems and the Lucid Sentence contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/* global importScripts */
// Everything lives in this closure: x2t.js is Emscripten output that declares
// globals such as run(), which would silently replace same-named functions here.
(function () {
  'use strict';

  var Module;
  var queue = [];
  var ready = false;
  Module = self.Module = {
    noInitialRun: true,
    noExitRuntime: true,
    print: function () {},
    printErr: function () {},
    onRuntimeInitialized: function () {
      ready = true;
      queue.splice(0).forEach(run);
    },
  };
  importScripts('x2t.js');

  function rmrf(FS, path) {
    if (!FS.analyzePath(path).exists) return;
    if (FS.isDir(FS.stat(path).mode)) {
      FS.readdir(path).forEach(function (e) {
        if (e !== '.' && e !== '..') rmrf(FS, path + '/' + e);
      });
      FS.rmdir(path);
    } else {
      FS.unlink(path);
    }
  }

  function run(msg) {
    var FS = Module.FS;
    try {
      rmrf(FS, '/working');
      ['/working', '/working/media', '/working/fonts', '/working/themes'].forEach(function (d) {
        FS.mkdir(d);
      });
      var input = '/working/in.' + msg.from;
      var output = '/working/out.' + msg.to;
      FS.writeFile(input, msg.data);
      var media = msg.media || {};
      Object.keys(media).forEach(function (name) {
        FS.writeFile('/working/media/' + name.replace(/[\\/]/g, '_'), media[name]);
      });
      FS.writeFile(
        '/working/params.xml',
        '<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert>' +
          '<m_sFileFrom>' +
          input +
          '</m_sFileFrom>' +
          '<m_sFileTo>' +
          output +
          '</m_sFileTo>' +
          '<m_sFontDir>/working/fonts/</m_sFontDir>' +
          '<m_sThemeDir>/working/themes</m_sThemeDir>' +
          '<m_bIsNoBase64>true</m_bIsNoBase64>' +
          '</TaskQueueDataConvert>',
      );
      var code = Module.ccall('main1', 'number', ['string'], ['/working/params.xml']);
      if (code !== 0) throw new Error('x2t exit code ' + code);
      var out = FS.readFile(output);
      var outMedia = {};
      if (msg.to === 'bin') {
        FS.readdir('/working/media').forEach(function (name) {
          if (name !== '.' && name !== '..') outMedia[name] = FS.readFile('/working/media/' + name);
        });
      }
      var transfer = [out.buffer].concat(
        Object.keys(outMedia).map(function (k) {
          return outMedia[k].buffer;
        }),
      );
      self.postMessage({ id: msg.id, ok: true, data: out, media: outMedia }, transfer);
    } catch (e) {
      self.postMessage({ id: msg.id, ok: false, error: String((e && e.message) || e) });
    } finally {
      try {
        rmrf(FS, '/working');
      } catch {
        /* next run recreates it */
      }
    }
  }

  self.onmessage = function (e) {
    if (ready) run(e.data);
    else queue.push(e.data);
  };
})();
