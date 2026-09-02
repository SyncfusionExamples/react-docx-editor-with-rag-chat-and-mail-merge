import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ContextMenuComponent } from '@syncfusion/ej2-react-navigations';
import { ToolbarComponent, ItemsDirective, ItemDirective } from '@syncfusion/ej2-react-navigations';
import { SplitterComponent, PanesDirective, PaneDirective } from '@syncfusion/ej2-react-layouts';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { ComboBoxComponent, MultiSelectComponent, CheckBoxSelection, Inject } from '@syncfusion/ej2-react-dropdowns';
import { DropDownButtonComponent } from '@syncfusion/ej2-react-splitbuttons';
import { FabComponent } from '@syncfusion/ej2-react-buttons';
import { createSpinner, showSpinner, hideSpinner } from '@syncfusion/ej2-popups';
import './editor-helpers.js';
import './AIPopup.css';
import { getAzureChatAIRequest } from './ai-models.js';
import { SERVICE_URL } from './service-config.js';


const GrammarOptions = [
  { Name: 'Subject-Verb Agreement' }, { Name: 'Tense Consistency' }, { Name: 'Pronoun Agreement' },
  { Name: 'Comma Usage' }, { Name: 'Parallel Structure' }, { Name: 'Misplaced Modifiers' },
  { Name: 'Dangling Modifiers' }, { Name: 'Word Choice' }, { Name: 'Redundancy' },
  { Name: 'Use of Articles' }, { Name: 'Punctuation Marks' }, { Name: 'Apostrophes for Possessives and Contractions' },
  { Name: 'Spelling Errors' },
];

const TranslateList = ['English', 'Simplified Chinese', 'Spanish', 'French', 'Arabic', 'Portuguese', 'Russian', 'Urdu', 'Indonesian', 'German', 'Japanese'];

const AiTask = { Generate: 'Generate', Rephrase: 'Rephrase', Translate: 'Translate', Grammar: 'Grammar' };

// Rich-formatting instruction appended to every AI system prompt so
// the generated content carries real Word formatting by the time it is
// pasted into the document (the HTML → SFDT conversion happens server
// side in POST /LoadString via WordDocument.LoadString(content,
// FormatType.Html)). Only tags the Syncfusion HTML importer understands
// are requested. Appended to each system prompt in buildPrompt so the
// rule is consistent across Generate / Rephrase / Translate / Grammar.
const RICH_TEXT_RULE = " Always respond in rich HTML format with real text formatting: use <h1> to <h4> tags for headings and subheadings, wrap paragraphs in <p> tags, wrap important key terms in <b> tags for bold, use <i> tags for italic emphasis, and <u> tags for underlined words. Use <ul> with <li> tags for bulleted lists and <ol> with <li> tags for numbered lists where suitable. Never apply formatting with markdown symbols such as ** or #. Do not include <html>, <head>, <body>, or ``` code fence tags.";

let aiResults = [];

