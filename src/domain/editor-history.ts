import type { TemplateDocument } from "./template-document";
import { applyEditorCommand, type EditorCommand } from "./editor-commands";

interface HistoryEntry {
  readonly command: EditorCommand;
  readonly before: TemplateDocument;
  readonly after: TemplateDocument;
}

/** Editor-local command history. It stores immutable document values, never DOM nodes. */
export class EditorHistory {
  private document: TemplateDocument;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  constructor(initialDocument: TemplateDocument) {
    this.document = initialDocument;
  }

  get current(): TemplateDocument { return this.document; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  apply(command: EditorCommand): TemplateDocument {
    const before = this.document;
    const after = applyEditorCommand(before, command);
    this.past.push({ command, before, after });
    this.future = [];
    this.document = after;
    return after;
  }

  undo(): TemplateDocument | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push(entry);
    this.document = entry.before;
    return this.document;
  }

  redo(): TemplateDocument | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push(entry);
    this.document = entry.after;
    return this.document;
  }
}
