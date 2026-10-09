/*
 * Lucid Sentence: runs x2t (ONLYOFFICE core, AGPL-3.0, compiled to WebAssembly
 * by CryptPad) in a Web Worker so conversions never block the page.
 *
 * Request:  { id, data: Uint8Array, from: "docx"|"bin", to: "bin"|"docx"|"pdf", media?: { name: Uint8Array },
 *             pdf?: Uint8Array }   (to "pdf": data is the document binary, pdf is sdkjs's
 *                                   page renderer output; the fonts load from ../fonts/)
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
      queue.splice(0).forEach(handle);
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

  // x2t's PDF writer needs the fonts as plain TTFs. engine/dist/fonts holds them
  // in sdkjs's web format (first 32 bytes XOR'd with this key), listed in
  // ../sdkjs/common/AllFonts.js; load them once into /fonts.
  var FONT_KEY = [
    0xa0, 0x66, 0xd6, 0x20, 0x14, 0x96, 0x47, 0xfa, 0x95, 0x69, 0xb8, 0x50, 0xb0, 0x41, 0x49, 0x48,
    0xa0, 0x66, 0xd6, 0x20, 0x14, 0x96, 0x47, 0xfa, 0x95, 0x69, 0xb8, 0x50, 0xb0, 0x41, 0x49, 0x48,
  ];
  var fontsLoaded = null;
  function loadFonts() {
    if (fontsLoaded) return fontsLoaded;
    fontsLoaded = fetch('../sdkjs/common/AllFonts.js')
      .then(function (r) {
        return r.text();
      })
      .then(function (src) {
        var files = JSON.parse(/__fonts_files"\]\s*=\s*(\[[^\]]*\])/.exec(src)[1]);
        return Promise.all(
          files.map(function (f) {
            return fetch('../fonts/' + f)
              .then(function (r) {
                if (!r.ok) throw new Error('font ' + f + ': ' + r.status);
                return r.arrayBuffer();
              })
              .then(function (buf) {
                var b = new Uint8Array(buf);
                for (var i = 0; i < 32 && i < b.length; i++) b[i] ^= FONT_KEY[i];
                return { name: f, data: b };
              });
          }),
        );
      })
      .then(function (fonts) {
        var FS = Module.FS;
        if (!FS.analyzePath('/fonts').exists) FS.mkdir('/fonts');
        fonts.forEach(function (f) {
          FS.writeFile('/fonts/' + f.name + '.ttf', f.data);
        });
      });
    fontsLoaded.catch(function () {
      fontsLoaded = null;
    });
    return fontsLoaded;
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
      // bin -> pdf: x2t draws the pages from sdkjs's renderer output next to the input.
      if (msg.to === 'pdf') FS.writeFile('/working/pdf.bin', msg.pdf);
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
          '<m_sFontDir>' +
          (msg.to === 'pdf' ? '/fonts/' : '/working/fonts/') +
          '</m_sFontDir>' +
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

  function handle(msg) {
    if (msg.to !== 'pdf') return run(msg);
    loadFonts().then(
      function () {
        run(msg);
      },
      function (e) {
        self.postMessage({
          id: msg.id,
          ok: false,
          error: 'fonts: ' + String((e && e.message) || e),
        });
      },
    );
  }

  self.onmessage = function (e) {
    if (ready) handle(e.data);
    else queue.push(e.data);
  };
})();
