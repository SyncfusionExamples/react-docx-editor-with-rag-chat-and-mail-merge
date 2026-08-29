// Returns the (x, y) coordinates where the AI Assist button should sit
// for the current cursor or selection.
//
// Layout context: the app now has a top bar (56px) + a 3-column bottom
// row (left sections panel / center editor / right AI chat). The AI
// Assist button (FabComponent with cssClass="ai-assist-btn") is
// position:absolute inside #documentEditorDiv (the center column,
// which has position:relative). So the coordinates returned here MUST
// be relative to #documentEditorDiv — NOT .control-section — otherwise
// the button drifts by the top-bar height + left-panel width and no
// longer sits at the beginning of the line where the cursor is.
//
// Strategy:
//   1. Read the caret / selection start from the editor's selection
//      object (so a non-blinking cursor and a selection both work).
//   2. Follow the current line widget's bounding rect so the button
//      sits at the beginning of the line wherever the user clicked or
//      arrowed.
//   3. Compute x/y relative to #documentEditorDiv (the offset parent
//      of the absolutely-positioned button), so the top bar and left
//      panel don't push the button out of position.
//   4. Fall back to the .e-de-blink-cursor path if the line widget
//      can't be found (older Syncfusion builds, race conditions).
window.getAIAssistBtnPosition = function () {
  // The button's offset parent — #documentEditorDiv (the center
  // column wrapper). All coordinates are relative to this element so
  // the top-bar height and left-panel width are automatically
  // accounted for.
  var offsetParent = document.getElementById("documentEditorDiv");
  if (!offsetParent) return undefined;
  var parentRect = offsetParent.getBoundingClientRect();

  var viewer = document.querySelector("#document-editor_editor_viewerContainer");
  if (!viewer) return undefined;
  var viewerRect = viewer.getBoundingClientRect();

  // Try the line-widget path first: it's the only one that works for a
  // selection (not just a blinking caret) and it tracks scroll/resize
  // because the line widget's bounding rect is always live.
  //
  // Syncfusion builds vary: some expose
  // sel.start.getCurrentLineWidget() (a method), others expose
  // sel.start.currentWidget (a direct property pointing at the line's
  // element/widget). We try BOTH so the button tracks the selected
  // line on every build.
  var editorRoot = document.getElementById("document-editor");
  var docEditor = editorRoot && (editorRoot.ej2_instances || []).find(function (i) {
    return i && (i.documentEditor || i.selection);
  });
  var lineEl = null;
  try {
    var sel = docEditor && (docEditor.selection || (docEditor.documentEditor && docEditor.documentEditor.selection));
    if (sel && sel.start) {
      // Method path (newer builds).
      if (typeof sel.start.getCurrentLineWidget === "function") {
        var lineWidget = sel.start.getCurrentLineWidget();
        if (lineWidget && lineWidget.children && lineWidget.children.length) {
          lineEl = lineWidget.children[0];
        } else if (lineWidget && lineWidget.line) {
          lineEl = lineWidget.line;
        }
      }
      // Property path (older / other builds). currentWidget is the
      // line widget directly — its children[0] is the leftmost text
      // element on the line, and .line is the line's DOM element.
      if (!lineEl && sel.start.currentWidget) {
        var cw = sel.start.currentWidget;
        if (cw.children && cw.children.length) {
          lineEl = cw.children[0];
        } else if (cw.line) {
          lineEl = cw.line;
        } else if (cw.getBoundingClientRect) {
          // currentWidget itself might be a DOM element.
          lineEl = cw;
        }
      }
    }
  } catch (e) { /* fall through to fallback path */ }

  if (!lineEl) {
    // Fallback: find any visible line widget inside the viewer.
    var fallback = viewer.querySelector(".e-de-lines .e-de-line-widget, .e-de-line-renderer, [class*='line-widget']");
    lineEl = fallback;
  }

  if (lineEl && lineEl.getBoundingClientRect) {
    var lineRect = lineEl.getBoundingClientRect();
    // Skip if the line is fully outside the visible editor area.
    var visibleTop = Math.max(viewerRect.top, lineRect.top);
    var visibleBottom = Math.min(viewerRect.bottom, lineRect.bottom);
    if (visibleBottom > visibleTop) {
      // y: center the 24px button on the line's vertical midpoint,
      // relative to the offset parent (#documentEditorDiv).
      var y = ((visibleTop + visibleBottom) / 2) - parentRect.top - 12;
      // x: place the button just to the LEFT of the line's first
      // character (clamped so it never goes off the left edge of the
      // editor). 28px offset keeps it clear of the text margin.
      var xRaw = lineRect.left - parentRect.left - 28;
      var xMin = viewerRect.left - parentRect.left + 4;
      var x = Math.max(xMin, xRaw);
      return { x: x, y: y };
    }
  }

  // ---- Legacy path: blink-cursor based (kept as a safety net) ----
  var cursor = document.querySelector('.e-de-blink-cursor');
  if (!cursor) return undefined;
  var cursorRect = cursor.getBoundingClientRect();
  var cursorTop = cursor.style.display === 'none'
    ? parseInt((cursor.style.top || '0').split('px')[0], 10) || cursorRect.top
    : cursorRect.top;
  var rulerInner = document.querySelector("#document-editor_editor_viewerContainer .e-de-hRuler .e-de-hRuler");
  if (!rulerInner) return undefined;
  var rulerLeft = parseInt((rulerInner.style.marginLeft || '0').split('px')[0], 10) || 0;
  var rulerWidthEl = document.querySelector(".e-de-hRuler .e-de-hRuler");
  var rulerWidth = rulerWidthEl ? rulerWidthEl.offsetWidth : 0;
  if (!rulerWidth && rulerWidth !== 0) return undefined;
  var aiButtonPosition = rulerWidth / 20;
  var markIndicator = document.getElementById("document-editor_editor_markIndicator");
  var vRuleIndicator = document.getElementById("document-editor_editor_vRulerBottom");
  if (!markIndicator || !vRuleIndicator) return undefined;
  var markIndicatorRect = markIndicator.getBoundingClientRect().top;
  var vRuleIndicatorRect = vRuleIndicator.getBoundingClientRect().top;
  var scrollDifference = markIndicatorRect - vRuleIndicatorRect;
  // y: relative to the offset parent (#documentEditorDiv), not
  // .control-section. The top-bar offset is already in parentRect.top.
  var y = cursor.style.display === 'none'
    ? ((viewerRect.top - parentRect.top) + cursorTop) - scrollDifference
    : (cursorTop - parentRect.top);
  var x = (viewerRect.left - parentRect.left) + rulerLeft + aiButtonPosition;
  return { x: x, y: y };
};

