import { createElement as sfCreateElement } from '@syncfusion/ej2-base';
import { Button, Switch } from '@syncfusion/ej2-buttons';
import { DropDownButton } from '@syncfusion/ej2-splitbuttons';
import { Dialog } from '@syncfusion/ej2-popups';

/**
 * Represents document editor title bar.
 */
export class TitleBar {
    constructor(
        element,
        docEditor,
        isShareNeeded,
        dialogComponent = null,
        backToUploadCallback,
        onAIToggle
    ) {
        this.tileBarDiv = element;
        this.documentEditor = docEditor;
        this.dialogComponent = dialogComponent || null;
        this.backToUploadCallback = backToUploadCallback;
        this.onAIToggle = onAIToggle;
        this.initializeTitleBar(isShareNeeded);
        this.initializeConfirmDialog();
        this.wireEvents();
    }

    initializeTitleBar = (isShareNeeded) => {
        const downloadText = 'Download';
        const downloadToolTip = 'Download this document';
        const printText = 'Print';
        const printToolTip = 'Print this document (Ctrl+P)';
        const documentTileText = 'Document Name. Click or tap to rename this document.';

        this.tileBarDiv.innerHTML = '';

        this.createBackButton();
        this.createTitleElements(documentTileText);

        const btnStyles = this.getButtonStyles();

        this.addAISwitch();

        this.print = this.addButton(
            'e-de-icon-Print e-de-padding-right e-icon-left',
            printText,
            btnStyles,
            'de-print',
            printToolTip,
            false
        );

        const items = [
            { text: 'Syncfusion Document Text (*.sfdt)', id: 'sfdt' },
            { text: 'Word Document (*.docx)', id: 'word' },
            { text: 'Word Template (*.dotx)', id: 'dotx' },
            { text: 'Plain Text (*.txt)', id: 'txt' },
        ];

        this.export = this.addButton(
            'e-de-icon-Download e-de-padding-right e-icon-left',
            downloadText,
            btnStyles,
            'documenteditor-share',
            downloadToolTip,
            true,
            items
        );

        this.configureButtonVisibility(isShareNeeded);
    };

    addAISwitch() {
        this.aiSwitchContainer = sfCreateElement('div', {
            className: 'de-ai-switch-container',
            styles: 'float:right; display:flex; align-items:center; gap:5px; margin:5px 8px;'
        });

        this.aiSwitchLabel = sfCreateElement('span', {
            className: 'de-ai-switch-label',
            innerHTML: 'AI Enabled',
            styles: 'font-size:12px; font-weight:400; user-select:none;'
        });

        this.aiSwitchInput = sfCreateElement('input', { id: 'de-ai-switch', attrs: { type: 'checkbox' } });

        this.aiSwitchContainer.appendChild(this.aiSwitchLabel);
        this.aiSwitchContainer.appendChild(this.aiSwitchInput);

        this.tileBarDiv.appendChild(this.aiSwitchContainer);

        this.aiSwitch = new Switch({
            checked: false,
            cssClass: 'titlebar-ai-switch',
            change: this.onAISwitchChange
        });
        this.aiSwitch.appendTo(this.aiSwitchInput);
    }

    onAISwitchChange = (args) => {
        const checked = !!args.checked;
        if (typeof this.onAIToggle === 'function') {
            this.onAIToggle(checked);
        }
        this.isAIEnabled = checked;
    };

    initializeConfirmDialog() {
        this.confirmDialogHost = sfCreateElement('div', { id: 'de-back-confirm-dialog' });
        document.body.appendChild(this.confirmDialogHost);
        this.confirmDialog = new Dialog({
            header: 'Are you sure you want to leave this page ?',
            content: 'You have unsaved changes. If you leave now, your recent edits will be discarded and you’ll return to the upload page. Do you want to continue?',
            isModal: true,
            width: '400px',
            visible: false,
            showCloseIcon: true,
            animationSettings: { effect: 'Fade' },
            closeOnEscape: true,
            overlayClick: () => { this.confirmDialog.hide(); },
            buttons: [
                {
                    click: this.onConfirmYes,
                    buttonModel: { content: 'Leave', isPrimary: true }
                },
                {
                    click: this.onConfirmNo,
                    buttonModel: { content: 'Stay' }
                }
            ]
        });
        this.confirmDialog.appendTo(this.confirmDialogHost);
    }

    onBackClick = () => {
        if (this.confirmDialog) {
            this.confirmDialog.show();
        } else if (this.backToUploadCallback) {
            this.backToUploadCallback();
        }
    };

    onConfirmYes = () => {
        this.confirmDialog.hide();
        if (this.backToUploadCallback) {
            this.backToUploadCallback();
        }
    };

    onConfirmNo = () => {
        this.confirmDialog.hide();
    };

    createBackButton() {
        if (this.backToUploadCallback) {
            const backButtonStyles =
                'float:left;background: transparent;box-shadow:none; font-family: inherit;border-color: transparent;' +
                'border-radius: 2px;color:inherit;font-size:12px;text-transform:capitalize;height:28px;font-weight:600;line-height:14px;margin-top: 2px;margin-right: 10px;';

            this.backButton = this.addButton(
                'e-icons e-arrow-left e-chevron-left e-de-padding-right',
                '',
                backButtonStyles,
                'de-back-upload',
                'Back to file upload',
                false,
                undefined,
                true
            );
        }
    }

