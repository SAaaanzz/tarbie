import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import {
  Loader2, FileText, CheckCircle2, XCircle, Clock,
  Download, Eye,
} from 'lucide-react';
import mammoth from 'mammoth';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://dprabota.bahtyarsanzhar.workers.dev';

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
  const [viewDoc, setViewDoc] = useState<DocumentData | null>(null);

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

  const [wordHtml, setWordHtml] = useState<string>('');
  const [loadingDoc, setLoadingDoc] = useState(false);

  const handleViewDocument = async (id: string) => {
    setLoadingDoc(true);
    try {
      // Fetch document metadata (signatures)
      const doc = await api.get<DocumentData>(`/api/lesson-approvals/${id}/document`);
      setViewDoc(doc);

      // Fetch the actual Word file and convert to HTML
      const token = localStorage.getItem('token');
      const fileRes = await fetch(`${API_BASE}/api/lesson-approvals/${id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!fileRes.ok) {
        const errText = await fileRes.text();
        throw new Error(`File download failed (${fileRes.status}): ${errText.slice(0, 200)}`);
      }
      const arrayBuffer = await fileRes.arrayBuffer();
      // Verify it's a valid DOCX (ZIP starts with PK\x03\x04)
      const headerView = new Uint8Array(arrayBuffer.slice(0, 4));
      if (headerView[0] !== 0x50 || headerView[1] !== 0x4b) {
        throw new Error(`Invalid file: expected DOCX but got ${headerView[0]?.toString(16)} ${headerView[1]?.toString(16)} (size: ${arrayBuffer.byteLength})`);
      }
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        { convertImage: mammoth.images.imgElement((image) => {
          return image.read('base64').then((imageBuffer) => {
            return { src: `data:${image.contentType};base64,${imageBuffer}` };
          });
        })}
      );

      // Inject signatures into the Word HTML where underscores are
      let html = result.value;
      html = injectSignatures(html, doc);
      setWordHtml(html);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoadingDoc(false);
    }
  };

  const downloadPdf = useCallback(() => {
    if (!viewDoc || !wordHtml) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(generatePdfHtml(viewDoc, wordHtml));
    w.document.close();
    setTimeout(() => w.print(), 500);
  }, [viewDoc, wordHtml]);

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
                  {/* Download Word file for review */}
                  <button
                    className="rounded-lg p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                    title={lang === 'kz' ? 'Word файлды жүктеу' : 'Скачать Word файл'}
                    onClick={() => {
                      const token = localStorage.getItem('token');
                      fetch(`${API_BASE}/api/lesson-approvals/${a.id}/file`, {
                        headers: { Authorization: `Bearer ${token}` },
                      }).then(r => r.blob()).then(blob => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = a.word_file_name;
                        link.click();
                        URL.revokeObjectURL(url);
                      });
                    }}>
                    <Download size={16} />
                  </button>
                  {/* Preview document (with signatures if approved) */}
                  <button onClick={() => handleViewDocument(a.id)}
                    className={`rounded-lg p-2 transition-colors ${a.status === 'approved'
                      ? 'text-green-600 bg-green-50 hover:bg-green-100'
                      : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}
                    title={a.status === 'approved'
                      ? (lang === 'kz' ? 'PDF құжатты көру (қолтаңбамен)' : 'Просмотр PDF с подписями')
                      : (lang === 'kz' ? 'Құжатты көру' : 'Предпросмотр документа')}>
                    <Eye size={16} />
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

      {/* Document preview modal */}
      {(viewDoc || loadingDoc) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            {loadingDoc ? (
              <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary-600" /></div>
            ) : viewDoc && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {lang === 'kz' ? 'Бекітілген құжат' : 'Утверждённый документ'}
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={downloadPdf}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700">
                      <Download size={16} />
                      PDF
                    </button>
                    <button onClick={() => { setViewDoc(null); setWordHtml(''); }}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>

                {/* Render the actual Word document as-is, with signatures injected inline */}
                <div className="border border-gray-200 rounded-lg bg-white px-8 py-6 prose prose-sm max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_img]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: wordHtml }}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Inject signature images into the Word HTML where underscore patterns appear
function injectSignatures(html: string, doc: DocumentData): string {
  const sigImg = (src: string | null) =>
    src ? `<img src="${src}" style="height:40px;object-fit:contain;display:inline-block;vertical-align:bottom;margin:0 4px"/>` : '';

  // Replace underscore lines before "А.Абдраймова" with admin signature
  // Pattern: __________А.Абдраймова or variants
  html = html.replace(
    /_{3,}\s*А\.?\s*Абдраймова/g,
    `${sigImg(doc.admin_signature)} А.Абдраймова`
  );

  // Replace underscore lines before curator name (Топ жетекшісі: _________)
  html = html.replace(
    /(Топ жетекшісі:\s*)_{3,}/g,
    `$1${sigImg(doc.curator_signature)}`
  );

  // Replace standalone date underscore lines near "2026" (admin approval date)
  if (doc.approved_at) {
    const dateStr = new Date(doc.approved_at).toLocaleDateString('ru-RU');
    html = html.replace(
      /_{3,}(\s*2026\s*ж\.?)/g,
      `${dateStr}$1`
    );
  }

  return html;
}

function generatePdfHtml(doc: DocumentData, wordHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${doc.topic}</title>
<style>
body { font-family: 'Times New Roman', serif; padding: 40px 60px; font-size: 14px; line-height: 1.6; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; }
td, th { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
p { margin: 4px 0; }
img { max-width: 100%; }
@media print { body { padding: 20px 40px; } }
</style></head><body>
${wordHtml}
</body></html>`;
}
