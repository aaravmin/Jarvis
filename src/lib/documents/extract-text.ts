import "server-only";

/**
 * Server-side text extraction for uploaded documents. The Application & Outreach agent grounds every
 * field/draft in the user's materials (hard rule #3), and the most common material is a PDF or DOCX
 * resume. Without this, a PDF resume produced an empty corpus and the agent could fill nothing. We
 * extract here, on the server, so the user only has to attach the file (no manual copy-paste).
 *
 * Plaintext is read directly; PDFs go through unpdf (a serverless build of pdf.js, no native deps or
 * worker); DOCX through mammoth. Anything we can't parse returns "" and the user can still paste text.
 */

const MAX_TEXT = 200_000; // matches the API/UI cap; guards against a pathological document

/** Collapse the noisy whitespace PDF/DOCX extractors emit, without destroying paragraph breaks. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

function isPdf(mimeType: string | undefined, name: string): boolean {
  return mimeType === "application/pdf" || /\.pdf$/i.test(name);
}

function isDocx(mimeType: string | undefined, name: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(name)
  );
}

function isPlainish(mimeType: string | undefined, name: string): boolean {
  return (
    (mimeType?.startsWith("text/") ?? false) ||
    /\.(txt|md|markdown|json|csv|tex|rtf|html?)$/i.test(name)
  );
}

async function fromPdf(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

async function fromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

function isSpreadsheet(mimeType: string | undefined, name: string): boolean {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    /\.(xlsx|xlsm)$/i.test(name)
  );
}

/** A spreadsheet cell may be a string, number, date, or a rich object (hyperlink, formula, rich text). */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (o.result != null) return String(o.result);
    if (typeof o.hyperlink === "string") return String(o.text ?? o.hyperlink);
    const rich = (o as { richText?: { text?: string }[] }).richText;
    if (Array.isArray(rich)) return rich.map((r) => r.text ?? "").join("");
    return "";
  }
  return String(v);
}

/** Read every sheet of an .xlsx into tab-separated rows so a spreadsheet of people becomes readable text. */
async function fromSpreadsheet(buffer: Buffer): Promise<string> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  // exceljs's types expect its own Buffer shape; cast to its load() parameter type.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const out: string[] = [];
  wb.eachSheet((sheet) => {
    if (sheet.rowCount === 0) return;
    out.push(`# ${sheet.name}`);
    sheet.eachRow((row) => {
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = vals.map((v) => cellText(v));
      if (cells.some((c) => c.length)) out.push(cells.join("\t"));
    });
    out.push("");
  });
  return out.join("\n");
}

/**
 * Best-effort text from a document's bytes. Never throws, on any failure it returns "" so the upload
 * still succeeds and the user can paste text manually. `name` is the original filename (for extension
 * sniffing when the mime type is generic, e.g. application/octet-stream).
 */
export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string | undefined,
  name: string,
): Promise<string> {
  try {
    if (isPdf(mimeType, name)) return tidy(await fromPdf(buffer));
    if (isDocx(mimeType, name)) return tidy(await fromDocx(buffer));
    // Spreadsheets keep their tab structure (not run through tidy, which would merge columns).
    if (isSpreadsheet(mimeType, name)) return (await fromSpreadsheet(buffer)).slice(0, MAX_TEXT);
    if (isPlainish(mimeType, name)) return tidy(buffer.toString("utf8"));
    return "";
  } catch {
    return "";
  }
}

/** Which file kinds we can pull text from, used by the UI to set expectations. */
export function canExtract(mimeType: string | undefined, name: string): boolean {
  return isPdf(mimeType, name) || isDocx(mimeType, name) || isSpreadsheet(mimeType, name) || isPlainish(mimeType, name);
}