window.getAIChatBtnPosition = function () {
  var documnetEditor = document.querySelector("#document-editor");
  if (!documnetEditor) {
    return;
  }
  var documnetEditorRect = documnetEditor.getBoundingClientRect();
  var documnetEditorHeight = documnetEditorRect.height;
  var documnetEditorWidth = documnetEditorRect.width;
  var x = documnetEditorWidth - 87;
  var y = documnetEditorHeight - 81;
  return { x: x, y: y };
};

window.setAiAssistBtnPosition = function (x, y) {
  var el = document.getElementsByClassName('ai-chat-btn')[0];
  if (!el) return;
  el.style.position = 'absolute';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
};
window.getAIAssistPopupPosition = function () {
  var aiButton = document.getElementsByClassName('ai-assist-btn')[0];
  if (!aiButton) return { x: 200, y: 160 };
  var bRect = aiButton.getBoundingClientRect();
  var sampleMargin = 8;
  // The DialogComponent that shows the AI Assist popup uses
  // target={'#ai-assist'}, and #ai-assist's offset parent is
  // #documentEditorDiv (position: relative). Syncfusion positions the
  // dialog at (X, Y) within #documentEditorDiv's coordinate space —
  // the SAME coordinate space that getAIAssistBtnPosition uses. So we
  // must compute the dialog's position relative to #documentEditorDiv,
  // NOT relative to #ai-assist (which is a 0-height div at the bottom
  // of #documentEditorDiv and would produce negative Y values).
  //
  // Previously this function subtracted #ai-assist's rect, which gave
  // coordinates relative to a 0-height element at the bottom of the
  // editor — causing the dialog to appear at top: -312px (off-screen).
  // Subtracting #documentEditorDiv's rect instead puts the dialog
  // right next to the AI Assist button, in the same coordinate space
  // the button itself uses.
  var offsetParent = document.getElementById('documentEditorDiv');
  var parentRect = offsetParent ? offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
  return {
    x: bRect.left - parentRect.left - sampleMargin,
    y: (bRect.top + bRect.height) - parentRect.top - sampleMargin
  };
};

