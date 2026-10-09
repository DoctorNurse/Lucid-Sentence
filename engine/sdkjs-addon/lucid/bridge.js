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
  // The document's pictures as blob URLs, by "media/<name>". sdkjs's offline
  // path re-registers every picture as documentUrl + "media/<name>" once the
  // document loads, which would replace these, so addImageUrl keeps ours.
  var documentImages = {};
  var addImageUrl = AscCommon.DocumentUrls.prototype.addImageUrl;
  AscCommon.DocumentUrls.prototype.addImageUrl = function (strPath, url) {
    var own = documentImages[this.mediaPrefix + strPath];
    return addImageUrl.call(this, strPath, own || url);
  };

  AscCommon.baseEditorsApi.prototype._openEmptyDocument = function () {
    var images = window['LucidPendingImages'];
    documentImages = images || {};
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

  /** Wrong words (sdkjs spell-check elements) in a paragraph, in order. */
  function wrongWords(para) {
    var els = (para.SpellChecker && para.SpellChecker.Elements) || [],
      out = [];
    for (var i = 0; i < els.length; i++) if (els[i].IsWrong()) out.push(els[i]);
    return out;
  }

  /**
   * Selects the next misspelled word after the cursor (wrapping around once)
   * and returns it, or null when the document has none. sdkjs then reports
   * the word and its suggestions through asc_onFocusObject.
   */
  function nextMisspelling(api) {
    var doc = api.WordControl.m_oLogicDocument;
    var paras = doc.GetAllParagraphs({ All: true });
    if (!paras.length) return null;
    var cur = doc.GetCurrentParagraph();
    var start = Math.max(0, paras.indexOf(cur));
    var after = cur ? cur.Get_ParaContentPos(cur.IsSelectionUse(), false, false) : null;
    for (var k = 0; k <= paras.length; k++) {
      var para = paras[(start + k) % paras.length];
      var words = wrongWords(para);
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (k === 0 && after && w.GetStartPos().Compare(after) < 0) continue;
        if (k === paras.length && after && w.GetStartPos().Compare(after) >= 0) continue;
        doc.RemoveSelection();
        para.Selection.Use = true;
        para.Selection.Start = false;
        para.Set_ParaContentPos(w.GetStartPos(), true, -1, -1);
        para.Set_SelectionContentPos(w.GetStartPos(), w.GetEndPos(), false);
        para.Document_SetThisElementCurrent(true);
        doc.UpdateSelection();
        return w.GetWord();
      }
    }
    return null;
  }

  /** Number of misspelled words the checker has found so far. */
  function misspellingCount(api) {
    var paras = api.WordControl.m_oLogicDocument.GetAllParagraphs({ All: true }),
      n = 0;
    for (var i = 0; i < paras.length; i++) n += wrongWords(paras[i]).length;
    return n;
  }

  /**
   * Inserts pictures at the cursor. images: [{ name: "lucid-1.png", url: "blob:..." }].
   * The name becomes the picture's media/ entry, so saving writes it to word/media.
   */
  function insertImages(api, images) {
    var urls = {},
      list = [];
    for (var i = 0; i < images.length; i++) {
      urls['media/' + images[i].name] = images[i].url;
      list.push(images[i].url);
    }
    AscCommon.g_oDocumentUrls.addUrls(urls);
    api._addImageUrl(list);
  }

  /** Leaves header/footer editing and puts the cursor back in the body. */
  function closeHeaderFooter(api) {
    var doc = api.WordControl.m_oLogicDocument;
    doc.EndHdrFtrEditing(true);
    api.WordControl.m_oDrawingDocument.ClearCachePages();
    api.WordControl.m_oDrawingDocument.FirePaint();
  }

  /**
   * sdkjs's page renderer output for x2t's PDF writer (what printing uses).
   * Pictures are drawn as texture fills, and that path writes blob: URLs as they are
   * (it expects g_oDocumentBlobUrls to hold base64 copies). Our pictures are blob: URLs
   * of files that x2t gets in /working/media, so point the renderer at "media/<name>".
   */
  function pdfData(api) {
    var blobs = AscCommon.g_oDocumentBlobUrls;
    var original = blobs.getImageBase64;
    blobs.getImageBase64 = function (url) {
      var local = AscCommon.g_oDocumentUrls.getLocal(url);
      return local ? local : original.call(blobs, url);
    };
    try {
      return api.WordControl.m_oDrawingDocument.ToRendererPart(true, true);
    } finally {
      blobs.getImageBase64 = original;
    }
  }

  window['LucidBridge'] = {
    listType: listType,
    version: 2,
    nextMisspelling: nextMisspelling,
    misspellingCount: misspellingCount,
    insertImages: insertImages,
    pdfData: pdfData,
    closeHeaderFooter: closeHeaderFooter,
    getBinary: getBinary,
    mediaNames: mediaNames,
    markSaved: markSaved,
    paragraphs: paragraphs,
    styleNames: styleNames,
  };
})(window);