    createTitleElements(documentTileText) {
        this.documentTitle = sfCreateElement('label', {
            id: 'documenteditor_title_name',
            styles:
                'font-weight:600;text-overflow:ellipsis;white-space:pre;overflow:hidden;user-select:none;cursor:text',
        });
        this.documentTitleContentEditor = sfCreateElement('div', {
            id: 'documenteditor_title_contentEditor',
            className: 'single-line',
        });
        this.documentTitleContentEditor.appendChild(this.documentTitle);
        this.tileBarDiv.appendChild(this.documentTitleContentEditor);
        this.documentTitleContentEditor.setAttribute('title', documentTileText);
    }

    getButtonStyles() {
        return (
            'float:right;background: transparent;box-shadow:none; font-family: inherit;border-color: transparent;' +
            'border-radius: 2px;color:inherit;font-size:12px;text-transform:capitalize;height:28px;font-weight:400;margin-top: 2px;'
        );
    }

    configureButtonVisibility(isShareNeeded) {
        if (!isShareNeeded && this.export) {
            this.export.element.style.display = 'none';
        }
    }

    wireEvents = () => {
        if (this.backButton) {
            this.backButton.element.addEventListener('click', this.onBackClick);
        }
        if (this.documentTitleContentEditor) {
            this.documentTitleContentEditor.addEventListener('keydown', this.onTitleKeyDown);
            this.documentTitleContentEditor.addEventListener('blur', this.onTitleBlur);
            this.documentTitleContentEditor.addEventListener('click', this.updateDocumentEditorTitle);
        }
    };

    onPrint = () => {
        this.documentEditor.print();
    };

    onTitleKeyDown = (e) => {
        if (e.keyCode === 13) {
            e.preventDefault();
            this.documentTitleContentEditor.contentEditable = 'false';
            if (this.documentTitleContentEditor.textContent === '') {
                this.documentTitleContentEditor.textContent = 'New Document';
            }
        }
    };

    onTitleBlur = () => {
        if (this.documentTitleContentEditor.textContent === '') {
            this.documentTitleContentEditor.textContent = 'New Document';
        }
        this.documentTitleContentEditor.contentEditable = 'false';
        this.documentEditor.documentName =
            this.documentTitle.textContent || 'New Document';
    };

    updateDocumentEditorTitle = () => {
        this.documentTitleContentEditor.contentEditable = 'true';
        this.documentTitleContentEditor.focus();
        const selection = window.getSelection();
        if (selection) {
            selection.selectAllChildren(this.documentTitleContentEditor);
        }
    };

    updateDocumentTitle = () => {
        if (this.documentEditor.documentName === '') {
            this.documentEditor.documentName = 'Untitled';
        }
        this.documentTitle.textContent = this.documentEditor.documentName;
    };

    addButton(
        iconClass,
        btnText,
        styles,
        id,
        tooltipText,
        isDropDown,
        items,
        isBackButton
    ) {
        const button = sfCreateElement('button', { id: id, styles: styles });

        if (isBackButton) {
            this.tileBarDiv.insertBefore(button, this.tileBarDiv.firstChild);
        } else {
            this.tileBarDiv.appendChild(button);
            if (btnText === 'Print') {
                button.addEventListener('click', this.onPrint);
            }
        }

        button.setAttribute('title', tooltipText);

        if (isDropDown && items) {
            const dropButton = new DropDownButton(
                {
                    select: this.onExportClick,
                    items: items,
                    iconCss: iconClass,
                    cssClass: 'e-caret-hide',
                    content: '',
                    open: () => {
                        this.setTooltipForPopup();
                    },
                },
                button
            );
            return dropButton;
        } else {
            const ejButton = new Button(
                {
                    iconCss: iconClass,
                    content: '',
                },
                button
            );
            return ejButton;
        }
    }

    setTooltipForPopup() {
        const popup = document.getElementById('documenteditor-share-popup');
        if (!popup) return;

        const tooltips = [
            'Download a copy of this document to your computer as an SFDT file.',
            'Download a copy of this document to your computer as a DOCX file.',
            'Download a copy of this document to your computer as a DOTX file.',
            'Download a copy of this document to your computer as a TXT file.',
        ];

        const listItems = popup.querySelectorAll('li');
        listItems.forEach((item, index) => {
            if (tooltips[index]) {
                item.setAttribute('title', tooltips[index]);
            }
        });
    }

    onExportClick = (args) => {
        const value = args.item.id;
        switch (value) {
            case 'sfdt':
                this.save('Sfdt');
                break;
            case 'word':
                this.save('Docx');
                break;
            case 'dotx':
                this.save('Dotx');
                break;
            case 'txt':
                this.save('Txt');
                break;
            default:
                break;
        }
    };

    save = (format) => {
        this.documentEditor.save(
            this.documentEditor.documentName === '' ? 'New Document' : this.documentEditor.documentName,
            format
        );
    };

    showButtons = (show) => {
        const displayStyle = show ? 'block' : 'none';
        if (this.print) {
            this.print.element.style.display = displayStyle;
        }
        if (this.export) {
            this.export.element.style.display = displayStyle;
        }
    };

    destroy() {
        if (this.backButton) {
            this.backButton.destroy();
        }
        if (this.print) {
            this.print.destroy();
        }
        if (this.export) {
            this.export.destroy();
        }

        if (this.aiSwitch) {
            this.aiSwitch.destroy();
            this.aiSwitch = null;
        }
        if (this.aiSwitchContainer && this.aiSwitchContainer.parentNode) {
            this.aiSwitchContainer.parentNode.removeChild(this.aiSwitchContainer);
            this.aiSwitchContainer = null;
        }

        if (this.confirmDialog) {
            this.confirmDialog.destroy();
            this.confirmDialog = null;
        }
        if (this.confirmDialogHost && this.confirmDialogHost.parentNode) {
            this.confirmDialogHost.parentNode.removeChild(this.confirmDialogHost);
            this.confirmDialogHost = null;
        }
    }
}