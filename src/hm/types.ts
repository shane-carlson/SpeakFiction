/** Block model from Speak Fiction's manuscript editor. */

export type BlockType =
  | 'chapter'
  | 'scene'
  | 'section'
  | 'paragraph'
  | 'blockquote'
  | 'pageBreak'
  | 'divider'
  | 'table'
  | 'image';

/** Visual style for a divider / scene-break block. */
export type DividerStyle = 'scene' | 'line' | 'ornament';

export type ListStyle = 'bullet' | 'number' | null;

export type InlineMarkKind = 'bold' | 'italic' | 'underline' | 'strike';

export interface InlineMark {
  kind: InlineMarkKind;
  /** Inclusive start index in the plain string. */
  start: number;
  /** Exclusive end index in the plain string. */
  end: number;
}

export interface ManuscriptBlock {
  id: string;
  type: BlockType;
  /** Heading label. Empty for paragraphs. */
  title: string;
  /** Prose. Empty for headings. */
  text: string;
  marks: InlineMark[];
  /** Paragraph list style and indent (manuscript formatting). */
  listStyle?: ListStyle;
  indentLevel?: number;
  /** Table cells when type is `table`. */
  tableRows?: string[][];
  /** Data URL or object URL when type is `image`. */
  imageSrc?: string;
  imageAlt?: string;
  /** SpeakFiction media-store id when the picture is not an inline data URL. */
  mediaId?: string;
  imageMime?: string;
  /** Divider appearance when type is `divider`. */
  dividerStyle?: DividerStyle;
}

export function isProseBlock(type: BlockType): boolean {
  return type === 'paragraph' || type === 'blockquote';
}
