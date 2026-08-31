window.getAIAssistBtnPosition = function () {
  /*
   * The FAB is absolutely positioned inside #documentEditorDiv.
   */
  var positionContainer =
    document.querySelector("#documentEditorDiv");

  if (!positionContainer) {
    return;
  }

  var positionContainerRect =
    positionContainer.getBoundingClientRect();

  var viewerContainer =
    document.querySelector(
      "#document-editor_editor_viewerContainer"
    );

  if (!viewerContainer) {
    return;
  }

  var viewerContainerRect =
    viewerContainer.getBoundingClientRect();

  /*
   * Get the current DocumentEditor selection.
   *
   * This works for both:
   *   1. text selection
   *   2. empty selection / blinking caret
   */
  var editorElement =
    document.querySelector("#document-editor");

  var editorInstance =
    editorElement?.ej2_instances?.[0];

  var selection =
    editorInstance?.documentEditor?.selection;

  if (
    !selection ||
    !selection.start ||
    !selection.end ||
    typeof selection.getSelectionPage !== "function" ||
    typeof selection.getLineStartLeft !== "function" ||
    typeof selection.getTop !== "function"
  ) {
    return;
  }

  /*
   * ----------------------------------------------------------
   * Determine the position that represents the current caret.
   * ----------------------------------------------------------
   *
   * If text is selected:
   *   forward  -> end is where the mouse ended
   *   backward -> start is where the mouse ended
   *
   * If there is NO selection:
   *   start == end, so start is the current caret.
   */
  var activePosition = selection.isEmpty
    ? selection.start
    : (
        selection.isForward
          ? selection.end
          : selection.start
      );

  if (
    !activePosition ||
    !activePosition.currentWidget
  ) {
    return;
  }

  /*
   * Get the exact visual LineWidget containing the
   * current caret / selection end.
   */
  var lineWidget =
    typeof selection.getLineWidgetInternal === "function"
      ? selection.getLineWidgetInternal(
          activePosition.currentWidget,
          activePosition.offset,
          true
        )
      : activePosition.currentWidget;

  if (!lineWidget) {
    return;
  }

  /*
   * Get the page containing the current line.
   */
  var page =
    selection.getSelectionPage(activePosition);

  if (!page || !page.boundingRectangle) {
    return;
  }

  /*
   * Syncfusion's actual zoom factor.
   */
  var zoomFactor =
    selection.documentHelper?.zoomFactor || 1;

  /*
   * ----------------------------------------------------------
   * Get the current caret/selection document position.
   * ----------------------------------------------------------
   *
   * Syncfusion's getRect() converts TextPosition into the
   * document/page coordinate system.
   */
  var positionRect;

  if (typeof selection.getRect === "function") {
    positionRect =
      selection.getRect(activePosition);
  }

  if (
    !positionRect ||
    !Number.isFinite(positionRect.x) ||
    !Number.isFinite(positionRect.y) ||
    !activePosition.location
  ) {
    return;
  }

  /*
   * ----------------------------------------------------------
   * EXACT BEGINNING OF THE CURRENT VISUAL LINE
   * ----------------------------------------------------------
   */
  var lineStartLeft =
    selection.getLineStartLeft(lineWidget);

  if (!Number.isFinite(lineStartLeft)) {
    return;
  }

  /*
   * positionRect.x represents:
   *
   *   page X + caret location X * zoom
   *
   * Therefore derive the page X from the current position
   * and then add the exact line-start X.
   *
   * This avoids depending on ruler offsets or arbitrary
   * percentages of the ruler width.
   */
  var pageLeft =
    positionRect.x -
    (
      activePosition.location.x *
      zoomFactor
    );

  var documentLineStartX =
    pageLeft +
    (
      lineStartLeft *
      zoomFactor
    );

  /*
   * ----------------------------------------------------------
   * EXACT TOP OF THE CURRENT VISUAL LINE
   * ----------------------------------------------------------
   */
  var lineTop =
    selection.getTop(lineWidget);

  if (!Number.isFinite(lineTop)) {
    return;
  }

  /*
   * positionRect.y represents:
   *
   *   page top + caret location Y * zoom
   */
  var pageTop =
    positionRect.y -
    (
      activePosition.location.y *
      zoomFactor
    );

  var documentLineTop =
    pageTop +
    (
      lineTop *
      zoomFactor
    );

  /*
   * ----------------------------------------------------------
   * Convert DocumentEditor coordinates to viewport
   * coordinates.
   * ----------------------------------------------------------
   */
  var lineStartViewportX =
    viewerContainerRect.left +
    documentLineStartX -
    viewerContainer.scrollLeft;

  var lineStartViewportY =
    viewerContainerRect.top +
    documentLineTop -
    viewerContainer.scrollTop;

  /*
   * ----------------------------------------------------------
   * Convert viewport coordinates to #documentEditorDiv
   * coordinates.
   * ----------------------------------------------------------
   */
  var lineStartX =
    lineStartViewportX -
    positionContainerRect.left;

  var lineStartY =
    lineStartViewportY -
    positionContainerRect.top;

  /*
   * ----------------------------------------------------------
   * Position the FAB BEFORE the line.
   * ----------------------------------------------------------
   *
   * The button must never cover the first character.
   *
   * FAB:
   *
   *       ┌────────┐   4px   Text starts here
   *       │   AI   │          |
   *       └────────┘          |
   *       <------>            |
   *        24px
   */
  var buttonWidth = 24;
  var buttonHeight = 24;
  var lineGap = 4;

  var x =
    lineStartX -
    buttonWidth -
    lineGap;

  /*
   * Center the button vertically against the current
   * visual line.
   */
  var lineHeight =
    Number(lineWidget.height) *
    zoomFactor;

  var y =
    lineStartY +
    Math.max(
      0,
      (lineHeight - buttonHeight) / 2
    );

  return {
    x: Math.round(x),
    y: Math.round(y)
  };
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
  var aiButton =
    document.getElementsByClassName('ai-assist-btn')[0];

  if (!aiButton) {
    return { x: 200, y: 160 };
  }

  var buttonRect =
    aiButton.getBoundingClientRect();

  var popupGap = 4;

  return {
    x: Math.round(buttonRect.left),
    y: Math.round(buttonRect.bottom + popupGap)
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
  var statusBarTop = statusBarRect.top;
  var regeneratePopupHeight = 175;
  var sampleMargin = 8;
  var x = 130;
  var y = (statusBarTop - regeneratePopupHeight) - sampleMargin;
  return { x: x, y: y };
}