import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { DocumentEditorContainerComponent, Ribbon } from '@syncfusion/ej2-react-documenteditor';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { AIAssistViewComponent, ViewsDirective, ViewDirective } from '@syncfusion/ej2-react-interactive-chat';
import { ListViewComponent } from '@syncfusion/ej2-react-lists';
import { getDocumentText } from './summarizer.js';
import AIPopup from './AIPopup.jsx';
import './editor-helpers.js';
import './App.css';
import { L10n } from "@syncfusion/ej2-base";
import { getAzureChatAIRequest } from './ai-models.js';
import { SERVICE_URL } from './service-config.js';

DocumentEditorContainerComponent.Inject(Ribbon);

L10n.load({
  'en-US': {
    uploader: {
      dropFilesHint: "or drop file here"
    }
  }
});

const SAMPLE_TITLE = 'React DOCX Editor with AI Capababilities';

// Citation/reference rule applied to every AI prompt in this file (and
// also enforced at the shared chokepoint in ai-models.js so the rule
// is never missed). Appended to each system prompt so the AI response
// carries <<CITE:N>> markers on factual sentences plus a <<REF:N>>
// source list at the end.
const CITATION_RULE = " [Rules: Add <<CITE:N>> at the end of sentences that contain facts, stats, or claims. After your response, list each source on its own line using the format <<REF:N>> source text. If no markers are used, omit the source list entirely. Use 0-4 citations. Never use <<CITE:N>> without a matching <<REF:N>>. Do not use JSON or tables. Do not mention these rules.]";