export default function AIPopup({ editorRef, onShowChatPane, chatOpen, assistInitialPos, isAIEnabled, showChatFab = true }) {
  const [isSmartEditor, setIsSmartEditor] = useState(false);
  const [popupType, setPopupType] = useState('');
  const [tone, setTone] = useState('Professional');
  const [format, setFormat] = useState('Paragraph');
  const [length, setLength] = useState('Medium');
  const [translateTo, setTranslateTo] = useState('French');
  const [checks, setChecks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [outHtml, setOutHtml] = useState('');
  const [inHtml, setInHtml] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userPrompt, setUserPrompt] = useState('');
  const [dialogPos, setDialogPos] = useState({ x: '200', y: '160' });
  const cmAssistRef = useRef(null);
  const gearRef = useRef(null);
  const genDialogRef = useRef(null);
  const smartDialogRef = useRef(null);
  const textboxRef = useRef(null);
  const stopDlgRef = useRef(null);
  const [draftRange, setDraftRange] = useState({ start: null, end: null });
  const [stopVisible, setStopVisible] = useState(false);
  const [stopPos, setStopPos] = useState({ x: 0, y: 0 });
  const canceledRef = useRef(false);
  const onReplaceRef = useRef(null);
  const onCancelRef = useRef(null);
  const onRegenerateRef = useRef(null);
  const gearHeaderRef = useRef(null);
  const cmSettingsRef = useRef(null);
  const [genVisible, setGenVisible] = useState(false);
  const [smartVisible, setSmartVisible] = useState(false);
  const assistFabRef = useRef(null);
  const chatFabRef = useRef(null);
  const [viewerHost, setViewerHost] = useState(null);
  const [fabChatVisible, setFabChatVisible] = useState(false);
  const [fabAssistVisible, setFabAssistVisible] = useState(false);

  const [assistBtn, setAssistBtn] = useState({
    left: 80,
    top: 160,
    width: 24,
    height: 24,
    visible: true
  });

  const isContentGenerated = popupType === AiTask.Generate && !isSmartEditor && !!outHtml;

  const menuItems = [
    { text: 'Rephrase', iconCss: 'e-icons e-rephrase' },
    { text: 'Translate', iconCss: 'e-icons e-translate' },
    { text: 'Grammar', iconCss: 'e-icons e-grammar-check' },
  ];

  const settingsMenuItems = [
    {
      id: 'parent-tone', text: 'Choose Tone', items: [
        { id: 'child-tone-professional', text: 'Professional' },
        { id: 'child-tone-friendly', text: 'Friendly' },
        { id: 'child-tone-instructional', text: 'Instructional' },
        { id: 'child-tone-marketing', text: 'Marketing' },
        { id: 'child-tone-academic', text: 'Academic' },
        { id: 'child-tone-legal', text: 'Legal' },
        { id: 'child-tone-technical', text: 'Technical' },
        { id: 'child-tone-narrative', text: 'Narrative' },
        { id: 'child-tone-direct', text: 'Direct' }
      ]
    },
    {
      id: 'parent-format', text: 'Choose Format', items: [
        { id: 'child-format-paragraph', text: 'Paragraph' },
        { id: 'child-format-blog-post', text: 'Blog post' },
        { id: 'child-format-technical-documentation', text: 'Technical Documentation' },
        { id: 'child-format-report', text: 'Report' },
        { id: 'child-format-research-papers', text: 'Research Papers' },
        { id: 'child-format-tutorial', text: 'Tutorial' },
        { id: 'child-format-meeting-notes', text: 'Meeting Notes' }
      ]
    },
    {
      id: 'parent-size', text: 'Choose Size', items: [
        { id: 'child-size-short', text: 'Short' },
        { id: 'child-size-medium', text: 'Medium' },
        { id: 'child-size-long', text: 'Long' }
      ]
    }
  ];

  function buildPrompt(task, text, Regenerate, {
    tone = 'Professional',
    format = 'Paragraph',
    length = 'Medium',
    fromLang = 'English',
    toLang = 'French',
    checks = [],
    userHint = ''
  } = {}) {
    const content = (text || '').trim().toLowerCase();
    const toneValue = String(tone).toLowerCase();
    const formatValue = String(format).toLowerCase();
    const lengthValue = String(length).toLowerCase();
    switch (task) {
      case 'Generate': {
        const currentResult = getSelectionText();
        if (!Regenerate) {
          return (currentResult.length > 0) ? {
            messages: [
              { role: "system", content: `You are a helpful assistant. Your task is to analyze the provided text and revise it based on the provided suggestion: '${content}'. Please adjust the text to reflect a tone of '${toneValue}', formatted in '${formatValue}' style, and maintain a length of '${lengthValue}'. Always respond in proper HTML format, excluding <html>, <head>, and <body> tags.${RICH_TEXT_RULE}` },
              { role: "user", content: currentResult }
            ],
            model: "gpt-4",
          } : {
            messages: [
              { role: "system", content: `You are a helpful assistant. Your task is to generate content based on the provided text. Please adjust the text to reflect a tone of '${toneValue}', formatted in '${formatValue}' style, and maintain a length of '${lengthValue}'. Always respond in proper text format not a md format. Always respond in proper HTML format, excluding <html>, <head>, and <body> tags.${RICH_TEXT_RULE}` },
              { role: "user", content: content }
            ],
            model: "gpt-4",
          };
        } else {
          return {
            messages: [
              { role: "system", content: `You are a helpful assistant. Your task is to analyze the provided text and rephrase it. Please adjust the text to reflect a tone of '${toneValue}', formatted in '${formatValue}' style, and maintain a length of '${lengthValue}'. Always respond in proper HTML format, excluding <html>, <head>, and <body> tags.${RICH_TEXT_RULE}` },
              { role: "user", content: currentResult }
            ],
            model: "gpt-4",
          };
        }
      }

      case 'Rephrase': {
        if (!Regenerate) {
          return {
            messages: [
              { role: "system", content: `You are a helpful assistant. Your task is to analyze the provided text and rephrase it. Please adjust the text to reflect a tone of '${toneValue}', formatted in '${formatValue}' style, and maintain a length of '${lengthValue}'. Always respond in proper HTML format, excluding <html>, <head>, and <body> tags.` },
              { role: "user", content: content }
            ],
            model: "gpt-4",
          }
        } else {
          return {
            messages: [
              { role: "system", content: `You are a helpful assistant. Your task is to analyze the provided text and revise it based on the provided suggestion: '${aiResults}'. Please adjust the text to reflect a tone of '${toneValue}', formatted in '${formatValue}' style, and maintain a length of '${lengthValue}'. Always respond in proper HTML format, excluding <html>, <head>, and <body> tags.` },
              { role: "user", content: content }
            ],
            model: "gpt-4",
          }
        }
      }

      case 'Translate':
        return {
          messages: [
            { role: "system", content: `You are a helpful assistant. Your task is to translate the provided text into '${toLang}'. Always respond in proper HTML format, excluding <html> and <head> tags.` },
            { role: "user", content: content }
          ],
          model: "gpt-4",
        };

      case 'Grammar': {
        let value = '';
        let systemPrompt = '';
        if (checks.length > 0) {
          checks.forEach((item) => {
            value += item + ', ';
          });
          systemPrompt = `You are a helpful assistant. Your task is to analyze the provided text and perform the following grammar checks: ${value}. Please ensure that the revised text reflects these corrections. Always respond in proper HTML format, but do not include <html>, <head>, or <body> tags.`;
        } else {
          systemPrompt = "You are a helpful assistant. Your task is to analyze the provided text, check for and correct any grammatical errors, and rephrase it. Always respond in proper HTML format, but do not include <html>, <head>, or <body> tags.";
        }
        return {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: content }
          ],
          model: "gpt-4",
        };
      }
      default:
        return content;
    }
  }

  const generateContentOpen = (args) => {
    if (isContentGenerated) {
      const aiAssistBtnPosition = window?.getAIAssistPopupPosition?.();
      const updatedPosition = window?.getRegeneratePopupPosition?.();
      if (!aiAssistBtnPosition || !updatedPosition) return;
      var x = String(Math.round(aiAssistBtnPosition.x));
      var y = String(Math.round(updatedPosition.y));
      genDialogRef.current.position.X = x;
      genDialogRef.current.position.Y = y;
      setDialogPos({ x: x, y: y });
    }
  }

  const generateFooterTemplate = () => (
    <div style={{ display: 'inline-flex' }}>
      <ButtonComponent cssClass="e-primary" disabled={!outHtml || isLoading} onClick={onKeepGenerated}>
        Keep it
      </ButtonComponent>
      <ButtonComponent cssClass="e-primary e-regenerate-btn" iconCss="e-icons e-repeat" onClick={() => runTask(AiTask.Generate, true)}>
        Regenerate
      </ButtonComponent>
      <ButtonComponent cssClass='e-discard-btn' onClick={onDiscardGenerated}>Discard</ButtonComponent>
    </div>
  );

  useEffect(() => {
    if (!assistInitialPos) return;
    if (!isAIEnabled) {
      setFabAssistVisible(false);
      setFabChatVisible(false);
    }
    setAssistBtn(prev => ({
      ...prev,
      left: assistInitialPos.left ?? prev.left,
      top: assistInitialPos.top ?? prev.top,
      width: assistInitialPos.width ?? prev.width,
      height: assistInitialPos.height ?? prev.height
    }));
  }, [
    assistInitialPos?.left,
    assistInitialPos?.top,
    assistInitialPos?.width,
    assistInitialPos?.height
  ]);

  useEffect(() => {
    let mounted = true;
    const pick = () => {
      if (!mounted) return;
      // #documentEditorDiv is the wrapper div in App.jsx that contains
      // BOTH the DocumentEditorContainerComponent (id="document-editor")
      // and this AIPopup. The previous selector
      // '#document-editor #documentEditorDiv' was a DESCENDANT selector
      // — it looked for #documentEditorDiv INSIDE #document-editor,
      // which is backwards (#documentEditorDiv is the PARENT, not a
      // child). It never matched, so viewerHost stayed null forever,
      // and every downstream effect that depends on viewerHost
      // (positionAssistFabInitial, selectionChange wiring, mouse-down
      // listener) never fired. Correct selector: just #documentEditorDiv.
      const el = document.getElementById('documentEditorDiv');
      if (el && el !== viewerHost) {
        setViewerHost(el);
      }
    };
    pick();
    const id = setInterval(pick, 300);
    const onResize = () => pick();
    window.addEventListener('resize', onResize);
    return () => {
      mounted = false;
      clearInterval(id);
      window.removeEventListener('resize', onResize);
    };
  }, [viewerHost]);


  useEffect(() => {
    if (isAIEnabled) {
      setFabChatVisible(!chatOpen);
    }
    if (!chatOpen) {
      requestAnimationFrame(positionChatFabByHelper);
    }
  }, [chatOpen]);

  const getSelectionText = () => {
    try {
      return (editorRef?.current?.documentEditor?.selection?.text || '').trim();
    } catch { return ''; }
  };

  // Enable track changes on the DocumentEditor so that AI-generated
  // content inserted via insertContent() / replaceSelectionWithText()
  // appears as tracked changes (revisions) that the user can Accept or
  // Reject using the Review ribbon's Track Changes commands. Called
  // immediately before any AI content is written into the document so
  // only the AI's insertions are marked as revisions — not the user's
  // own typing.
  const enableTrackChangesForAIInsert = useCallback(() => {
    try {
      const editor = editorRef?.current?.documentEditor;
      if (!editor) return;
      editor.enableTrackChanges = true;
      editor.showRevisions = true;
    } catch { /* not all builds expose these props */ }
  }, []);

  const replaceSelectionWithText = async (html) => {
    try {
      const editor = editorRef?.current?.documentEditor;
      // Enable track changes so the AI-rephrased text shows up as a
      // revision the user can Accept or Reject.
      enableTrackChangesForAIInsert();
      if (editor?.selection?.text) editor.editor.delete();
      //editor?.editor?.insertText(text);      
      const res = await fetch(`${SERVICE_URL}LoadString`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: html })
      });
      if (!res.ok) {
        throw new Error('LoadString failed: ' + res.statusText);
      }
      const sfdtText = await res.text();
      let sfdt;
      try {
        sfdt = JSON.parse(sfdtText);
      } catch {
        sfdt = sfdtText;
      }
      try { editor.focusIn(); } catch { /* ignore */ }
      editor.editor.paste(sfdt);
      } catch (e) {
          alert('Replace failed: ' + e.message);
      }
  };

  const insertContent = async (out) => {
    if (canceledRef.current) return;
    closeStopDialog();
    setInHtml('');
    setOutHtml(out);
    try {
      const ed = editorRef?.current?.documentEditor;
      if (ed) {
        // Enable track changes so the AI-generated content shows up as
        // revisions the user can Accept or Reject from the Review ribbon.
        enableTrackChangesForAIInsert();
        await ed.editor.delete();
        ed.focusIn();
        const { end: caretEndBefore } = getOffsets();
        if (caretEndBefore != null) selectOffsets(caretEndBefore, caretEndBefore);
        //const plain = htmlToPlain(out);
        if (canceledRef.current) {
          return;
        }
        //ed.editor.insertText(plain);
        try {
          const res = await fetch(`${SERVICE_URL}LoadString`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: out })
          });
          if (!res.ok) {
            throw new Error('LoadString failed: ' + res.statusText);
          }
          const sfdtText = await res.text();
          let sfdt;
          try {
            sfdt = JSON.parse(sfdtText);
          } catch {
            sfdt = sfdtText;
          }
          try { ed.focusIn(); } catch { /* ignore */ }
          ed.editor.paste(sfdt);
        } catch (e) {
          console.error('Insert assistant response failed:', e);
        }
        ed.editor.insertText('\n');
        const { end: endAfter } = getOffsets();
        if (caretEndBefore != null && endAfter != null && endAfter >= caretEndBefore) {
          selectOffsets(caretEndBefore, endAfter);
          setDraftRange({ start: caretEndBefore, end: endAfter });
        } else {
          setDraftRange({ start: null, end: null });
        }
      }
    } catch (e) {
      alert('Insert failed: ' + (e?.message || e));
    }
    setUserPrompt('');
  }

  async function runTask(task, isRegenerate = false, toLanguage) {
    setIsLoading(true);
    canceledRef.current = false;
    var out = '';
    aiResults = [];
    try {
      let sourceText = '';
      let options = '';
      if (task === AiTask.Generate) {
        sourceText = userPrompt?.trim() || textboxRef.current.value?.trim();
        setUserPrompt('');
        window?.toggleSendIcon?.(false);
        openStopDialog();
        if (!isRegenerate && !sourceText) { setIsLoading(false); return; }
        options = buildPrompt(AiTask.Generate, sourceText, isRegenerate, { tone, format, length });
        setTimeout(async () => {
          try {
            out = await getAzureChatAIRequest(options);
            if (typeof out !== 'string' || !out.trim()) {
              throw new Error('Empty response from AI service.');
            }
            out = out.replace("```html\n", "").replace("\n```", "");
            insertContent(out, isRegenerate);
          } catch (genErr) {
            // The Generate path runs inside a setTimeout so any thrown
            // error would otherwise be swallowed by the timer. Surface
            // it the same way the inline paths do and tear down the
            // stop dialog + spinner so the UI is not stuck.
            console.error('Generate request failed:', genErr);
            if (!canceledRef.current) {
              alert('AI error: ' + (genErr?.message || genErr));
            }
            closeStopDialog();
            hideSpinner(document.getElementById('spinner-container'));
            setIsLoading(false);
            canceledRef.current = false;
          }
        }, 1000);
      } else {
        sourceText = getSelectionText();
        if (!sourceText || sourceText.trim().length < 3) {
          setIsLoading(false);
          return;
        }
        if (task === AiTask.Rephrase) {
          const userHint = isRegenerate ? '' : (userPrompt?.trim() || '');
          for (var i = 0; i < 3; i++) {
            options = buildPrompt(AiTask.Rephrase, sourceText, isRegenerate, { tone, format, length, userHint });
            out = await getAzureChatAIRequest(options);
            if (typeof out !== 'string' || !out.trim()) {
              throw new Error('Empty response from AI service.');
            }
            out = out.replace("```html\n", "").replace("\n```", "");
            if (!aiResults.includes(out)) {
              aiResults.push(out);
            }
          }
        }
        else if (task === AiTask.Grammar) {
          options = buildPrompt(AiTask.Grammar, sourceText, isRegenerate, { checks: checks });
          out = await getAzureChatAIRequest(options);
          if (typeof out !== 'string' || !out.trim()) {
            throw new Error('Empty response from AI service.');
          }
          out = out.replace("```html\n", "").replace("\n```", "");
        }
        else {
          var toLang = toLanguage || translateTo;
          options = buildPrompt(AiTask.Translate, sourceText, false, { fromLang: 'English', toLang: toLang });
          out = await getAzureChatAIRequest(options);
          if (typeof out !== 'string' || !out.trim()) {
            throw new Error('Empty response from AI service.');
          }
          out = out.replace("```html\n", "").replace("\n```", "");
        }
        out = aiResults.length > 0 ? aiResults[0] : out;
        // Display content directly — no word-by-word diff comparison.
        // The old highlightDifferences() path wrapped every word in
        // <span class="e-original-word"> (red + strikethrough), which read
        // like track-changes markup in the smart editor dialog. Show the
        // plain source text on the left and the AI output as-is on the
        // right instead.
        setInHtml(`<p>${sourceText}</p>`);
        setOutHtml(out);
        setSuggestions(prev => {
          setCurrentIndex(0);
          return aiResults;
        });
        hideSpinner(document.getElementById('spinner-container'));
      }
    } catch (e) {
      // Any thrown error from the Rephrase / Translate / Grammar paths
      // (including the explicit "Empty response" throws above) lands
      // here. We MUST tear down the spinner and close the smart-editor
      // dialog so the user is not trapped behind a permanently spinning
      // overlay. The catch was previously only an alert, leaving the
      // spinner running and the dialog visible until the user manually
      // closed it.
      console.error('AI request failed:', e);
      if (!canceledRef.current) {
        alert('AI error: ' + (e?.message || e));
      }
      hideSpinner(document.getElementById('spinner-container'));
      // Force-close every dialog that this task may have opened. The
      // Rephrase / Translate / Grammar flows open the smart-editor
      // dialog via setSmartVisible(true); the spinner lives in the
      // same dialog. Closing the dialog also tears down the spinner
      // element so no orphaned spinner keeps spinning.
      setSmartVisible(false);
      setStopVisible(false);
      setGenVisible(false);
      setInHtml('');
      setOutHtml('');
      setSuggestions([]);
      setCurrentIndex(0);
      aiResults = [];
      canceledRef.current = false;
    } finally {
      setIsLoading(false);
    }
  }

  const onMenuSelect = (args) => {
    const sel = args.item?.text;
    const action = sel === 'Rephrase' ? AiTask.Rephrase : (sel === 'Translate' ? AiTask.Translate : AiTask.Grammar);
    if (!sel) return;
    setPopupType(action);
    setSuggestions([]); setCurrentIndex(0); setUserPrompt('');
    setIsSmartEditor(true);
    setInHtml(`<p>${getSelectionText()}</p>`);
    setOutHtml('');
    showSpinner(document.getElementById('spinner-container'));
    setSmartVisible(true);
    setTimeout(() => runTask(action), 100);
  };

  const positionAIAssistDialog = () => {
    const button = document.querySelector('.ai-assist-btn');
    const dialog = document.querySelector('.ai-assist-dialog');

    if (!button || !dialog) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();

    dialog.style.position = 'fixed';
    dialog.style.left = `${Math.round(buttonRect.left)}px`;
    dialog.style.top = `${Math.round(buttonRect.bottom + 4)}px`;
    dialog.style.transform = 'none';
  };

  const openAssistMenu = (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    const sel = getSelectionText();
    if (!sel) {
      if (stopVisible) return;
      setPopupType(AiTask.Generate);
      setIsSmartEditor(false);
      setInHtml(''); setOutHtml(''); setUserPrompt(''); setSuggestions([]);
      setGenVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          positionAIAssistDialog();
        });
      });
      return;
    }
    if (genVisible || stopVisible) return;
    const aiPos = window.getAIButtonPosition ? window.getAIButtonPosition() : null;
    if (aiPos && cmAssistRef.current?.open) {
      cmAssistRef.current.open(Math.round(aiPos.y), Math.round(aiPos.x + 24));
      return;
    }
    const el = assistFabRef.current?.element || assistFabRef.current;
    if (!el || !cmAssistRef.current?.open) return;
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + window.scrollX + 24);
    const y = Math.round(r.top + window.scrollY);
    cmAssistRef.current.open(x, y);
  };

  const openChat = () => {
    document.querySelector('.e-ribbon-help-template')?.classList.add('e-hide');
    document.querySelector('.e-fab.ai-assist-btn')?.classList.add('e-hide');
    document.querySelector('.document-editor-container')?.classList.add('e-hide');
    setFabChatVisible(false);
    onShowChatPane?.();
  };

  // Read the latest visible output HTML directly from the rendered DOM
  // pane instead of relying on the React `outHtml` state. The user is
  // looking at the DOM pane; if for any reason React state is a render
  // behind (Syncfusion ButtonComponent disabled-flag re-eval, footer
  // template caching, or a state-update race inside runTask), the
  // captured `outHtml` in the click closure can be empty, causing the
  // first click to be a no-op and forcing the user to click again. By
  // grabbing the current pane innerHTML at click time we always replace
  // exactly what the user sees on the very first click.
  const getCurrentOutHtmlFromPane = () => {
    try {
      const pane = document.getElementById('ai-smart-output-pane');
      if (pane && pane.innerHTML && pane.innerHTML.trim().length > 0) {
        return pane.innerHTML;
      }
    } catch { /* fall through */ }
    return outHtml;
  };

  const onReplace = async () => {
    // Always read the latest visible content from the DOM pane. The
    // React `outHtml` state can lag by one render (footer templates
    // in Syncfusion DialogComponent are function-evaluated; combined
    // with state-update batching, the click closure can capture a
    // stale value, which is what caused the "two clicks to replace"
    // bug). The DOM pane is the single source of truth for what the
    // user is currently looking at — it gets updated synchronously by
    // `dangerouslySetInnerHTML` whenever `outHtml` changes, so reading
    // it here guarantees the click works on the first try.
    const latestHtml = getCurrentOutHtmlFromPane();
    if (!latestHtml || !latestHtml.trim()) {
      // Nothing visible to replace — close the dialog silently.
      setSmartVisible(false);
      return;
    }
    await replaceSelectionWithText(latestHtml);
    setSmartVisible(false);
  };

  const prevSuggestion = () => {
    setCurrentIndex(i => {
      const next = Math.max(i - 1, 0);
      setOutHtml(suggestions[next] || outHtml);
      return next;
    });
  };

  const nextSuggestion = () => {
    setCurrentIndex(i => {
      const next = Math.min(i + 1, suggestions.length - 1);
      setOutHtml(suggestions[next] || outHtml);
      return next;
    });
  };

  const headerText = useMemo(() => {
    if (popupType === AiTask.Rephrase) return 'Rephrased Content';
    if (popupType === AiTask.Translate) return 'Translate';
    if (popupType === AiTask.Grammar) return 'Grammar Check';
    return 'AI Assistant';
  }, [popupType]);

  const openHeaderSettingsMenu = () => {
    const btn = gearHeaderRef.current;
    if (!btn || !cmSettingsRef.current) return;
    openMenuBesideButton(btn, cmSettingsRef);
  };

  const UpdateIconCss = (items) => {
    items.forEach((item) => {
      const id = item.id?.toLowerCase() || "";
      var isChild = id.includes("child");

      var match = id.includes(tone.toLowerCase()) ||
        id.includes(format.split(" ").join('-').toLowerCase()) ||
        id.includes(length.toLowerCase());

      item.iconCss = (isChild && match) ? "e-icons e-check" : null;

      if (Array.isArray(item.items) && item.items.length) {
        UpdateIconCss(item.items);
      }
    })
  }

  const onSettingsMenuSelect = (args) => {
    const id = args.item?.id || '';
    const text = args.item?.text || '';
    if (id.startsWith('child')) {
      if (id.startsWith('child-tone-')) setTone(text);
      else if (id.startsWith('child-format-')) setFormat(text);
      else if (id.startsWith('child-size-')) setLength(text);
      UpdateIconCss(settingsMenuItems);
    }
  };

  const openGearMenu = (args) => {
    const btn = gearRef.current;
    if (!btn || !cmSettingsRef.current) return;
    openMenuBesideButton(btn, cmSettingsRef);
  };

  const onSend = () => {
    runTask(AiTask.Generate);
  };

  const changeLanguage = (e) => {
    setTranslateTo(e.value);
    setTimeout(() => {
      runTask(AiTask.Translate, false, e.value);
    }, 100);
  };

  const smartHeaderTemplate = () => (
    <div className="e-custom-header">
      <div className="e-popup-header">{headerText}</div>
      {popupType === AiTask.Rephrase && (
        <div className="e-header-toolbar">
          <ToolbarComponent cssClass="e-ai-assist-toolbar" height="auto" width="100%">
            <ItemsDirective>
              <ItemDirective
                prefixIcon="e-icons e-chevron-left-small"
                tooltipText="Show the previous suggestion"
                disabled={currentIndex <= 0}
                click={prevSuggestion}
              />
              <ItemDirective
                cssClass="page-count"
                text={`${Math.min(currentIndex + 1, suggestions.length)} of ${Math.max(suggestions.length, 1)}`}
              />
              <ItemDirective
                prefixIcon="e-icons e-chevron-right-small"
                tooltipText="Show the next suggestion"
                disabled={currentIndex + 1 >= suggestions.length}
                click={nextSuggestion}
              />
              <ItemDirective
                template={() => (
                  <DropDownButtonComponent
                    ref={gearHeaderRef}
                    id='ai-smart-settings-btn'
                    iconCss="e-icons e-settings"
                    cssClass="e-caret-hide settings-btn"
                    items={[{ text: 'trigger' }]}
                    beforeOpen={(args) => { args.cancel = true; openHeaderSettingsMenu(); }}
                  />
                )}
              />
            </ItemsDirective>
          </ToolbarComponent>
        </div>
      )}
    </div>
  );

  const positionChatFabByHelper = () => {
    const position = window?.getAIChatBtnPosition?.();
    if (!position) return;
    window?.setAiAssistBtnPosition?.(Math.round(position.x), Math.round(position.y));
  };

  const onChatFabCreated = () => {
    requestAnimationFrame(positionChatFabByHelper);
    window.addEventListener('resize', positionChatFabByHelper);
  };

  useEffect(() => {
    createSpinner({
      target: document.getElementById('spinner-container'),
    });
    return () => window.removeEventListener('resize', positionChatFabByHelper);
  }, []);

  // Keep the handler refs in sync with the latest closures every
  // render. The body-rendered buttons below use these refs as their
  // onClick so the latest implementation is always called (no stale
  // closure issue). The buttons live in the dialog body (not in
  // `footerTemplate`) so React's normal event delegation handles the
  // click — no first-click-lost problem.
  onReplaceRef.current = onReplace;
  onCancelRef.current = () => setSmartVisible(false);
  onRegenerateRef.current = () => {
    showSpinner(document.getElementById('spinner-container'));
    const task = popupType === AiTask.Rephrase ? AiTask.Rephrase : AiTask.Grammar;
    setTimeout(() => runTask(task, true), 10);
  };

  useEffect(() => {
    // Reserved for future per-dialog lifecycle hooks.
  }, [smartVisible]);

  const positionAssistFabInitial = () => {
    try {
      const pos = window?.getAIAssistBtnPosition?.();
      if (!pos) return;
      setAssistBtn(s => ({
        ...s,
        left: Math.round(pos.x),
        top: Math.round(pos.y),
        width: 24,
        height: 24,
        visible: true
      }));
    } catch { }
  };

  useEffect(() => {
    if (viewerHost) positionAssistFabInitial();
  }, [viewerHost]);

  useEffect(() => {
    if (editorRef && editorRef?.current) {
      const ed = editorRef?.current?.documentEditor;
      if (!ed) return;
      const onSelectionChange = () => {
        try {
          // When the AI pointer is switched OFF from the top bar, keep
          // it hidden — do not let caret/selection movement re-show it.
          if (!isAIEnabled) return;
          const pos = window?.getAIAssistBtnPosition?.();
          if (pos) {
            setAssistBtn(prev => ({
              ...prev,
              left: Math.round(pos.x),
              top: Math.round(pos.y)
            }));
            // Explicitly keep the button visible — the AI Assist
            // button must stay on screen during text selection so
            // the user can click it to open the context menu
            // (Rephrase / Translate / Grammar). Without this, some
            // state transitions can leave fabAssistVisible=false
            // and the button disappears when text is selected.
            setFabAssistVisible(true);
          }
        } catch { }
      };
      ed.selectionChange = onSelectionChange;

    }
  }, [editorRef, viewerHost, isAIEnabled]);

  useEffect(() => {
    const viewerEl =
      viewerHost || document.getElementById('documentEditorDiv');
    if (!viewerEl) return;

    let tracking = false;

    const onMouseDown = () => {
      tracking = true;
      try {
        const sel = editorRef?.current?.documentEditor?.selection?.text || '';
        if (sel && isSmartEditor) setIsSmartEditor(false);
      } catch { }
    };

    const onMouseUp = () => {
      if (!tracking) return;
      tracking = false;

      useEffect(() => {
        if (!editorRef?.current) {
          return;
        }

        const ed = editorRef.current.documentEditor;

        if (!ed) {
          return;
        }

        const onSelectionChange = () => {
          try {
            const selection = ed.selection;

            const pos =
              window?.getAIAssistBtnPosition?.(selection);

            if (pos) {
              setAssistBtn(prev => ({
                ...prev,
                left: Math.round(pos.x),
                top: Math.round(pos.y)
              }));
            }
          } catch { }
        };

        ed.selectionChange = onSelectionChange;
      }, [editorRef, viewerHost]);
    };

    viewerEl.addEventListener('mousedown', onMouseDown, false);
    viewerEl.addEventListener('mouseup', onMouseUp, false);
    return () => {
      viewerEl.removeEventListener('mousedown', onMouseDown, false);
      viewerEl.removeEventListener('mouseup', onMouseUp, false);
    };
  }, [viewerHost, isSmartEditor, editorRef]);

  useEffect(() => {
    if (!genVisible) return;

    const isInside = (el, target) => {
      if (!el || !target) return false;
      if (el.contains(target)) return true;
      const path = typeof target.composedPath === 'function' ? target.composedPath() : [];
      return path.includes(el);
    };

    const onOutsidePress = (e) => {
      try {
        const dlgEl = genDialogRef.current?.element;
        const settingsEl = document.querySelector('.ai-settings-menu');

        const inDialog = isInside(dlgEl, e.target);
        const inSettings = isInside(settingsEl, e.target);

        if (!inDialog && !inSettings) {
          setGenVisible(false);
        }
      } catch { }
    };

    document.addEventListener('pointerdown', onOutsidePress, true);
    document.addEventListener('touchstart', onOutsidePress, { capture: true, passive: true });
    document.addEventListener('mousedown', onOutsidePress, true);
    return () => {
      document.removeEventListener('pointerdown', onOutsidePress, true);
      document.removeEventListener('touchstart', onOutsidePress, true);
      document.removeEventListener('mousedown', onOutsidePress, true);
    };
  }, [genVisible]);

  function openMenuBesideButton(btnRef, cmRef) {
    if (!btnRef || !cmRef?.current?.open) return;
    const rect = btnRef.element.getBoundingClientRect();
    const y = rect.bottom;
    const x = rect.left;
    cmRef.current.open(Math.round(y), Math.round(x));
  }

  const TextBoxCreated = () => {
    const inst = textboxRef.current;
    if (!inst) return;
    const isDisabled = userPrompt?.trim() ? '' : 'e-disabled'
    const className = 'e-icons e-send ' + isDisabled;
    inst.addIcon('append', className);
    const wrapper = inst.element?.parentElement;
    const icon = wrapper?.querySelector('.e-input-group-icon.e-send');
    if (icon) {
      icon.setAttribute('title', 'Generate');
      icon.setAttribute('role', 'button');
      icon.setAttribute('aria-label', 'Generate');
      icon.addEventListener('click', onSend);
    }
    return;
  }

  const textboxValueChange = (e) => {
    const value = e.value;
    setUserPrompt(value);
    window?.toggleSendIcon?.(value.length > 0);
  }

  const htmlToPlain = (html) =>
    (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const getDE = () => editorRef?.current?.documentEditor || null;

  const getOffsets = () => {
    const ed = getDE();
    const sel = ed?.selection;
    try {
      const start = sel.startOffset;
      const end = sel?.endOffset;
      return { start, end };
    } catch {
      return { start: null, end: null };
    }
  };

  const selectOffsets = (start, end) => {
    const sel = getDE()?.selection;
    if (sel?.select && start != null && end != null) sel.select(start, end);
  };

  const onKeepGenerated = () => {
    const ed = getDE();
    const { end } = draftRange || {};
    if (ed && end != null) {
      selectOffsets(end, end);
    }
    setDraftRange({ start: null, end: null });
    setGenVisible(false);
  };

  const onDiscardGenerated = () => {
    const ed = getDE();
    const { start, end } = draftRange || {};
    if (ed && start != null && end != null) {
      selectOffsets(start, end);
      ed.editor.delete();
    }
    setDraftRange({ start: null, end: null });
    setGenVisible(false);
  };

  const positionGeneratingDraftDialog = () => {
    const button = document.querySelector('.ai-assist-btn');
    const dialog = document.querySelector('.e-stop-generating-dialog');

    if (!button || !dialog) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();

    dialog.style.position = 'fixed';
    dialog.style.left = `${Math.round(buttonRect.left)}px`;
    dialog.style.top = `${Math.round(buttonRect.bottom + 4)}px`;
    dialog.style.transform = 'none';
  };

  const openStopDialog = () => {
    setGenVisible(false);
    setStopVisible(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        positionGeneratingDraftDialog();
      });
    });
  };

  const closeStopDialog = () => {
    setGenVisible(true);
    setStopVisible(false);
  }

  const stopContentTemplate = () => (
    <div className="ai-stop-popup">
      <span className="stop-popup-text-icon e-icons"></span>
      <span className="stop-popup-text">Generating a draft...</span>
    </div>
  );

  useEffect(() => {
    if (!isAIEnabled) {
      setFabAssistVisible(false);
      setFabChatVisible(false);
    } else {
      setFabAssistVisible(isAIEnabled);
      setFabChatVisible(isAIEnabled);
    }
  }, [isAIEnabled]);

  const shouldTick = (id) => {
    const key = (id || '').toLowerCase();
    const toneKey = (tone || '').toLowerCase();
    const formatKey = (format || '').toLowerCase().replace(/\s+/g, '-');
    const lengthKey = (length || '').toLowerCase();
    const isChild = key.includes('child');
    const match = key.includes(toneKey) || key.includes(formatKey) || key.includes(lengthKey);
    return isChild && match;
  };

  const onSettingsBeforeItemRender = (args) => {
    const id = args.item?.id || '';
    const li = args.element;
    const hasIcon = !!li.querySelector('.e-menu-icon');
    if (shouldTick(id)) {
      if (!hasIcon) {
        const icon = document.createElement('span');
        icon.className = 'e-menu-icon e-icons e-check';
        li.insertBefore(icon, li.firstChild);
        li.className = li.className + ' e-selected';
      } else {
        li.querySelector('.e-menu-icon').className = 'e-menu-icon e-icons e-check';
      }
    }
  };

  const floatFocus = (args) => {
    args.target.parentElement.classList.add("e-input-focus");
  };

  const floatBlur = (args) => {
    args.target.parentElement.classList.remove('e-input-focus');
  };

  return (
    <div id="ai-assist">
      <div id="ai-assist-menu-anchor" style={{ position: 'fixed' }} />
      <div id="ai-settings-menu-anchor" style={{ position: 'fixed' }} />
      <FabComponent
        ref={assistFabRef}
        cssClass="ai-assist-btn"
        iconCss="e-icons e-ai-assist-btn"
        title={isSmartEditor ? 'Refine the content' : 'Generate new content'}
        visible={fabAssistVisible}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={openAssistMenu}
        style={{
          position: 'absolute',
          left: `${assistBtn.left}px`,
          top: `${assistBtn.top}px`,
          width: `${assistBtn.width}px`,
          height: `${assistBtn.height}px`
        }}
      />
      <FabComponent
        ref={chatFabRef}
        cssClass="ai-chat-btn"
        iconCss="e-icons e-ai-chat-btn"
        title="Summarization and Q&A"
        visible={showChatFab && fabChatVisible}
        created={onChatFabCreated}
        onClick={openChat}
      />

      <DialogComponent
        ref={genDialogRef}
        visible={genVisible}
        target={'#ai-assist'}
        header={isContentGenerated ? 'Generate content' : undefined}
        footerTemplate={isContentGenerated ? generateFooterTemplate : undefined}
        position={{ X: 0, Y: 0 }}
        open={() => {
            requestAnimationFrame(() => {
                positionAIAssistDialog();
            });
        }}
        showCloseIcon={false}
        isModal={false}
        width={'45%'}
        beforeOpen={generateContentOpen}
        cssClass={isContentGenerated ? 'ai-rewrite-dialog ai-assist-dialog' : `ai-generate-dialog ai-assist-dialog`}
      >
        <div className="ai-dialog-body">
          <div className="ai-generate-content">
            <div className="e-de-parent gc-row ai-gc-row">
              <div className="ai-input-wrapper">
                <TextBoxComponent
                  ref={textboxRef}
                  id="e-de-editableDiv"
                  placeholder="Type a prompt"
                  cssClass="ai-input-box"
                  value={userPrompt}
                  input={textboxValueChange}
                  created={TextBoxCreated}
                  type='text'
                  onFocus={floatFocus}
                  onBlur={floatBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && userPrompt?.trim()) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                />
              </div>
              <DropDownButtonComponent
                ref={gearRef}
                id='ai-assist-settings-btn'
                iconCss="e-icons e-settings"
                cssClass="e-caret-hide settings-btn"
                beforeOpen={(args) => { args.cancel = true; openGearMenu(); }}
              />
            </div>
          </div>
        </div>
      </DialogComponent>

      <DialogComponent
        ref={smartDialogRef}
        visible={smartVisible}
        target={'#ai-assist'}
        header={smartHeaderTemplate}
        showCloseIcon={true}
        isModal={true}
        width={'70%'}
        close={() => setSmartVisible(false)}
        cssClass="e-smart-editor-dialog">
        <div className="ai-dialog-body">
          <SplitterComponent
            orientation="Vertical"
            separatorSize={0}
            className={`ai-splitter e-vertical-smart ${popupType === AiTask.Rephrase ? 'e-smart-rephrase' : popupType === AiTask.Translate ? 'e-smart-translate' : 'e-smart-grammar'}`}
          >
            <PanesDirective>
              <PaneDirective size="50%" content={() =>
                <div className="pane-content">
                  <div className="pane-content-header">
                    <label className="translate-label">{popupType === AiTask.Translate ? 'Translate from:' : 'From:'}</label>
                  </div>
                  <div className="pane-text-area" dangerouslySetInnerHTML={{ __html: inHtml }} />
                </div>
              } />
              <PaneDirective size="50%" content={() =>
                <div className="pane-content">
                  <div className="pane-content-header">
                    <label className="translate-label">
                      {popupType === AiTask.Translate ? 'Translate to:' : 'To:'}
                    </label>
                    {popupType === AiTask.Translate && (
                      <ComboBoxComponent
                        dataSource={TranslateList}
                        value={translateTo}
                        change={changeLanguage}
                        width="160px"
                        placeholder="Translate to"
                        popupHeight="220px"
                        showClearButton={false}
                      />
                    )}
                    {popupType === AiTask.Grammar && (
                      <MultiSelectComponent
                        dataSource={GrammarOptions}
                        fields={{ text: 'Name', value: 'Name' }}
                        value={checks}
                        change={(e) => setChecks(e.value || [])}
                        mode="CheckBox"
                        showSelectAll={true}
                        showDropDownIcon={true}
                        allowFiltering={true}
                        placeholder="e.g. Spelling Errors"
                        width="180px"
                        popupHeight="260px"
                      >
                        <Inject services={[CheckBoxSelection]} />
                      </MultiSelectComponent>
                    )}
                  </div>
                  <div id="ai-smart-output-pane" className="pane-text-area" dangerouslySetInnerHTML={{ __html: outHtml }} />
                </div>
              } />
            </PanesDirective>
          </SplitterComponent>
          <div id="spinner-container" className="spinner-target"></div>
          <div className="ai-smart-footer-inline">
            <ButtonComponent
              cssClass="e-primary ai-smart-replace-btn"
              disabled={isLoading}
              onClick={() => onReplaceRef.current && onReplaceRef.current()}
            >
              Replace
            </ButtonComponent>
            {popupType === AiTask.Rephrase && (
              <ButtonComponent
                cssClass="e-outline e-regenerate-btn ai-smart-regenerate-btn"
                iconCss="e-icons e-repeat"
                onClick={() => onRegenerateRef.current && onRegenerateRef.current()}
                isPrimary
              >
                Regenerate
              </ButtonComponent>
            )}
            {popupType === AiTask.Grammar && (
              <ButtonComponent
                cssClass="e-outline e-regenerate-btn ai-smart-regenerate-btn"
                iconCss="e-icons e-repeat"
                onClick={() => onRegenerateRef.current && onRegenerateRef.current()}
                isPrimary
              >
                Regenerate
              </ButtonComponent>
            )}
            <ButtonComponent
              cssClass="ai-smart-cancel-btn"
              onClick={() => onCancelRef.current && onCancelRef.current()}
            >
              Cancel
            </ButtonComponent>
          </div>
        </div>
      </DialogComponent>

      <DialogComponent
        ref={stopDlgRef}
        cssClass="e-stop-generating-dialog"
        target={'#ai-assist'}
        visible={stopVisible}
        isModal={false}
        showCloseIcon={false}
        width="30%"
        position={{ X: 0, Y: 0 }}
        open={() => {
          requestAnimationFrame(() => {
            positionGeneratingDraftDialog();
          });
        }}
        content={stopContentTemplate}
      >
      </DialogComponent>

      <ContextMenuComponent
        ref={cmAssistRef}
        cssClass="ai-smart-menu"
        items={menuItems}
        select={onMenuSelect}
      />

      <ContextMenuComponent
        ref={cmSettingsRef}
        cssClass="ai-settings-menu"
        items={settingsMenuItems}
        fields={{ text: 'text', id: 'id', children: 'items' }}
        beforeItemRender={onSettingsBeforeItemRender}
        select={onSettingsMenuSelect}
      />
    </div>
  );
}
