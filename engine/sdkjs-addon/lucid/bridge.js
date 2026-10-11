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


  // ── References ──────────────────────────────────────────────────────────

  function logic(api) {
    return api.WordControl.m_oLogicDocument;
  }

  /** Inserts (or restyles) the table of contents. style: Asc.c_oAscTOCStylesType. */
  function insertToc(api, style, levels) {
    var pr = new Asc.CTableOfContentsPr();
    pr.put_OutlineRange(1, levels || 3);
    pr.put_Hyperlink(true);
    pr.put_ShowPageNumbers(true);
    pr.put_RightAlignTab(true);
    pr.put_TabLeader(Asc.c_oAscTabLeader.Dot);
    pr.put_StylesType(style);
    api.asc_AddTableOfContents(null, pr);
  }

  function hasToc(api) {
    return !!logic(api).GetTableOfContents();
  }

  function updateToc(api, pageNumbersOnly) {
    if (!hasToc(api)) return false;
    api.asc_UpdateTableOfContents(!!pageNumbersOnly);
    return true;
  }

  function removeToc(api) {
    if (!hasToc(api)) return false;
    api.asc_RemoveTableOfContents();
    return true;
  }

  /** "Footnote"/"Endnote" navigation. Returns false when there are none. */
  function gotoNote(api, endnote, next) {
    var doc = logic(api);
    var list = endnote ? doc.GetEndnotesList(null, null) : doc.GetFootnotesList(null, null);
    if (!list || !list.length) return false;
    if (endnote) api.asc_GotoEndnote(next);
    else api.asc_GotoFootnote(next);
    return true;
  }

  function noteCounts(api) {
    var doc = logic(api);
    return {
      footnotes: (doc.GetFootnotesList(null, null) || []).length,
      endnotes: (doc.GetEndnotesList(null, null) || []).length,
    };
  }

  /** Caption for the selected picture/table, or at the cursor. label: Figure, Table, Equation. */
  function insertCaption(api, label, below, excludeLabel) {
    var pr = new Asc.CAscCaptionProperties();
    pr.Label = label;
    pr.Before = !below;
    pr.ExcludeLabel = !!excludeLabel;
    pr.Format = Asc.c_oAscNumberingFormat.Decimal;
    api.asc_AddObjectCaption(pr);
  }

  function insertTableOfFigures(api, label) {
    var pr = new Asc.CTableOfContentsPr();
    pr.put_Caption(label);
    pr.put_IncludeLabelAndNumber(true);
    pr.put_Hyperlink(true);
    pr.put_ShowPageNumbers(true);
    pr.put_RightAlignTab(true);
    pr.put_TabLeader(Asc.c_oAscTabLeader.Dot);
    pr.put_StylesType(Asc.c_oAscTOFStylesType.Current);
    api.asc_AddTableOfFigures(pr);
  }

  function updateTablesOfFigures(api) {
    if (!logic(api).GetAllTablesOfFigures(true).length) return false;
    api.asc_UpdateTablesOfFigures();
    return true;
  }

  // Cross-reference targets from the last crossRefTargets() call.
  var refTargets = [];

  function paraText(p) {
    return (p.GetText ? p.GetText({ ParaSeparator: '', TableRowSeparator: '' }) : '').replace(/\s+/g, ' ').trim();
  }

  /** kind: heading | footnote | endnote | Figure | Table | Equation */
  function crossRefTargets(api, kind) {
    var list;
    if (kind === 'heading') list = api.asc_GetAllHeadingParagraphs();
    else if (kind === 'footnote') list = api.asc_GetAllFootNoteParagraphs();
    else if (kind === 'endnote') list = api.asc_GetAllEndNoteParagraphs();
    else list = api.asc_GetAllCaptionParagraphs(kind);
    refTargets = list || [];
    var out = [];
    for (var i = 0; i < refTargets.length; i++) out.push(paraText(refTargets[i]) || '(empty)');
    return out;
  }

  /** what: text | page | aboveBelow | number (label and number, or note number). */
  function insertCrossRef(api, kind, index, what) {
    var p = refTargets[index];
    if (!p) return false;
    var T = Asc.c_oAscDocumentRefenceToType;
    if (kind === 'heading') {
      var t = what === 'page' ? T.PageNum : what === 'aboveBelow' ? T.AboveBelow : T.Text;
      api.asc_AddCrossRefToParagraph(p, t, true, false, '');
    } else if (kind === 'footnote' || kind === 'endnote') {
      var n = what === 'page' ? T.PageNum : what === 'aboveBelow' ? T.AboveBelow : T.NoteNumber;
      api.asc_AddCrossRefToNote(p, n, true, false);
    } else {
      var c =
        what === 'page' ? T.PageNum : what === 'aboveBelow' ? T.AboveBelow : what === 'text' ? T.OnlyCaptionText : T.OnlyLabelAndNumber;
      api.asc_AddCrossRefToCaption(kind, p, c, true, false);
    }
    return true;
  }

  // ── Review: comments ────────────────────────────────────────────────────

  function commentList(api) {
    var all = logic(api).GetCommentsManager().GetAllComments();
    var out = [];
    for (var id in all) {
      var c = all[id];
      if (!c || !c.GetData) continue;
      var d = c.GetData();
      var replies = [];
      for (var i = 0; i < d.GetRepliesCount(); i++) {
        var r = d.GetReply(i);
        replies.push({ author: r.GetUserName(), text: r.GetText(), time: Number(r.m_sOOTime) || 0 });
      }
      out.push({
        id: c.GetId(),
        author: d.GetUserName(),
        text: d.GetText(),
        quote: d.GetQuoteText() || '',
        solved: !!d.IsSolved(),
        time: Number(d.m_sOOTime) || 0,
        pos: c.GetPosition ? c.GetPosition() : 0,
        replies: replies,
      });
    }
    out.sort(function (a, b) {
      return a.pos - b.pos;
    });
    return out;
  }

  function newCommentData(text, author) {
    var d = new Asc.asc_CCommentDataWord(null);
    d.asc_putText(text);
    d.asc_putUserName(author);
    d.asc_putUserId('local');
    d.asc_putTime(String(Date.now() - new Date().getTimezoneOffset() * 60000));
    d.asc_putOnlyOfficeTime(String(Date.now()));
    return d;
  }

  /** Comments the selection (or the word at the cursor). Returns the id. */
  function addComment(api, text, author) {
    var doc = logic(api);
    var d = newCommentData(text, author);
    var quote = api.asc_GetSelectedText(true);
    if (!quote) {
      doc.SelectCurrentWord && doc.SelectCurrentWord();
      quote = api.asc_GetSelectedText(true);
    }
    d.asc_putQuoteText(quote || '');
    d.asc_putDocumentFlag(false);
    return api.asc_addComment(d);
  }

  function editComment(api, id, fn) {
    var c = logic(api).GetCommentsManager().GetById(id);
    if (!c) return false;
    var d = new Asc.asc_CCommentDataWord(c.GetData());
    fn(d);
    api.asc_changeComment(id, d);
    return true;
  }

  function replyComment(api, id, text, author) {
    return editComment(api, id, function (d) {
      d.asc_addReply(newCommentData(text, author));
    });
  }

  function resolveComment(api, id, solved) {
    return editComment(api, id, function (d) {
      d.asc_putSolved(!!solved);
    });
  }

  function removeComment(api, id) {
    api.asc_removeComment(id);
  }

  function removeAllComments(api) {
    api.asc_RemoveAllComments(false, false);
    commentIndex = -1;
  }

  var commentIndex = -1;
  /** Selects the next/previous comment's text. Returns its id, or null. */
  function gotoComment(api, next, id) {
    var list = commentList(api);
    if (!list.length) return null;
    if (id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) commentIndex = i;
    } else {
      commentIndex = next ? commentIndex + 1 : commentIndex - 1;
      if (commentIndex >= list.length) commentIndex = 0;
      if (commentIndex < 0) commentIndex = list.length - 1;
    }
    var c = list[commentIndex];
    api.asc_selectComment(c.id);
    api.asc_showComment(c.id);
    return c.id;
  }

  /** The id of the comment the cursor is in (for Delete), or null. */
  function currentComment(api) {
    var list = commentList(api);
    return list.length && commentIndex >= 0 && list[commentIndex] ? list[commentIndex].id : null;
  }

  /** Name used for new comments and tracked changes. */
  function setAuthor(api, name) {
    var info = api.DocInfo && api.DocInfo.get_UserInfo && api.DocInfo.get_UserInfo();
    if (info) info.put_FullName(name);
    if (api.User) api.User.setUserName(name);
  }

  // ── Review: tracking ────────────────────────────────────────────────────

  function setTrack(api, on) {
    api.asc_SetLocalTrackRevisions(!!on);
  }

  function isTrack(api) {
    return !!api.asc_IsTrackRevisions();
  }

  /** mode: Asc.c_oAscDisplayModeInReview (0 all markup, 1 no markup, 2 original, 3 simple). */
  function setDisplayMode(api, mode) {
    api.asc_SetDisplayModeInReview(mode);
  }

  function displayMode(api) {
    return api.asc_GetDisplayModeInReview();
  }

  function revisionCount(api) {
    var stack = logic(api).TrackRevisionsManager;
    if (stack && stack.Get_AllChanges) {
      var all = stack.Get_AllChanges();
      var n = 0;
      for (var k in all) n += all[k].length || 0;
      return n;
    }
    return api.asc_HaveRevisionsChanges() ? 1 : 0;
  }

  /** which: next (this one, then move on) | this | all */
  function acceptChange(api, which) {
    if (which === 'all') api.asc_AcceptAllChanges();
    else api.asc_AcceptChangesBySelection(which === 'next');
  }

  function rejectChange(api, which) {
    if (which === 'all') api.asc_RejectAllChanges();
    else api.asc_RejectChangesBySelection(which === 'next');
  }

  function gotoChange(api, next) {
    if (!api.asc_HaveRevisionsChanges()) return false;
    if (next) api.asc_GetNextRevisionsChange();
    else api.asc_GetPrevRevisionsChange();
    return true;
  }

  /**
   * Compares the open document with another (an x2t DOCY binary and its pictures):
   * the differences land in this document as tracked changes.
   */
  function compareWith(api, bin, images) {
    // Pictures of the other document resolve through insertDocumentUrlsData.imageMap.
    api.insertDocumentUrlsData = { imageMap: images || {}, documents: [], convertCallback: null };
    var opts = new AscCommonWord.ComparisonOptions();
    AscCommonWord.CompareBinary(bin, opts);
  }

  // ── Selection text for the Assistant ────────────────────────────────────

  /** The selected text; with nothing selected, selects the paragraph at the cursor first. */
  function selectionForAssistant(api) {
    var doc = logic(api);
    var text = api.asc_GetSelectedText(false);
    if (!text || !text.trim()) {
      var para = doc.GetCurrentParagraph();
      if (!para) return '';
      para.SelectAll(1);
      para.Document_SetThisElementCurrent(true);
      text = api.asc_GetSelectedText(false);
    }
    return (text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  }

  function selectedText(api) {
    return (api.asc_GetSelectedText(false) || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  }

  /**
   * Replaces the selection with text as a tracked change (Track Changes is on for
   * this edit whatever the document's setting), then restores the setting.
   * after: insert as a new paragraph after the selection instead (Summarize).
   */
  function replaceTracked(api, text, after, done) {
    var doc = logic(api);
    var was = doc.GetLocalTrackRevisions();
    doc.SetLocalTrackRevisions(true);
    if (after) {
      var para = doc.GetCurrentParagraph();
      doc.RemoveSelection();
      if (para) {
        para.MoveCursorToEndPos(false);
        para.Document_SetThisElementCurrent(true);
      }
      text = '\n' + text;
    }
    api.asc_PasteData(AscCommon.c_oAscClipboardDataFormat.Text, text, undefined, undefined, undefined, function () {
      doc.SetLocalTrackRevisions(was);
      if (done) done();
    });
  }

  // ── Layout ──────────────────────────────────────────────────────────────

  /** kind: one | two | three | left | right */
  function setColumns(api, kind) {
    var pr = new Asc.CDocumentColumnsProps();
    var space = 12.5; // mm, Word's default 0.5"
    if (kind === 'left' || kind === 'right') {
      pr.put_EqualWidth(false);
      pr.put_Num(2);
      pr.put_Space(space);
      var w = api.asc_GetColumnsProps ? api.asc_GetColumnsProps().get_TotalWidth() : 165;
      var narrow = (w - space) / 3;
      var wide = w - space - narrow;
      pr.put_ColByValue(0, kind === 'left' ? narrow : wide, space);
      pr.put_ColByValue(1, kind === 'left' ? wide : narrow, 0);
    } else {
      pr.put_EqualWidth(true);
      pr.put_Num(kind === 'three' ? 3 : kind === 'two' ? 2 : 1);
      pr.put_Space(space);
    }
    api.asc_SetColumnsProps(pr);
  }

  function columnCount(api) {
    var pr = api.asc_GetColumnsProps && api.asc_GetColumnsProps();
    return pr ? pr.get_Num() : 1;
  }

  /** kind: page | column | next | continuous | even | odd */
  function insertBreak(api, kind) {
    var T = Asc.c_oAscSectionBreakType;
    if (kind === 'page') api.put_AddPageBreak();
    else if (kind === 'column') api.put_AddColumnBreak();
    else api.add_SectionBreak(kind === 'continuous' ? T.Continuous : kind === 'even' ? T.EvenPage : kind === 'odd' ? T.OddPage : T.NextPage);
  }

  function sectionCount(api) {
    return api.asc_GetSectionsCount();
  }

  /** Proofing language for the selection (lcid), optionally as the document default. */
  function setLanguage(api, lcid, asDefault) {
    if (asDefault) api.asc_setDefaultLanguage(lcid);
    else api.put_TextPrLang(lcid);
  }

  window['LucidBridge'] = {
    listType: listType,
    version: 3,
    insertToc: insertToc,
    hasToc: hasToc,
    updateToc: updateToc,
    removeToc: removeToc,
    gotoNote: gotoNote,
    noteCounts: noteCounts,
    insertCaption: insertCaption,
    insertTableOfFigures: insertTableOfFigures,
    updateTablesOfFigures: updateTablesOfFigures,
    crossRefTargets: crossRefTargets,
    insertCrossRef: insertCrossRef,
    commentList: commentList,
    addComment: addComment,
    replyComment: replyComment,
    resolveComment: resolveComment,
    removeComment: removeComment,
    removeAllComments: removeAllComments,
    gotoComment: gotoComment,
    currentComment: currentComment,
    setAuthor: setAuthor,
    setTrack: setTrack,
    isTrack: isTrack,
    setDisplayMode: setDisplayMode,
    displayMode: displayMode,
    revisionCount: revisionCount,
    acceptChange: acceptChange,
    rejectChange: rejectChange,
    gotoChange: gotoChange,
    compareWith: compareWith,
    selectionForAssistant: selectionForAssistant,
    selectedText: selectedText,
    replaceTracked: replaceTracked,
    setColumns: setColumns,
    columnCount: columnCount,
    insertBreak: insertBreak,
    sectionCount: sectionCount,
    setLanguage: setLanguage,
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
