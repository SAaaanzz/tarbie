import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import {
  Loader2, FileText, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import JSZip from 'jszip';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://dprabota.bahtyarsanzhar.workers.dev';

function getToken(): string {
  try {
    const raw = localStorage.getItem('tarbie-auth');
    if (raw) return JSON.parse(raw).state?.token ?? '';
  } catch { /* ignore */ }
  return '';
}

interface ApprovalRow {
  id: string;
  session_id: string;
  curator_id: string;
  status: 'pending' | 'approved' | 'rejected';
  word_file_name: string;
  admin_comment: string | null;
  approved_at: string | null;
  created_at: string;
  topic: string;
  planned_date: string;
  curator_name?: string;
}

interface DocumentData {
  id: string;
  topic: string;
  planned_date: string;
  curator_name: string;
  admin_name: string;
  approved_at: string;
  curator_signature: string | null;
  admin_signature: string | null;
  admin_signature_2: string | null;
  status: string;
}

export function LessonApprovalsPage() {
  const { user, lang } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isCurator = user?.role === 'teacher';

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const loadApprovals = () => {
    setLoading(true);
    const endpoint = isCurator
      ? '/api/lesson-approvals/my'
      : tab === 'pending'
        ? '/api/lesson-approvals/pending'
        : '/api/lesson-approvals/all';

    api.get<ApprovalRow[]>(endpoint)
      .then(setApprovals)
      .catch(() => setApprovals([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadApprovals(); }, [tab]);

  const handleApprove = async (id: string) => {
    setSubmitting(id);
    try {
      await api.post(`/api/lesson-approvals/${id}/approve`);
      loadApprovals();
    } catch { }
    setSubmitting(null);
  };

  const handleReject = async (id: string) => {
    const comment = prompt(lang === 'kz' ? 'Бас тарту себебі:' : 'Причина отклонения:');
    if (comment === null) return;
    setSubmitting(id);
    try {
      await api.post(`/api/lesson-approvals/${id}/reject`, { comment });
      loadApprovals();
    } catch { }
    setSubmitting(null);
  };

  // Download the signed document as PDF (server-side ConvertAPI, exact Word layout)
  const handleDownloadPdf = async (id: string, fileName: string) => {
    setDownloading(id);
    try {
      const token = getToken();
      const doc = await api.get<DocumentData>(`/api/lesson-approvals/${id}/document`);
      const fileRes = await fetch(`${API_BASE}/api/lesson-approvals/${id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!fileRes.ok) {
        const errText = await fileRes.text();
        alert(`Ошибка (${fileRes.status}): ${errText.slice(0, 150)}`);
        return;
      }
      const arrayBuffer = await fileRes.arrayBuffer();
      const signedDocx = await injectSignaturesIntoDocx(arrayBuffer, doc);

      // Send the signed .docx to the worker, which converts it to PDF (key stays server-side)
      const pdfRes = await fetch(`${API_BASE}/api/lesson-approvals/${id}/pdf`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        body: signedDocx,
      });
      if (!pdfRes.ok) {
        const errText = await pdfRes.text();
        alert(`Ошибка PDF (${pdfRes.status}): ${errText.slice(0, 200)}`);
        return;
      }
      const pdfBuf = await pdfRes.arrayBuffer();
      const blob = new Blob([pdfBuf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName.replace(/\.docx?$/i, '') + '_signed.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setDownloading(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium"><Clock size={12} />{lang === 'kz' ? 'Күтуде' : 'Ожидание'}</span>;
      case 'approved':
        return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium"><CheckCircle2 size={12} />{lang === 'kz' ? 'Бекітілді' : 'Одобрено'}</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium"><XCircle size={12} />{lang === 'kz' ? 'Қабылданбады' : 'Отклонено'}</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary-600" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'kz' ? 'Сабақ бекіту' : 'Утверждение уроков'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isCurator
              ? (lang === 'kz' ? 'Сіздің жіберген сабақтарыңыз' : 'Ваши отправленные уроки')
              : (lang === 'kz' ? 'Кураторлардан келген сабақтар' : 'Уроки от кураторов')}
          </p>
        </div>
      </div>

      {/* Admin tabs */}
      {isAdmin && (
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          <button onClick={() => setTab('pending')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {lang === 'kz' ? 'Күтуде' : 'Ожидание'} ({approvals.filter(a => a.status === 'pending').length})
          </button>
          <button onClick={() => setTab('all')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {lang === 'kz' ? 'Барлығы' : 'Все'}
          </button>
        </div>
      )}

      {/* List */}
      {approvals.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{lang === 'kz' ? 'Сабақтар жоқ' : 'Нет уроков'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900">{a.topic}</h3>
                    {statusBadge(a.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{a.planned_date}</span>
                    {a.curator_name && <span>• {a.curator_name}</span>}
                    <span className="flex items-center gap-1"><FileText size={12} />{a.word_file_name}</span>
                  </div>
                  {a.admin_comment && (
                    <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg p-2">
                      {lang === 'kz' ? 'Себебі: ' : 'Причина: '}{a.admin_comment}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* PDF only — Word download is disabled so signatures can't be moved/edited */}
                  <button
                    className="rounded-lg p-2 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                    title={a.status === 'approved'
                      ? (lang === 'kz' ? 'PDF жүктеу (қолтаңбамен)' : 'Скачать PDF с подписями')
                      : (lang === 'kz' ? 'PDF жүктеу (қарап шығу)' : 'Скачать PDF (для проверки)')}
                    disabled={downloading === a.id}
                    onClick={() => handleDownloadPdf(a.id, a.word_file_name)}>
                    {downloading === a.id ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  </button>
                  {/* Admin approve/reject */}
                  {isAdmin && a.status === 'pending' && (
                    <>
                      <button onClick={() => handleApprove(a.id)} disabled={submitting === a.id}
                        className="rounded-lg p-2 text-green-600 bg-green-50 hover:bg-green-100 transition-colors"
                        title={lang === 'kz' ? 'Бекіту және қол қою' : 'Одобрить и подписать'}>
                        {submitting === a.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      </button>
                      <button onClick={() => handleReject(a.id)} disabled={submitting === a.id}
                        className="rounded-lg p-2 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                        title={lang === 'kz' ? 'Қабылдамау' : 'Отклонить'}>
                        <XCircle size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inject signatures directly into .docx XML ──

function dataUriToBytes(dataUri: string): Uint8Array {
  const base64 = dataUri.split(',')[1] ?? '';
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

function makeInlineImageXml(rId: string, cx: number, cy: number): string {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${Math.floor(Math.random() * 99999)}" name="sig"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="sig.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

async function injectSignaturesIntoDocx(
  docxBuffer: ArrayBuffer,
  doc: DocumentData
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(docxBuffer);

  let xml = await zip.file('word/document.xml')!.async('string');
  let relsXml = await zip.file('word/_rels/document.xml.rels')!.async('string');

  const sigImages: { id: string; path: string; data: Uint8Array }[] = [];
  let imgCounter = 100;

  const addSigImage = (dataUri: string | null): string | null => {
    if (!dataUri) return null;
    const rId = `rIdSig${imgCounter}`;
    const imgPath = `media/sig${imgCounter}.png`;
    sigImages.push({ id: rId, path: imgPath, data: dataUriToBytes(dataUri) });
    imgCounter++;
    return rId;
  };

  const adminSigRId = addSigImage(doc.admin_signature);
  const adminSig2RId = addSigImage(doc.admin_signature_2);
  const curatorSigRId = addSigImage(doc.curator_signature);

  // Signature size: ~2cm wide x 0.8cm tall in EMUs (1cm = 360000 EMUs)
  const sigW = 540000;
  const sigH = 216000;

  // Replace underscore text runs with signature images in the XML
  // Pattern: text nodes containing "____...А.Абдраймова" → admin signature 1
  if (adminSigRId) {
    const imgXml = `</w:t></w:r><w:r><w:rPr/>${makeInlineImageXml(adminSigRId, sigW, sigH)}</w:r><w:r><w:t xml:space="preserve">`;
    xml = xml.replace(
      /(<w:t[^>]*>)([^<]*_{3,}\s*)(А\.?\s*Абдраймова)(<\/w:t>)/g,
      (_, open, _underscores, name, close) => `${open}${imgXml} ${name}${close}`
    );
    // Also handle split across runs: underscores in one <w:t>, name in next
    xml = xml.replace(
      /(<w:t[^>]*>)([^<]*_{3,})(<\/w:t>)((?:<\/w:r><w:r>(?:<w:rPr[^>]*\/>|<w:rPr>.*?<\/w:rPr>)?)?<w:t[^>]*>)(\s*А\.?\s*Абдраймова)/gs,
      (_, _o, _u, _c, middle, name) => `<w:t xml:space="preserve">${imgXml} </w:t>${middle}${name}`
    );
  }

  // Pattern: "____...Сонурова Мехирам Мухтаровна" → admin signature 2
  if (adminSig2RId) {
    const imgXml = `</w:t></w:r><w:r><w:rPr/>${makeInlineImageXml(adminSig2RId, sigW, sigH)}</w:r><w:r><w:t xml:space="preserve">`;
    xml = xml.replace(
      /(<w:t[^>]*>)([^<]*_{3,}\s*)(Сонурова[^<]*)(<\/w:t>)/g,
      (_, open, _underscores, name, close) => `${open}${imgXml} ${name}${close}`
    );
    xml = xml.replace(
      /(<w:t[^>]*>)([^<]*_{3,})(<\/w:t>)((?:<\/w:r><w:r>(?:<w:rPr[^>]*\/>|<w:rPr>.*?<\/w:rPr>)?)?<w:t[^>]*>)(\s*Сонурова)/gs,
      (_, _o, _u, _c, middle, name) => `<w:t xml:space="preserve">${imgXml} </w:t>${middle}${name}`
    );
  }

  // Pattern: "Топ жетекшісі: ____..." → curator signature
  if (curatorSigRId) {
    const imgXml = `</w:t></w:r><w:r><w:rPr/>${makeInlineImageXml(curatorSigRId, sigW, sigH)}</w:r><w:r><w:t xml:space="preserve">`;
    xml = xml.replace(
      /(<w:t[^>]*>)([^<]*Топ жетекшісі:\s*)_{3,}([^<]*)(<\/w:t>)/g,
      (_, open, prefix, suffix, close) => `${open}${prefix}${imgXml} ${suffix}${close}`
    );
  }

  // Replace date underscores: "____  2026 ж." and "«_____»__________ 2026ж."
  if (doc.approved_at) {
    const d = new Date(doc.approved_at);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['қаңтар','ақпан','наурыз','сәуір','мамыр','маусым','шілде','тамыз','қыркүйек','қазан','қараша','желтоқсан'];
    const monthKz = months[d.getMonth()] ?? '';
    const year = d.getFullYear();

    // IMPORTANT: handle the specific "«_____»__________ 2026ж." pattern FIRST,
    // otherwise the generic underscore pattern below eats "__________ 2026ж."
    // and leaves a stray "«_____»" → "«_____»«13» маусым 2026ж.".
    // Tolerant of a run boundary between the «day» and the month underscores.
    xml = xml.replace(
      /«_{3,}»(?:<\/w:t>.*?<w:t[^>]*>)?\s*_{3,}(\s*20\d{2}\s*ж\.?)/gs,
      `«${day}» ${monthKz} ${year} ж.`
    );

    // Generic: bare "____  2026 ж." (e.g. the deputy-director line) → «day» month year
    xml = xml.replace(
      /_{3,}(\s*20\d{2}\s*ж\.?)/g,
      `«${day}» ${monthKz} $1`
    );
  }

  // Save modified XML
  zip.file('word/document.xml', xml);

  // Add image files to zip
  for (const img of sigImages) {
    zip.file(`word/${img.path}`, img.data);
  }

  // Add relationships for images
  const closingTag = '</Relationships>';
  const newRels = sigImages.map(img =>
    `<Relationship Id="${img.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${img.path}"/>`
  ).join('');
  relsXml = relsXml.replace(closingTag, newRels + closingTag);
  zip.file('word/_rels/document.xml.rels', relsXml);

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