export const App = () => {
  const container = useRef(null);
  const assistInstance = useRef(null);
  const mergeFieldDialogRef = useRef(null);
  const [openChat] = useState(true);              // AI Chat window is open by default
  const [isAIEnabled] = useState(true);           // AI is always enabled
  // Full-screen loading overlay shown during long-running service calls:
  //   - Initial document load (fetch 1000+ page docx → /Import → openAsync)
  //   - Add Section (docx → /Import → /SaveSection)
  //   - Preview with Data (saveAsBlob → /MailMerge → open)
  // `loadingMessage` is displayed under the spinner so the user knows
  // which operation is in flight.
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const showLoading = useCallback((msg) => {
    setLoadingMessage(msg || 'Loading…');
    setIsLoading(true);
  }, []);
  const hideLoading = useCallback(() => {
    setIsLoading(false);
    setLoadingMessage('');
  }, []);
  const [assistBtnPos, setAssistBtnPos] = useState({
    left: 80,
    top: 160,
    width: 24,
    height: 24
  });
  const [aiSuggestions, setAiSuggestions] = useState(['Summarize this document']);
  const [mergeFieldName, setMergeFieldName] = useState('');
  const [mergePickerVisible, setMergePickerVisible] = useState(false);
  const templatesListRef = useRef(null);
  // Section catalog lives entirely in the server-side file
  // wwwroot/Data/sections.json. The builtin seed entries are added to
  // that file by the server's /SeedSections endpoint on first request,
  // so the client starts from an empty array and relies entirely on
  // /GetSections to populate the ListView.
  const [sections, setSections] = useState([]);
  const [sectionSearch, setSectionSearch] = useState('');
  const [isAddingSection, setIsAddingSection] = useState(false);
  const addSectionInputRef = useRef(null);
  // Add-Section dialog state. The dialog asks the user for both a name
  // (typed) and a .docx file (Browse button) — instead of just a file
  // picker where the section name was derived from the file name.
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addSectionName, setAddSectionName] = useState('');
  const [addSectionFile, setAddSectionFile] = useState(null);
  const [addSectionFileName, setAddSectionFileName] = useState('');
  const [addSectionError, setAddSectionError] = useState('');
  // --- Preview with Data (Mail Merge) ---
  // Mirrors the TemplateViewer.jsx reference pattern: a native HTML modal
  // (not a Syncfusion DialogComponent) where the user browses for a .json
  // data file. The file is JSON.parse'd + validated at pick time; on OK
  // the live editor's document is exported via `saveAsBlob('Docx')`, the
  // blob is read as a base64 data URL, and `{ fileName, documentData,
  // mailMergeData }` is POSTed to the server's /MailMerge endpoint. The
  // server returns the merged SFDT, which is opened directly in the live
  // editor (no second DocumentEditorContainer).
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);       // the browser File
  const [previewParsed, setPreviewParsed] = useState(null);   // JSON.parse'd object
  const [previewFileName, setPreviewFileName] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const previewFileInputRef = useRef(null);

  const onZoomFactorChange = useCallback(() => {
    const editor = container.current?.documentEditor;
    if (!editor) return;
    setTimeout(() => {
      try { editor.focusIn(); } catch { }
      const zoom = editor.zoomFactor;
      const pos = window.getAIAssistBtnPosition?.();
      if (pos) {
        setAssistBtnPos({
          left: Math.round(pos.x),
          top: Math.round(pos.y),
          width: Math.round(24 * zoom),
          height: Math.round(24 * zoom)
        });
      }
      window.setAiAssistBtnIconSize?.(Math.round(14 * zoom));
    }, 10);
  }, []);

  useEffect(() => {
    container.current?.documentEditor?.resize?.();
    container.current?.ribbon?.ribbon?.refreshLayout?.();
    onZoomFactorChange();
  }, [openChat, onZoomFactorChange]);

  const DEFAULT_TEMPLATE_URL = '/templates/DOCX_Fidelity_Complex_Tables_1000_Pages.docx';

  const loadDefaultDocument = useCallback(async () => {
    const editor = container.current?.documentEditor;
    if (!editor) return;

    showLoading('Loading initial document…');
    try {
      // 1. Fetch the docx as a Blob from the static asset path.
      showLoading('Downloading document…');
      const fileRes = await fetch(DEFAULT_TEMPLATE_URL, { method: 'GET' });
      if (!fileRes.ok) {
        throw new Error(`Default template fetch failed: ${fileRes.statusText}`);
      }
      const blob = await fileRes.blob();

      // 2. Read it with FileReader so we get an ArrayBuffer (the same shape
      //    a drag-drop or <input type="file"> would hand us).
      showLoading('Reading document file…');
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
        reader.readAsArrayBuffer(blob);
      });

      // 3. Wrap the ArrayBuffer in a File so the multipart upload looks
      //    identical to a real user selection.
      const fileName = 'Initial Document';
      const inputFile = new File([arrayBuffer], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      // 4. POST to /Import (same code path as the original uploader).
      showLoading('Converting document to SFDT (this may take a moment)…');
      const formData = new FormData();
      formData.append('files', inputFile, inputFile.name);

      const res = await fetch(`${SERVICE_URL}Import`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        throw new Error(`Import failed: ${res.statusText}`);
      }
      const sfdtString = await res.text();

      // 5. Parse the SFDT JSON and open it in the editor.
      let sfdtObject = null;
      try {
        sfdtObject = JSON.parse(sfdtString);
      } catch (parseErr) {
        alert('Failed to process the default document: invalid JSON from server.');
        return;
      }
      if (sfdtObject && editor) {
        try {
            container.documentEditorSettings ={openAsyncSettings:{enable:true, initialPageLoadCount:5,incrementalPageLoadCount:5}};
            editor.showRevisions = false; 
        } 
        catch { /* not all builds expose it */ }
        showLoading('Opening document in editor…');
        editor.openAsync(sfdtObject);
        if (editor.documentName) {
          editor.documentName = fileName.replace(/\.docx$/i, '');
        }
      } else {
        alert('Unable to display the default document. Please try again.');
      }
    } catch (e) {
      console.error('Failed to load default document:', e);
      alert('Failed to load default document: ' + (e?.message || e));
    } finally {
      // openAsync loads pages incrementally — the spinner is hidden
      // once the call returns (the first pages are already visible).
      hideLoading();
    }
  }, [showLoading, hideLoading]);

  // Recompute the assist button position from the helper and update state.
  // Centralized so selection change, scroll, zoom, and resize all use the
  // same path.
  const recomputeAssistPos = useCallback(() => {
    try {
      const pos = window?.getAIAssistBtnPosition?.();
      if (!pos) return;
      setAssistBtnPos({
        left: Math.round(pos.x),
        top: Math.round(pos.y),
        width: 24,
        height: 24
      });
    } catch { /* ignore */ }
  }, []);

  const onContainerCreated = useCallback(() => {
    const editor = container.current?.documentEditor;
    if (!editor) return;
    try { editor.focusIn(); } catch { }
    setTimeout(() => {
      recomputeAssistPos();
    }, 10);
    window.onbeforeunload = function () {
      return "Want to save your changes?";
    };
    editor.zoomFactorChange = () => onZoomFactorChange();

    // Follow the caret / selection as the user moves it.
    try {
      editor.selectionChange = () => recomputeAssistPos();
    } catch { /* selectionChange may be locked down on some builds */ }

    // Follow the editor's internal scroll. Syncfusion's viewer container
    // is the element the user scrolls, so we listen there rather than on
    // window.
    const viewerEl = document.getElementById('document-editor_editor_viewerContainer');
    if (viewerEl) {
      viewerEl.addEventListener('scroll', recomputeAssistPos, { passive: true });
    }

    editor.pageOutline = "#E0E0E0";
    editor.acceptTab = true;
    container.current.documentEditorSettings.showRuler = true;
    editor.resize();

    let spellChecker = editor.spellChecker;
    spellChecker.languageID = 1033;
    spellChecker.removeUnderline = false;
    spellChecker.allowSpellCheckAndSuggestion = true;
    window.addEventListener('resize', onResize);
    // Auto-load the default template from the server
    loadDefaultDocument();
  }, [loadDefaultDocument, recomputeAssistPos, onZoomFactorChange]);

  useEffect(() => {
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // --- Section catalog: load persisted sections from server ---
  // Calls /SeedSections first so the builtin section entries are written
  // to wwwroot/Data/sections.json if the file is missing or empty. Then
  // calls /GetSections to read the full catalog (builtin + user-added)
  // and populates the ListView. The Sections panel survives page
  // refresh because every entry — builtin and user-added — lives in
  // sections.json on disk.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Seed builtin sections first (no-op if already seeded).
        try {
          await fetch(`${SERVICE_URL}SeedSections`, { method: 'POST' });
        } catch (e) { /* server may not support it yet — ignore */ }

        const res = await fetch(`${SERVICE_URL}GetSections`, { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        const saved = Array.isArray(data?.sections) ? data.sections : [];
        if (cancelled || saved.length === 0) return;
        setSections(saved.map((s) => ({
          ...s,
          htmlAttributes: { draggable: true },
          category: s.category || 'User-added section'
        })));
      } catch (e) {
        console.warn('Failed to load saved sections:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- Add Section dialog handlers ---
  // The dialog asks the user for both a typed section name and a .docx
  // file (Browse button). On OK we POST the file to /Import to get SFDT
  // and POST { sectionName, file } to /SaveSection to persist the entry
  // to wwwroot/Data/sections.json. The returned entry (with server-side
  // SFDT) is appended to the ListView immediately.
  const openAddSectionDialog = useCallback(() => {
    setAddSectionName('');
    setAddSectionFile(null);
    setAddSectionFileName('');
    setAddSectionError('');
    setAddSectionOpen(true);
  }, []);

  const closeAddSectionDialog = useCallback(() => {
    if (isAddingSection) return;
    setAddSectionOpen(false);
    setAddSectionError('');
  }, [isAddingSection]);

  const onAddSectionFilePicked = useCallback((e) => {
    const file = e?.target?.files?.[0];
    if (!file) {
      setAddSectionFile(null);
      setAddSectionFileName('');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setAddSectionFile(null);
      setAddSectionFileName('');
      setAddSectionError('Please choose a .docx file.');
      if (addSectionInputRef.current) addSectionInputRef.current.value = '';
      return;
    }
    setAddSectionError('');
    setAddSectionFile(file);
    setAddSectionFileName(file.name);
    // Pre-fill the name with the file name (without extension) if the
    // user hasn't typed one yet.
    if (!addSectionName.trim()) {
      setAddSectionName(file.name.replace(/\.docx$/i, '').trim());
    }
  }, [addSectionName]);

  const onAddSectionBrowse = useCallback(() => {
    const input = addSectionInputRef.current;
    if (input) {
      input.value = '';
      input.click();
    }
  }, []);

  const confirmAddSection = useCallback(async () => {
    const name = addSectionName.trim();
    if (!name) {
      setAddSectionError('Section name is required.');
      return;
    }
    if (!addSectionFile) {
      setAddSectionError('Please choose a .docx file.');
      return;
    }
    setIsAddingSection(true);
    setAddSectionError('');
    showLoading('Importing section document…');
    try {
      // 1. Convert docx → SFDT via /Import (so we store SFDT for instant paste).
      showLoading('Converting section to SFDT…');
      const formData = new FormData();
      formData.append('files', addSectionFile, addSectionFile.name);
      const importRes = await fetch(`${SERVICE_URL}Import`, {
        method: 'POST',
        body: formData
      });
      if (!importRes.ok) throw new Error('Import failed: ' + importRes.statusText);
      const sfdtText = await importRes.text();
      let sfdt;
      try { sfdt = JSON.parse(sfdtText); } catch { sfdt = sfdtText; }

      // 2. Persist the catalog entry server-side with the TYPED name.
      const saveForm = new FormData();
      saveForm.append('files', addSectionFile, addSectionFile.name);
      saveForm.append('sectionName', name);
      showLoading('Saving section to catalog…');
      const saveRes = await fetch(`${SERVICE_URL}SaveSection`, {
        method: 'POST',
        body: saveForm
      });
      if (!saveRes.ok) throw new Error('SaveSection failed: ' + saveRes.statusText);
      const savedEntry = await saveRes.json();

      // 3. Append to the ListView immediately, using the freshly-imported
      //    SFDT for instant paste.
      setSections((prev) => {
        const existingIds = new Set(prev.map((s) => String(s.id)));
        if (existingIds.has(String(savedEntry.id))) return prev;
        return [
          ...prev,
          {
            ...savedEntry,
            sfdt: sfdt,
            htmlAttributes: { draggable: true },
            category: 'User-added section'
          }
        ];
      });
      setAddSectionOpen(false);
    } catch (err) {
      console.error('Add Section failed:', err);
      setAddSectionError(err?.message || String(err));
    } finally {
      setIsAddingSection(false);
      hideLoading();
      if (addSectionInputRef.current) addSectionInputRef.current.value = '';
    }
  }, [addSectionName, addSectionFile, showLoading, hideLoading]);

  // Filtered sections for the ListView (search filter).
  const filteredSections = useMemo(() => {
    const q = sectionSearch.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) =>
      String(s.text || '').toLowerCase().includes(q) ||
      String(s.category || '').toLowerCase().includes(q)
    );
  }, [sections, sectionSearch]);

  const onResize = () => onZoomFactorChange();

  // --- Templates panel: click or drop a list item to insert its SFDT at the caret ---

  // Inserts a template SFDT payload at the current cursor position by calling
  // the editor's `paste` API. Accepts the raw SFDT string.
  const insertTemplateAtCaret = useCallback((sfdt) => {
    if (!sfdt) return;
    const editor = container.current?.documentEditor;
    if (!editor) return;
    try { editor.focusIn(); } catch { }
    try {
      editor.editor.paste(sfdt);
    } catch (e) {
      console.error('Failed to paste template SFDT:', e);
    }
  }, []);

  // Click handler: triggered when the user clicks an item in the ListView.
  const onTemplateSelect = useCallback((e) => {
    const item = e?.data;
    if (item && item.sfdt) {
      insertTemplateAtCaret(item.sfdt);
    }
  }, [insertTemplateAtCaret]);

  // --- Drag-and-drop wiring for the Sections list ---
  // The ListView items expose `draggable=true`. We attach `dragstart`
  // to the rendered <li> elements and put only the section id on the
  // dataTransfer (NOT the SFDT). The drop handler resolves the id back
  // to the SFDT via a direct `sections.find(...)` lookup.
  useEffect(() => {
    const listEl = templatesListRef.current?.element;
    if (!listEl) return;

    const findItemByText = (text) =>
      sections.find((it) => it.text === text) || null;

    const onDragStart = (ev) => {
      const target = ev.target;
      const li = target?.closest?.('li');
      if (!li) return;
      const text = (li.textContent || '').trim();
      const item = findItemByText(text);
      if (!item || item.id == null) return;
      try {
        // Lightweight payload: just the template id. Never put the SFDT on
        // the dataTransfer — it's large and browsers may truncate it.
        ev.dataTransfer.setData('application/x-template-id', String(item.id));
        ev.dataTransfer.setData('text/plain', item.text);
        ev.dataTransfer.effectAllowed = 'copy';
      } catch { /* some browsers throw on setData in certain contexts */ }
    };

    listEl.addEventListener('dragstart', onDragStart);
    return () => {
      listEl.removeEventListener('dragstart', onDragStart);
    };
  }, [sections]);

  // Drop targets: the document-editor container and the inner viewer.
  useEffect(() => {
    const editorHost = document.getElementById('documentEditorDiv');
    if (!editorHost) return;

    const isOurs = (dt) =>
      !!dt && Array.from(dt.types || []).includes('application/x-template-id');

    const onDragOver = (ev) => {
      if (isOurs(ev.dataTransfer)) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
      }
    };
    const onDrop = (ev) => {
      if (!isOurs(ev.dataTransfer)) return;
      const id = ev.dataTransfer.getData('application/x-template-id');
      if (!id) return;
      ev.preventDefault();
      ev.stopPropagation();

      // Focus the editor so the paste lands inside the document rather than
      // somewhere outside. We intentionally do NOT try to move the caret to
      // the exact drop coordinates — the public Syncfusion API does not
      // expose a coordinate-to-offset helper, and synthetic mouse events
      // interfere with the editor's own state. The user controls the caret
      // position by clicking first.
      try {
        const editor = container.current?.documentEditor;
        if (editor) editor.focusIn();
      } catch { /* ignore */ }

      // Direct list lookup by id — same approach the user suggested.
      const item = sections.find((it) => String(it.id) === id);
      if (item && item.sfdt) {
        insertTemplateAtCaret(item.sfdt);
      }
    };

    editorHost.addEventListener('dragover', onDragOver);
    editorHost.addEventListener('drop', onDrop);
    return () => {
      editorHost.removeEventListener('dragover', onDragOver);
      editorHost.removeEventListener('drop', onDrop);
    };
  }, [insertTemplateAtCaret, sections]);

  // --- Top bar action handlers ---

  const onSave = useCallback(() => {
    const editor = container.current?.documentEditor;
    if (!editor) return;
    const name = editor.documentName && editor.documentName.trim()
      ? editor.documentName
      : 'Document';
    editor.save(name, 'Docx');
  }, []);

  // --- Insert MERGE Field: type a name (CamelCase) and validate it ---

  // Rules:
  //   - Only A-Z, a-z, 0-9, and underscore are allowed.
  //   - Must not start with a number.
  //   - Maximum 40 characters.
  //   - No spaces (use CamelCase like FirstName).
  const MERGE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

  const validateMergeFieldName = useCallback((raw) => {
    const name = (raw || '').trim();
    if (!name) {
      return { isValid: false, reason: 'Field name is required.' };
    }
    if (name.length > 40) {
      return { isValid: false, reason: 'Field name must be 40 characters or fewer.' };
    }
    if (/^[0-9]/.test(name)) {
      return { isValid: false, reason: 'Field name must not start with a number (use CamelCase).' };
    }
    if (/\s/.test(name)) {
      return { isValid: false, reason: 'Field name cannot contain spaces (use CamelCase).' };
    }
    if (!MERGE_NAME_REGEX.test(name)) {
      return {
        isValid: false,
        reason: 'Only letters, digits, and underscores are allowed (e.g. FirstName).'
      };
    }
    return { isValid: true, reason: '' };
  }, []);

  const mergeFieldValidation = useMemo(
    () => validateMergeFieldName(mergeFieldName),
    [mergeFieldName, validateMergeFieldName]
  );

  const openMergeFieldDialog = useCallback(() => {
    const editor = container.current?.documentEditor;
    if (!editor) return;
    setMergeFieldName('');
    setMergePickerVisible(true);
    // Syncfusion's DialogComponent `visible` prop only reliably drives the
    // FIRST show. After the dialog has been opened once, the dialog keeps
    // its own internal shown/hidden state, so the React `visible={true}`
    // re-render is ignored. Call the imperative API via the ref to make
    // subsequent opens actually work.
    try { mergeFieldDialogRef.current?.show?.(); } catch { /* ignore */ }
  }, []);

  const closeMergeFieldDialog = useCallback(() => {
    setMergePickerVisible(false);
    setMergeFieldName('');
    // Mirrors openMergeFieldDialog: drive the dialog's own hide() so the
    // modal overlay and focus trap are torn down regardless of whether
    // React's `visible` re-render is honored.
    try { mergeFieldDialogRef.current?.hide?.(); } catch { /* ignore */ }
  }, []);

  const onMergeFieldNameInput = useCallback((e) => {
    // Strip disallowed characters as the user types so they can never end up
    // in the field name. We keep letters, digits, and underscore only.
    const cleaned = String(e?.value || '').replace(/[^A-Za-z0-9_]/g, '');
    setMergeFieldName(cleaned.slice(0, 40));
  }, []);

  // Read the latest typed name from the ref so the click handler always
  // sees what the user actually entered, regardless of React batching.
  const mergeFieldNameRef = useRef('');
  useEffect(() => { mergeFieldNameRef.current = mergeFieldName; }, [mergeFieldName]);

  const applyMergeField = useCallback(() => {
    const name = (mergeFieldNameRef.current || '').trim();
    const validation = validateMergeFieldName(name);
    if (!validation.isValid) {
      // If we reached this branch the user typed something invalid and
      // somehow bypassed the disabled state. Bail out and leave the
      // dialog open so they can fix the input.
      return;
    }
    const editor = container.current?.documentEditor;
    if (!editor) {
      closeMergeFieldDialog();
      return;
    }
    try { editor.focusIn(); } catch { /* ignore */ }
    let inserted = false;
    try {
      editor.editor.insertField('MERGEFIELD ' + name + ' \\* MERGEFORMAT');
      inserted = true;
    } catch {
      // Fallback: insert the field name as a plain text token
      try { editor.editor.insertText('«' + name + '»'); inserted = true; } catch { /* ignore */ }
    }
    if (inserted) {
      // Only close after the editor action completes, so React's commit
      // doesn't unmount this dialog mid-insert.
      closeMergeFieldDialog();
    }
  }, [validateMergeFieldName, closeMergeFieldDialog]);

  // Insert-MERGE-field buttons are defined via the DialogComponent `buttons`
// footer prop, which Syncfusion owns end-to-end (it registers its own
// click listeners on the footer <button> elements it renders). Buttons
// placed in the dialog body — even native <button> elements — sit behind
// the modal overlay in some Syncfusion builds and never receive clicks.
// Footer buttons are reliably clickable.
const mergeFieldOkClick = useCallback(() => {
  applyMergeField();
}, [applyMergeField]);

const mergeFieldCancelClick = useCallback(() => {
  closeMergeFieldDialog();
}, [closeMergeFieldDialog]);

const mergeFieldDialogButtons = useMemo(() => [
  {
    buttonModel: {
      content: 'Ok',
      cssClass: 'e-primary merge-field-btn merge-field-btn-primary' +
        (mergeFieldValidation.isValid ? '' : ' merge-field-btn-disabled'),
      isPrimary: true,
      disabled: false  // never disable at DOM level — see mergeFieldBtn-disabled CSS note
    },
    click: mergeFieldOkClick
  },
  {
    buttonModel: {
      content: 'Cancel',
      cssClass: 'e-flat merge-field-btn merge-field-btn-secondary'
    },
    click: mergeFieldCancelClick
  }
], [mergeFieldValidation.isValid, mergeFieldOkClick, mergeFieldCancelClick]);

// --- Preview with Data handlers (mirrors the TemplateViewer.jsx
// reference pattern). The user browses for a .json data file; on OK
// the live editor is exported via saveAsBlob('Docx'), the blob is read
// as a base64 data URL, and { fileName, documentData, mailMergeData }
// is POSTed to the server's /MailMerge endpoint. The server returns
// the merged SFDT, which is opened directly in the live editor.

// Default example JSON shown in the dialog as a reference for the
// format the .json file must follow (a root group whose array of
// objects contains one entry per merged record). The keys match the
// built-in MERGE fields so users see a working example.
const PREVIEW_EXAMPLE_JSON = `{
  "Organization": [
    {
      "OrgName": "ABC Foundation",
      "OrgAddress": "123 Main Street, New York, NY 10001",
      "OrgRegion": "USA"
    }
  ]
}`;

const openPreviewDialog = useCallback(() => {
  // Start with no file selected — the user must Browse.
  setPreviewFile(null);
  setPreviewParsed(null);
  setPreviewFileName('');
  setPreviewError('');
  setPreviewOpen(true);
}, []);

const closePreviewDialog = useCallback(() => {
  if (isMerging) return; // don't allow closing mid-merge
  setPreviewOpen(false);
  setPreviewError('');
}, [isMerging]);

// Read the user-selected .json File, parse it, stash the parsed object
// for OK, and surface validation errors inline. We only accept .json
// and require the top-level object to have an array property (matching
// the backend's GetJsonData helper).
const handlePreviewFileChange = useCallback(async (e) => {
  const file = e?.target?.files?.[0];
  if (!file) {
    setPreviewFile(null);
    setPreviewParsed(null);
    setPreviewFileName('');
    return;
  }
  const lowerName = (file.name || '').toLowerCase();
  if (!lowerName.endsWith('.json')) {
    setPreviewFile(null);
    setPreviewParsed(null);
    setPreviewFileName('');
    setPreviewError('Please choose a .json file.');
    if (previewFileInputRef.current) previewFileInputRef.current.value = '';
    return;
  }
  setPreviewError('');
  try {
    const text = await file.text();
    const parsed = text.trim() ? JSON.parse(text) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setPreviewFile(null);
      setPreviewParsed(null);
      setPreviewFileName('');
      setPreviewError('The .json file must contain a JSON object (not an array or scalar). See the example format.');
      if (previewFileInputRef.current) previewFileInputRef.current.value = '';
      return;
    }
    // Top-level object must have at least one array property — the
    // backend's GetJsonData expects the .First() value to be a List of
    // row objects (a "group"). Surface a clear error here instead of
    // letting the .NET side throw.
    const firstKey = Object.keys(parsed)[0];
    if (!firstKey || !Array.isArray(parsed[firstKey])) {
      setPreviewFile(null);
      setPreviewParsed(null);
      setPreviewFileName('');
      setPreviewError('The JSON object must have at least one array property, e.g. { "Organization": [ { ... } ] }. See the example format.');
      if (previewFileInputRef.current) previewFileInputRef.current.value = '';
      return;
    }
    setPreviewFile(file);
    setPreviewParsed(parsed);
    setPreviewFileName(file.name);
  } catch (err) {
    setPreviewFile(null);
    setPreviewParsed(null);
    setPreviewFileName('');
    setPreviewError(`Could not read JSON file: ${err.message}`);
    if (previewFileInputRef.current) previewFileInputRef.current.value = '';
  }
}, []);

const handleBrowseClick = useCallback(() => {
  // Trigger the hidden <input type="file"> open dialog.
  previewFileInputRef.current?.click();
}, []);

// Read a Blob as a base64 data URL. Inlined here because the
// TemplateViewer.jsx reference file imported it from a utils module
// that isn't part of this sample's workspace.
function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

const onPreviewWithData = useCallback(async () => {
  const inst = container.current;
  if (!inst) return;
  const de = inst.documentEditor;
  if (!de) return;
  // The file + parsed payload are validated at pick time, but guard
  // against the user clicking OK without any selection.
  if (!previewFile || !previewParsed) {
    setPreviewError('Please browse for a .json data file first.');
    return;
  }
  const parsed = previewParsed;

  setIsMerging(true);
  setPreviewError('');
  showLoading('Exporting document for mail merge…');
  try {
    // 1. Export the live document to a .docx BLOB (Syncfusion API).
    const blob = await de.saveAsBlob('Docx');
    // 2. Read the BLOB as a base64 Data URL (FileReader.readAsDataURL).
    //    The server's /MailMerge does Convert.FromBase64String(...) +
    //    new WordDocument(stream, FormatType.Docx), so it needs ACTUAL
    //    .docx bytes — not SFDT JSON.
    showLoading('Preparing document data…');
    const base64DataUrl = await readBlobAsDataUrl(blob);
    // 3. fileName = the editor's current documentName + ".docx".
    const docName = (de.documentName || '').trim() || 'Document';
    // 4. POST to /api/DocumentEditor/MailMerge.
    showLoading('Running mail merge on server…');
    const payload = {
      fileName: `${docName}.docx`,
      documentData: base64DataUrl,
      mailMergeData: JSON.stringify(parsed)
    };
    const res = await fetch(`${SERVICE_URL}MailMerge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error('MailMerge failed: ' + res.statusText);
    }
    const mergedSfdt = await res.text();
    // 5. Open the merged SFDT in the live editor — the live preview.
    de.open(mergedSfdt);
    // Close the dialog and reset the picker state.
    setPreviewOpen(false);
    setPreviewFile(null);
    setPreviewParsed(null);
    setPreviewFileName('');
    if (previewFileInputRef.current) previewFileInputRef.current.value = '';
  } catch (err) {
    console.error('Mail merge preview failed:', err);
    setPreviewError(err.message || String(err) || 'Mail merge failed.');
  } finally {
    setIsMerging(false);
    hideLoading();
  }
}, [previewFile, previewParsed, showLoading, hideLoading]);

  const showChatPane = () => {
    // The AI Chat window is always visible in this layout; the function is kept
    // because AIPopup expects it. AIPopup will call onShowChatPane when its
    // own close handler fires.
    setAiSuggestions(['Summarize this document']);
  };

  const chatPanelCreated = () => {
    assistInstance.current.toolbarSettings.itemClicked = (args) => {
      const itemClass = String(args?.item?.iconCss || '');
      if (itemClass.includes('e-close')) {
        // No-op: AI chat window is a permanent part of the layout.
        // Toggling it is intentionally disabled.
      }
    };
    setAiSuggestions(['Summarize this document']);
  };

  return (
    <div className='control-pane'>
      {/* Full-screen loading overlay. Shown during Initial Document
          load (1000+ page docx → /Import → openAsync), Add Section
          (docx → /Import → /SaveSection), and Preview with Data
          (saveAsBlob → /MailMerge → open). The overlay blocks pointer
          events so the user can't interact with the editor mid-service
          call. The message under the spinner updates per phase. */}
      {isLoading && (
        <div className="app-loading-overlay">
          <div className="app-loading-card">
            <div className="app-loading-spinner" />
            <div className="app-loading-text">{loadingMessage}</div>
          </div>
        </div>
      )}
      <div className='control-section'>
        <div className='app-shell'>
          {/* Top bar */}
          <header className='app-topbar'>
            <div className='app-topbar-title'>{SAMPLE_TITLE}</div>
            <div className='app-topbar-actions'>
              <ButtonComponent cssClass='e-primary app-topbar-btn' iconCss='e-icons e-save' onClick={onSave}>
                Save
              </ButtonComponent>
              <ButtonComponent cssClass='e-outline app-topbar-btn' iconCss='e-icons e-plus' onClick={openMergeFieldDialog}>
                Insert MERGE Field
              </ButtonComponent>
              <ButtonComponent cssClass='e-outline app-topbar-btn' iconCss='e-icons e-eye' onClick={openPreviewDialog} disabled={isMerging}>
                {isMerging ? 'Merging…' : 'Preview with Data'}
              </ButtonComponent>
            </div>
          </header>

          {/* Bottom row */}
          <div className='app-bottom'>
            {/* Left column - Sections (search + add-section + ListView) */}
            <aside className='app-col app-col-left'>
              <div className='app-panel-header'>Sections</div>
              <div className='app-panel-body app-panel-body-templates'>
                <div className="section-search-box">
                  <span className="section-search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search sections..."
                    value={sectionSearch}
                    onChange={(e) => setSectionSearch(e.target.value)}
                  />
                </div>
                <ListViewComponent
                  ref={templatesListRef}
                  id="templates-listview"
                  cssClass="e-listview-template"
                  dataSource={filteredSections}
                  select={onTemplateSelect}
                  showHeader={false}
                  sortOrder="None"
                >
                </ListViewComponent>
                <div
                  className={'add-section' + ((isAddingSection || isMerging) ? ' add-section--loading' : '')}
                  onClick={() => {
                    if (isAddingSection) return;
                    openAddSectionDialog();
                  }}
                >
                  {isAddingSection ? '+ Adding...' : '+ Add Section Template'}
                </div>
                {/* Hidden file input for the Add Section dialog's Browse button. */}
                <input
                  ref={addSectionInputRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display: 'none' }}
                  onChange={onAddSectionFilePicked}
                />
              </div>
            </aside>

            {/* Center column - Document Editor */}
            <main className='app-col app-col-center'>
              <div id='documentEditorDiv' className='document-editor-container'>
                <DocumentEditorContainerComponent
                  id="document-editor"
                  ref={container}
                  height="100%"
                  width="100%"
                  serviceUrl={SERVICE_URL}
                  enableToolbar={true}
                  toolbarMode='Ribbon'
                  enableSpellCheck={true}
                  created={onContainerCreated}
                />
                <AIPopup
                  editorRef={container}
                  onShowChatPane={showChatPane}
                  chatOpen={openChat}
                  assistInitialPos={assistBtnPos}
                  isAIEnabled={isAIEnabled}
                  showChatFab={false}
                />
              </div>
            </main>

            {/* Right column - AI Chat */}
            <aside className='app-col app-col-right'>
              <div className='app-panel-header'>AI Assistant</div>
              <div className='app-panel-body app-panel-body-chat'>
                <AIAssistViewComponent
                  ref={assistInstance}
                  cssClass="e-aiassist-chat"
                  promptPlaceholder="Type a question"
                  promptSuggestions={aiSuggestions}
                  promptIconCss="e-icons e-aiassist-chat-icon"
                  responseIconCss="e-aiassist-chat-icon"
                  created={chatPanelCreated}
                  bannerTemplate={() =>
                    <div className="ai-assist-banner">
                      <div className="e-icons e-aiassist-page-icon"></div>
                      <div className="e-aiassist-page-header">How can I help you?</div>
                    </div>
                  }
                  promptRequest={async (args) => {
                    const prompt = String(args?.prompt || '').trim();
                    if (!prompt) { args.response = ''; return; }
                    try {
                      if (prompt === 'Summarize this document') {
                        await new Promise(resolve => {
                          requestAnimationFrame(() => setTimeout(resolve, 10));
                        });
                        const documentContent = await getDocumentText(container);
                        const options = {
                          messages: [
                            { role: "system", content: `You are a helpful assistant. Your task is to analyze the provided text and generate short summary. Always respond in proper HTML format, but do not include <html>, <head>, or <body> tags. ${CITATION_RULE}` },
                            { role: "user", content: documentContent }
                          ],
                          model: "gpt-4",
                        };
                        const summaryHtml = await getAzureChatAIRequest(options);
                        args.response = summaryHtml || '<p>No summary available.</p>';
                        const suggestionsRaw = await getAzureChatAIRequest({
                          messages: [
                            { role: "system", content: `You are a helpful assistant. Your task is to analyze the provided text and generate 3 short diverse questions and each question should not exceed 10 words. ${CITATION_RULE}` },
                            { role: "user", content: documentContent }
                          ],
                          model: "gpt-4",
                        });
                        if (suggestionsRaw) {
                          const next = (suggestionsRaw.split(/\d+\.\s*/).filter(x => x.trim() !== "")).map((text, index) => {
                            return `${index + 1}. ${text.trim()}`;
                          });
                          if (next.length) setAiSuggestions(next);
                        }
                        
                      } else {
                        await new Promise(resolve => {
                          requestAnimationFrame(() => setTimeout(resolve, 10));
                        });
                        const options = {
                          messages: [
                            { role: "system", content: `You are a helpful assistant. Use the provided context to answer the user question. Always respond in proper HTML format, but do not include <html>, <head>, or <body> tags. Context:${CITATION_RULE}` },
                            { role: "user", content: prompt + `Context:${CITATION_RULE}`}
                          ],
                          model: "gpt-4",
                        };
                        const answerHtml = await getAzureChatAIRequest(options);
                        var response = String(answerHtml ?? '<p>No answer.</p>');
                        args.response = response;
                        assistInstance.current.addPromptResponse(response);
                      }
                    } catch (e) {
                      args.response = `<p class="aiassist-error">AI error: ${e?.message || e}</p>`;
                    }
                  }}
                  responseToolbarSettings={{
                    items: [
                      { iconCss: 'e-icons e-copy', tooltip: 'copy' },
                      { iconCss: 'e-btn-icon e-de-ctnr-new', tooltip: 'insert' }
                    ],
                    itemClicked: async (e) => {
                      const idx = typeof e?.dataIndex === 'number'
                        ? e.dataIndex
                        : (assistInstance.current?.prompts?.length ?? 1) - 1;
                      const resHtml = assistInstance.current?.prompts?.[idx]?.response ?? '';
                      if (!resHtml) return;
                      const tmp = document.createElement('div');
                      tmp.innerHTML = resHtml;
                      const plainText = (tmp.innerText || '').trim();
                      const tip = (e?.item?.tooltip || '').toLowerCase();
                      if (tip === 'copy') {
                        if (navigator.clipboard && window.ClipboardItem) {
                          const blobHtml = new Blob([resHtml], { type: 'text/html' });
                          const blobText = new Blob([plainText], { type: 'text/plain' });
                          await navigator.clipboard.write([
                            new ClipboardItem({
                              'text/html': blobHtml,
                              'text/plain': blobText
                            })
                          ]);
                        } else {
                          await navigator.clipboard?.writeText(plainText);
                        }
                      } else if (tip === 'insert') {
                        const docEditor = container?.current?.documentEditor;
                        if (!docEditor || !resHtml) return;
                        try {
                          const res = await fetch(`${SERVICE_URL}LoadString`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: resHtml })
                          });
                          if (!res.ok) {
                            throw new Error('LoadString failed: ' + res.statusText);
                          }
                          const sfdtText = await res.text();
                          let sfdt;
                          try {
                            sfdt = JSON.parse(sfdtText);
                          } catch {
                            // Older server builds may return a non-JSON
                            // payload that paste() can still consume as a
                            // string. Fall back rather than abort.
                            sfdt = sfdtText;
                          }
                          try { docEditor.focusIn(); } catch { /* ignore */ }
                          // Enable track changes so the pasted AI content
                          // shows up as tracked changes the user can Accept
                          // or Reject.
                          try {
                            docEditor.enableTrackChanges = true;
                            docEditor.showRevisions = true;
                          } catch { /* not all builds expose these props */ }
                          docEditor.editor.paste(sfdt);
                        } catch (e) {
                          console.error('Insert assistant response failed:', e);
                        }
                      }
                    }
                  }}
                >
                </AIAssistViewComponent>
              </div>
            </aside>
          </div>
        </div>

        {/* Insert MERGE Field picker (Mail MERGE Demo style: name input + validation).
            The OK/Cancel actions live in the DialogComponent `buttons` footer,
            which Syncfusion owns end-to-end. Buttons rendered in the dialog
            body — even native <button> elements — sit behind the modal overlay
            in some Syncfusion builds and never receive clicks; the footer
            buttons are reliably clickable. The dialog is closed imperatively
            via the ref (see closeMergeFieldDialog) because Syncfusion's
            `visible` prop only drives the FIRST show after the dialog has been
            opened once. */}
        <DialogComponent
          ref={mergeFieldDialogRef}
          visible={mergePickerVisible}
          header="Insert MERGE Field"
          isModal={true}
          width="380px"
          showCloseIcon={true}
          close={closeMergeFieldDialog}
          cssClass="merge-field-dialog"
          buttons={mergeFieldDialogButtons}
        >
          <div className="merge-field-body">
            <label htmlFor="mergeFieldNameInput" className="merge-field-label">Name:</label>
            <TextBoxComponent
              id="mergeFieldNameInput"
              placeholder="Type a field to insert eg. FirstName"
              value={mergeFieldName}
              input={onMergeFieldNameInput}
              floatLabelType="Never"
              cssClass={mergeFieldValidation.isValid ? 'merge-field-input' : 'merge-field-input e-error'}
              showClearButton={false}
            />
            <div
              className={'merge-field-hint' + (mergeFieldValidation.isValid ? ' is-valid' : ' is-invalid')}
              role="status"
              aria-live="polite"
            >
              {mergeFieldName
                ? (mergeFieldValidation.isValid
                    ? 'Looks good. The MERGEFIELD will be inserted at the cursor.'
                    : mergeFieldValidation.reason)
                : 'Use CamelCase. Only letters, digits, and underscores. Max 40 characters.'}
            </div>
          </div>
        </DialogComponent>

        {/* Preview-with-Data (Mail Merge) dialog — native HTML modal
            (matches the TemplateViewer.jsx reference pattern; avoids
            Syncfusion DialogComponent + React 19 lifecycle issues).
            The user browses for a .json data file; on OK the live
            editor is exported via saveAsBlob('Docx'), the blob is read
            as a base64 data URL, and { fileName, documentData,
            mailMergeData } is POSTed to the server's /MailMerge
            endpoint. The server returns the merged SFDT, which is
            opened directly in the live editor (no second
            DocumentEditorContainer). */}
        {previewOpen && (
          <div
            className="ts-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ts-preview-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isMerging) closePreviewDialog();
            }}
          >
            <div className="ts-preview-dialog" onClick={(e) => e.stopPropagation()}>
              <header className="ts-preview-head">
                <h3 id="ts-preview-title">Preview with Data</h3>
                <button
                  type="button"
                  className="ts-preview-close"
                  aria-label="Close"
                  onClick={closePreviewDialog}
                  disabled={isMerging}
                >×</button>
              </header>

              <div className="ts-preview-body">
                <div className="ts-preview-file-row">
                  <label className="ts-preview-file-label">Input JSON Data:</label>
                  {/* Hidden file input — triggered by the Browse… button. */}
                  <input
                    ref={previewFileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handlePreviewFileChange}
                    disabled={isMerging}
                    style={{ display: 'none' }}
                  />
                  {/* Readonly text box showing the selected file name
                      (or placeholder) — replaces the browser-native
                      "Choose File" button which looks inconsistent. */}
                  <input
                    type="text"
                    readOnly
                    value={previewFileName}
                    placeholder="No file chosen"
                    disabled={isMerging}
                    className="ts-preview-file-text"
                    onClick={() => { if (!isMerging) handleBrowseClick(); }}
                  />
                  <ButtonComponent
                    cssClass="e-outline e-primary ts-preview-browse"
                    iconCss="e-icons e-folder"
                    onClick={handleBrowseClick}
                    disabled={isMerging}
                  >Browse…</ButtonComponent>
                </div>

                <details className="ts-preview-example">
                  <summary>Show example JSON format</summary>
                  <pre>{PREVIEW_EXAMPLE_JSON}</pre>
                </details>

                {previewError && <p className="ts-preview-error">{previewError}</p>}
              </div>

              <footer className="ts-preview-actions">
                <ButtonComponent
                  cssClass="e-flat"
                  onClick={closePreviewDialog}
                  disabled={isMerging}
                >Cancel</ButtonComponent>
                <ButtonComponent
                  cssClass="e-primary"
                  onClick={onPreviewWithData}
                  disabled={isMerging || !previewFile || !previewParsed}
                  iconCss={isMerging ? 'e-icons e-refresh' : 'e-icons e-check'}
                >{isMerging ? 'Merging…' : 'OK'}</ButtonComponent>
              </footer>
            </div>
          </div>
        )}

        {/* Add Section dialog — native HTML modal (same pattern as the
            Preview-with-Data modal). Asks the user for BOTH a typed
            section name AND a .docx file (Browse button), instead of
            deriving the name from the file name. On OK we POST the file
            to /Import → SFDT and { sectionName, file } to /SaveSection,
            which writes the entry to wwwroot/Data/sections.json so the
            section survives page refresh. */}
        {addSectionOpen && (
          <div
            className="ts-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ts-addsection-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isAddingSection) closeAddSectionDialog();
            }}
          >
            <div className="ts-preview-dialog ts-addsection-dialog" onClick={(e) => e.stopPropagation()}>
              <header className="ts-preview-head">
                <h3 id="ts-addsection-title">Add Section Template</h3>
                <button
                  type="button"
                  className="ts-preview-close"
                  aria-label="Close"
                  onClick={closeAddSectionDialog}
                  disabled={isAddingSection}
                >×</button>
              </header>
              <div className="ts-preview-body">
                <div className="ts-addsection-field">
                  <label htmlFor="addSectionNameInput" className="ts-addsection-label">Section name:</label>
                  <input
                    id="addSectionNameInput"
                    type="text"
                    placeholder="e.g. Cover Page"
                    value={addSectionName}
                    onChange={(e) => setAddSectionName(e.target.value)}
                    disabled={isAddingSection}
                    autoComplete="off"
                  />
                </div>
                <div className="ts-addsection-field">
                  <label className="ts-addsection-label">Document file:</label>
                  <div className="ts-addsection-file-row">
                    <ButtonComponent
                      cssClass="e-outline e-primary ts-preview-browse"
                      iconCss="e-icons e-folder"
                      onClick={onAddSectionBrowse}
                      disabled={isAddingSection}
                    >Browse…</ButtonComponent>
                    <span className="ts-preview-file-name">
                      {addSectionFileName || 'No file chosen'}
                    </span>
                  </div>
                </div>
                {addSectionError && <p className="ts-preview-error">{addSectionError}</p>}
              </div>
              <footer className="ts-preview-actions">
                <ButtonComponent
                  cssClass="e-flat"
                  onClick={closeAddSectionDialog}
                  disabled={isAddingSection}
                >Cancel</ButtonComponent>
                <ButtonComponent
                  cssClass="e-primary"
                  onClick={confirmAddSection}
                  disabled={isAddingSection || !addSectionName.trim() || !addSectionFile}
                  iconCss={isAddingSection ? 'e-icons e-refresh' : 'e-icons e-check'}
                >{isAddingSection ? 'Adding…' : 'Add Section'}</ButtonComponent>
              </footer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
