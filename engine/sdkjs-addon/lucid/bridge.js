/*
 * Lucid Sentence engine bridge for ONLYOFFICE sdkjs.
 *
 * Built into the word SDK as a sdkjs build addon (`grunt --addon=...`), so it
 * is compiled together with sdkjs and can reach members that Closure renames.
 * It exports a small, stable API under window["LucidBridge"] for the host page
 * (engine/host/host.js). Everything runs on the device: documents arrive as
 * x2t "DOCY" binaries and leave the same way.
 *
 * Copyright (C) 2026 Lucid Systems and the Lucid Sentence contributors.
 * Part of a modified version of ONLYOFFICE sdkjs, which is based on the
 * original ONLYOFFICE software developed by Ascensio System SIA.
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/* global AscCommon, AscCommonWord, styletype_Paragraph */
(function (window) {
  'use strict';

  // Offline documents (DocInfo URL "_offline_") open through _openEmptyDocument.
  // Hand it the converted document, and register its pictures, instead of the
  // built-in empty page.
  AscCommon.baseEditorsApi.prototype._openEmptyDocument = function () {
    var images = window['LucidPendingImages'];
    if (images) {
      AscCommon.g_oDocumentUrls.addUrls(images);
    }
    var file = new AscCommon.OpenFileResult();
    file.data = window['LucidPendingOpen'] || blankDocument();
    window['LucidPendingOpen'] = null;
    window['LucidPendingImages'] = null;
    file.bSerFormat = AscCommon.checkStreamSignature(file.data, AscCommon.c_oSerFormat.Signature);
    this.onEndLoadFile(file);
  };

  /** sdkjs's blank document (word/document/empty.js, loaded by the host page) as bytes. */
  function blankDocument() {
    var s = window['g_sEmpty_bin'],
      bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  /** "bullet", "number", or null for the paragraph at the cursor. */
  function listType(api) {
    var doc = api.WordControl.m_oLogicDocument;
    var para = doc && doc.GetCurrentParagraph();
    var numPr = para && para.GetNumPr ? para.GetNumPr() : null;
    if (!numPr || !numPr.IsValid || !numPr.IsValid()) return null;
    var num = doc.GetNumbering().GetNum(numPr.NumId);
    var lvl = num && num.GetLvl(numPr.Lvl || 0);
    if (!lvl) return null;
    return lvl.IsBulleted() ? 'bullet' : 'number';
  }

  /** The document as a "DOCY;v10;" binary (header included): x2t's input for .docx. */
  function getBinary(api) {
    var writer = new AscCommonWord.BinaryFileWriter(api.WordControl.m_oLogicDocument);
    return writer.Write(true);
  }

  /** Media names ("image1.png") the document refers to, for x2t's media folder. */
  function mediaNames() {
    var urls = AscCommon.g_oDocumentUrls.getUrls(),
      out = [];
    for (var key in urls) {
      if (Object.prototype.hasOwnProperty.call(urls, key) && key.indexOf('media/') === 0) {
        out.push(key.substring(6));
      }
    }
    return out;
  }

  /** Clears the modified flag after a successful save. */
  function markSaved(api) {
    AscCommon.History.Reset_SavedIndex(true);
    api.SetDocumentModified(false);
  }

  /** Paragraph text and style names, for tests and outline features. */
  function paragraphs(api) {
    var doc = api.WordControl.m_oLogicDocument,
      out = [];
    for (var i = 0; i < doc.Content.length; ++i) {
      var el = doc.Content[i];
      if (el.IsParagraph && el.IsParagraph()) {
        var styleId = el.Style_Get(),
          style = styleId ? doc.Styles.Get(styleId) : null;
        out.push({ text: el.GetText(), style: style ? style.GetName() : '' });
      } else {
        out.push({ text: '', style: '', table: !!(el.IsTable && el.IsTable()) });
      }
    }
    return out;
  }

  /** Names of the paragraph styles defined in the document. */
  function styleNames(api) {
    var styles = api.WordControl.m_oLogicDocument.Styles.Style,
      out = [];
    for (var id in styles) {
      if (
        Object.prototype.hasOwnProperty.call(styles, id) &&
        styles[id].GetType() === styletype_Paragraph
      ) {
        out.push(styles[id].GetName());
      }
    }
    return out;
  }

  window['LucidBridge'] = {
    listType: listType,
    version: 1,
    getBinary: getBinary,
    mediaNames: mediaNames,
    markSaved: markSaved,
    paragraphs: paragraphs,
    styleNames: styleNames,
  };
})(window);