window.setDialogDivHeight = (mode) => {
  var q = document.getElementById('e-de-qus-pane');
  var ans = document.getElementById('e-de-editableDiv');
  if (!ans) return;
  if (mode === 'Generate') ans.style.height = '100px';
  else { if (q) q.style.height = '75px'; ans.style.height = '75px'; }
};
window.getTextContent = () => {
  var el = document.getElementById('e-de-editableDiv');
  return el ? (el.textContent || '').trim() : '';
};
window.getInputContent = () => {
  var el = document.getElementById('e-de-editableDiv');
  return el ? (el.value || '').trim() : '';
};
window.getHtmlContent = () => {
  var el = document.getElementById('e-de-editableDiv');
  return el ? el.innerHTML : '';
};
window.setTextContent = (text) => {
  var el = document.getElementById('e-de-editableDiv');
  if (el) el.textContent = text || '';
};
window.setHtmlContent = (html) => {
  var el = document.getElementById('e-de-editableDiv');
  if (el) el.innerHTML = html || '';
};
window.clearDivContent = () => {
  var el = document.getElementById('e-de-editableDiv');
  if (el) el.innerHTML = '';
};
window.setPlaceholder = (placeholderText) => {
  var el = document.getElementById('e-de-editableDiv');
  if (el && (el.innerText || '').trim() === '') {
    el.innerText = placeholderText || '';
    el.classList.add('placeHoldr');
  }
};
window.removePlaceholder = (placeholderText) => {
  var el = document.getElementById('e-de-editableDiv');
  if (!el) return;
  if (el.innerText === placeholderText) {
    el.innerText = '';
    el.classList.remove('placeHoldr');
  }
};


window.getAIButtonPosition = function () {
  var aiButton = document.getElementsByClassName('e-control e-btn ai-assist-btn e-fab')[0];
  if (!aiButton) {
    return;
  }
  var aiButtonRect = aiButton.getBoundingClientRect();
  var x = aiButtonRect.left;
  var y = aiButtonRect.top;
  return { x: x, y: y };
}

window.toggleSendIcon = function (isEnabled) {
  const sendElement = document.querySelector(".ai-assist-dialog .e-icons.e-send");
  if (sendElement) {
    if (isEnabled) {
      sendElement.classList.remove('e-disabled');
    } else {
      sendElement.classList.add('e-disabled');
    }
  }
};


window.getGeneratingDraftPosition = function () {
  var aiButton = document.getElementsByClassName('e-control ai-assist-btn e-fab')[0];
  if (!aiButton) {
    return;
  }
  var aiButtonRect = aiButton.getBoundingClientRect();
  var aiButtonLeft = aiButtonRect.left;
  var aiButtonTop = aiButtonRect.top;
  var documnetEditor = document.querySelector(".control-section");
  if (!documnetEditor) {
    return;
  }
  var documnetEditorRect = documnetEditor.getBoundingClientRect();
  var documnetEditorTop = documnetEditorRect.top;
  var sampleMargin = 8;
  var x = aiButtonLeft - sampleMargin;
  var y = aiButtonTop - documnetEditorTop;
  return { x: x, y: y };
}

window.setGeneratingDraftPosition = function (x, y) {
  var element = document.getElementsByClassName('e-stop-generating-dialog')[0];
  if (element) {
    element.style.position = 'absolute';
    element.style.left = x + 'px';
    element.style.top = y + 'px';
  }
};
window.showGeneratingDraft = function (isShow) {
  var stopPopupElement = document.querySelector('.e-stop-generating-dialog');
  if (stopPopupElement) {
    if (isShow) {
      stopPopupElement.style.display = "block";
    }
    else {
      stopPopupElement.style.display = "none";
    }
  }
}

window.setAIAssistBtnIconSize = function (AIAssistBtnIconSize) {
  var iconElement = document.querySelector(".ai-assist-btn .e-icons.e-ai-assist-btn");
  if (iconElement) {
    iconElement.style.fontSize = AIAssistBtnIconSize + "px";
    iconElement.style.height = AIAssistBtnIconSize + "px";
    iconElement.style.width = AIAssistBtnIconSize + "px";
    iconElement.style.lineHeight = (AIAssistBtnIconSize + 1) + "px";
  }
}

window.getRegeneratePopupPosition = function () {
  var statusBar = document.querySelector(".e-de-status-bar");
  if (!statusBar) {
    return;
  }
  var statusBarRect = statusBar.getBoundingClientRect();
  // The regenerate dialog also uses target={'#ai-assist'} whose offset
  // parent is #documentEditorDiv. Convert viewport-absolute statusBar
  // top to #documentEditorDiv-relative coordinates so the popup appears
  // above the status bar, not off-screen.
  var offsetParent = document.getElementById('documentEditorDiv');
  var parentTop = offsetParent ? offsetParent.getBoundingClientRect().top : 0;
  var statusBarTop = statusBarRect.top - parentTop;
  var regeneratePopupHeight = 175;
  var sampleMargin = 8;
  var x = 130;
  var y = (statusBarTop - regeneratePopupHeight) - sampleMargin;
  return { x: x, y: y };
}