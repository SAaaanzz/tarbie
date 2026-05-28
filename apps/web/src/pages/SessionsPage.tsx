import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { Plus, CalendarDays, CheckCircle2, Trash2, Loader2, Clock, MapPin, Upload, Download, FileSpreadsheet, X, AlertTriangle, Wand2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SessionStatus, TarbieSession } from '@tarbie/shared';
import { COLLEGE_PAIRS, BUILDINGS, getFloorsForBuilding, getRoomsForFloor } from '@tarbie/shared';
import type { BuildingCode, RoomInfo } from '@tarbie/shared';

interface SessionWithMeta extends TarbieSession {
  class_name: string;
  teacher_name: string;
}

export function SessionsPage() {
  const { user, lang } = useAuthStore();
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [filter, setFilter] = useState<SessionStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const PAGE_SIZE = 50;

  const loadSessions = async (p = page) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { pageSize: String(PAGE_SIZE), page: String(p) };
      if (filter) params['status'] = filter;
      const result = await api.getRaw<{ success: boolean; data: SessionWithMeta[]; total: number; page: number; pageSize: number }>('/api/sessions', params);
      setSessions(result.data ?? []);
      setTotalItems(result.total ?? 0);
    } catch {
      setSessions([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { loadSessions(page); }, [page, filter]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const handleComplete = async (id: string) => {
    try {
      await api.patch(`/api/sessions/${id}/complete`, {});
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    }
  };

  const handleDelete = async (id: string) => {
    const msg = lang === 'kz' ? 'Жоюға сенімдісіз бе?' : 'Вы уверены, что хотите удалить?';
    if (!confirm(msg)) return;
    try {
      await api.delete(`/api/sessions/${id}`);
      await loadSessions();
    } catch (err) {
      alert(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    }
  };

  const exportSessions = async (mode: 'clean' | 'changes') => {
    const XLSX = await import('xlsx');

    // Fetch ALL sessions for export (not just current page)
    let allSessions = sessions;
    if (totalItems > PAGE_SIZE) {
      try {
        const params: Record<string, string> = { pageSize: '2500', page: '1' };
        if (filter) params['status'] = filter;
        const result = await api.getRaw<{ data: SessionWithMeta[]; total: number }>('/api/sessions', params);
        allSessions = result.data ?? sessions;
      } catch { /* fallback to current page */ }
    }

    const statusLabel = (s: string) => {
      const map: Record<string, string> = {
        pending_approval: lang === 'kz' ? 'Бекіту күтуде' : 'На утверждении',
        planned: lang === 'kz' ? 'Жоспарланған' : 'Запланировано',
        completed: lang === 'kz' ? 'Аяқталған' : 'Завершено',
        cancelled: lang === 'kz' ? 'Бас тартылған' : 'Отменено',
        rescheduled: lang === 'kz' ? 'Ауыстырылған' : 'Перенесено',
      };
      return map[s] || s;
    };

    const header = [
      lang === 'kz' ? 'Топ' : 'Группа',
      lang === 'kz' ? 'Куратор' : 'Куратор',
      lang === 'kz' ? 'Тақырып' : 'Тема',
      lang === 'kz' ? 'Күні' : 'Дата',
      lang === 'kz' ? 'Уақыт' : 'Время',
      lang === 'kz' ? 'Аудитория' : 'Аудитория',
      lang === 'kz' ? 'Мәртебе' : 'Статус',
      lang === 'kz' ? 'Ұзақтығы (мин)' : 'Длительность (мин)',
    ];

    if (mode === 'changes') {
      header.push(lang === 'kz' ? 'Өзгерістер' : 'Изменения');
    }

    const rows = allSessions.map(s => {
      const row: (string | number)[] = [
        s.class_name,
        s.teacher_name,
        s.topic || '',
        s.planned_date,
        s.time_slot || '',
        s.room || '',
        statusLabel(s.status),
        s.duration_minutes ?? 30,
      ];

      if (mode === 'changes') {
        const changes: string[] = [];
        if (s.status === 'completed') changes.push(lang === 'kz' ? '✓ Аяқталды' : '✓ Завершено');
        if (s.status === 'cancelled') changes.push(lang === 'kz' ? '✗ Бас тартылды' : '✗ Отменено');
        if (s.status === 'rescheduled') changes.push(lang === 'kz' ? '↻ Ауыстырылды' : '↻ Перенесено');
        if (!s.topic) changes.push(lang === 'kz' ? '⚠ Тақырып жоқ' : '⚠ Нет темы');
        row.push(changes.join('; '));
      }

      return row;
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    // Set column widths
    ws['!cols'] = [
      { wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 10 },
      ...(mode === 'changes' ? [{ wch: 28 }] : []),
    ];

    // Apply colors for change mode
    if (mode === 'changes') {
      for (let r = 0; r < allSessions.length; r++) {
        const s = allSessions[r]!;
        const rowIdx = r + 1; // skip header
        let fill: { fgColor?: { rgb: string } } | null = null;
        if (s.status === 'completed') fill = { fgColor: { rgb: 'C6EFCE' } };
        else if (s.status === 'cancelled') fill = { fgColor: { rgb: 'FFC7CE' } };
        else if (s.status === 'rescheduled') fill = { fgColor: { rgb: 'FFEB9C' } };
        else if (!s.topic) fill = { fgColor: { rgb: 'FCE4EC' } };
        if (fill) {
          for (let c = 0; c < header.length; c++) {
            const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
            if (!ws[addr]) ws[addr] = { v: '', t: 's' };
            ws[addr].s = { fill: { patternType: 'solid', ...fill } };
          }
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, lang === 'kz' ? 'Сабақтар' : 'Занятия');
    const suffix = mode === 'changes' ? '_changes' : '';
    XLSX.writeFile(wb, `sessions_export${suffix}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'kz' ? 'Тәрбие сағаттары' : 'Тәрбие сағаттары'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {lang === 'kz' ? 'Барлық жоспарланған және өткен сабақтар' : 'Все запланированные и прошедшие занятия'}
          </p>
        </div>
        {(user?.role === 'admin' || user?.role === 'teacher') && (
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button className="btn-secondary text-sm" onClick={() => setShowExportMenu(!showExportMenu)}>
                <Download size={16} className="mr-1.5" />
                Excel
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <button onClick={() => { exportSessions('clean'); setShowExportMenu(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                      <Download size={14} />
                      {lang === 'kz' ? 'Таза экспорт' : 'Чистый экспорт'}
                    </button>
                    <button onClick={() => { exportSessions('changes'); setShowExportMenu(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                      <FileSpreadsheet size={14} />
                      {lang === 'kz' ? 'Өзгерістермен' : 'С отметками изменений'}
                    </button>
                  </div>
                </>
              )}
            </div>
            {user?.role === 'admin' && (
              <>
                <button className="btn-secondary text-sm" onClick={() => setShowAutoAssign(true)}>
                  <Wand2 size={16} className="mr-1.5" />
                  {lang === 'kz' ? 'Авто' : 'Авто'}
                </button>
                <button className="btn-secondary text-sm" onClick={() => setShowImport(true)}>
                  <Upload size={16} className="mr-1.5" />
                  {lang === 'kz' ? 'Импорт' : 'Импорт'}
                </button>
              </>
            )}
            <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
              <Plus size={16} className="mr-1.5" />
              {lang === 'kz' ? 'Жаңа сабақ' : 'Новое занятие'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        {(['', 'pending_approval', 'planned', 'completed', 'cancelled', 'rescheduled'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === s
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
            }`}
          >
            {s === '' ? (lang === 'kz' ? 'Барлығы' : 'Все') :
             s === 'pending_approval' ? (lang === 'kz' ? 'Бекіту күтуде' : 'На утверждении') :
             s === 'planned' ? (lang === 'kz' ? 'Жоспарланған' : 'Запланировано') :
             s === 'completed' ? (lang === 'kz' ? 'Аяқталған' : 'Завершено') :
             s === 'cancelled' ? (lang === 'kz' ? 'Бас тартылған' : 'Отменено') :
             lang === 'kz' ? 'Ауыстырылған' : 'Перенесено'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary-600" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="py-20 text-center">
          <CalendarDays size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">
            {lang === 'kz' ? 'Сабақтар табылмады' : 'Занятия не найдены'}
          </p>
        </div>
      ) : (
        <>
        <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  {lang === 'kz' ? 'Тақырып' : 'Тема'}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  {lang === 'kz' ? 'Топ' : 'Группа'}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  {lang === 'kz' ? 'Күні / Уақыт' : 'Дата / Время'}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  {lang === 'kz' ? 'Аудитория' : 'Аудитория'}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  {lang === 'kz' ? 'Мәртебе' : 'Статус'}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                  {lang === 'kz' ? 'Әрекеттер' : 'Действия'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{s.topic}</p>
                    {s.notes && <p className="mt-0.5 text-xs text-gray-400 truncate max-w-xs">{s.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.class_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div>{s.planned_date}</div>
                    {s.time_slot && <div className="text-xs text-gray-400 flex items-center gap-1"><Clock size={10} />{s.time_slot}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {s.room ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        <MapPin size={10} />{s.room}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status as SessionStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {s.status === 'planned' && (user?.role === 'admin' || user?.role === 'teacher') && (
                        <button
                          onClick={() => handleComplete(s.id)}
                          className="rounded-lg p-1.5 text-green-600 hover:bg-green-50"
                          title={lang === 'kz' ? 'Аяқтау' : 'Завершить'}
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      )}
                      {(user?.role === 'admin' || user?.role === 'teacher') && (
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                          title={lang === 'kz' ? 'Жою' : 'Удалить'}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-3">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{s.topic}</p>
                  {s.notes && <p className="mt-0.5 text-xs text-gray-400 truncate">{s.notes}</p>}
                </div>
                <StatusBadge status={s.status as SessionStatus} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="font-medium text-gray-700">{s.class_name}</span>
                <span className="flex items-center gap-1"><CalendarDays size={11} />{s.planned_date}</span>
                {s.time_slot && <span className="flex items-center gap-1"><Clock size={11} />{s.time_slot}</span>}
                {s.room && <span className="flex items-center gap-1"><MapPin size={11} />{s.room}</span>}
              </div>
              {(user?.role === 'admin' || user?.role === 'teacher') && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  {s.status === 'planned' && (
                    <button
                      onClick={() => handleComplete(s.id)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      <CheckCircle2 size={14} />
                      {lang === 'kz' ? 'Аяқтау' : 'Завершить'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors ml-auto"
                  >
                    <Trash2 size={14} />
                    {lang === 'kz' ? 'Жою' : 'Удалить'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">
              {lang === 'kz'
                ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalItems)} / ${totalItems}`
                : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalItems)} из ${totalItems}`}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[28px] rounded-lg px-1.5 py-1 text-xs font-medium transition-colors ${
                        page === p
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {showCreate && (
        <CreateSessionModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadSessions(); }}
          lang={lang}
        />
      )}
      {showImport && (
        <SessionImportModal
          lang={lang}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); loadSessions(); }}
        />
      )}
      {showAutoAssign && (
        <AutoAssignModal
          lang={lang}
          onClose={() => setShowAutoAssign(false)}
          onDone={() => { setShowAutoAssign(false); loadSessions(); }}
        />
      )}
    </div>
  );
}

/* ─── Auto-Assign Modal ─── */

// Regex to match Kazakh college group codes like П22-4А, ИС25-1А, Web25-1Б, ТЗИ25-1, С25-1, РЭТ25-1, 1ИС25-1
const GROUP_CODE_RE = /\d{0,1}[A-Za-zА-ЯЁа-яёӘәҒғҚқҢңӨөҰұҮүІіҺһ]{1,8}\d{2}-\d{1,2}[A-Za-zА-ЯЁа-яёӘәҒғҚқҢңӨөҰұҮүІіҺһ]{0,3}/g;

// Extract auditorium/room from cell text
// Real formats: "МК 131", "ГК 409", "IT 124", "каб.301", "ауд.205", "спорт зал"
// Cell structure: [Room] [Teacher Subject] [GroupCode]
function extractRoom(cellText: string, groupCodes: string[]): string {
  // Remove group codes from text to avoid false matches
  let cleaned = cellText;
  for (const g of groupCodes) cleaned = cleaned.replace(g, '');
  cleaned = cleaned.trim();

  // 1) Building code + room number: "МК 131", "ГК 409", "IT 124", "МК131", "НК 205"
  //    Building codes are short (2-4 chars), mostly uppercase: МК, ГК, IT, НК, УК
  const buildingMatch = cleaned.match(/(?:^|[\s,;])([A-Za-zА-ЯЁӘҒҚҢӨҰҮІҺа-яёәғқңөұүіһ]{1,4})\s*(\d{2,4}[а-яa-z]?)(?=[\s,;.]|$)/);
  if (buildingMatch) {
    const code = buildingMatch[1]!;
    const num = buildingMatch[2]!;
    // Accept if code is short and looks like a building abbreviation (not a word like "рус", "яз")
    // Building codes: МК, ГК, IT, НК, УК, КБ — typically 2-3 uppercase letters
    if (code.length <= 3 || /^[A-ZА-ЯЁӘҒҚҢӨҰҮІҺ]{2,4}$/.test(code)) {
      return `${code} ${num}`;
    }
  }

  // 2) Explicit labels: "каб.301", "ауд. 205", "кабинет 301"
  const labelMatch = cleaned.match(/(?:каб|ауд|кабинет|аудитория)\.?\s*(\d{1,4}[а-яa-z]?)/i);
  if (labelMatch) return labelMatch[1]!.trim();

  // 3) Standalone 3-4 digit number at the start of the text
  const startNum = cleaned.match(/^(\d{3,4}[а-яa-z]?)(?:\s|$)/);
  if (startNum) return startNum[1]!.trim();

  // 4) "спорт зал", "акт зал" etc.
  const hallMatch = cleaned.match(/(спорт\.?\s*зал|акт\.?\s*зал|физ\.?\s*зал)/i);
  if (hallMatch) return hallMatch[1]!.trim();

  return '';
}

interface ParsedGroup {
  group_name: string;
  shift: number; // 1 or 2
  first_pair: number; // local pair number 1-4
  auditorium: string;
}

interface AutoAssignResults {
  log: Array<{ group: string; date: string; pair: number; room?: string; status: string; message?: string }>;
  created: number;
  duplicates: number;
  errors: number;
  total: number;
}

// Extract date from document text (DD.MM.YYYY format)
function extractDateFromText(text: string): string | null {
  // Match patterns like 16.03.2026, 16/03/2026
  const dateMatch = text.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (dateMatch) {
    const day = dateMatch[1]!.padStart(2, '0');
    const month = dateMatch[2]!.padStart(2, '0');
    const year = dateMatch[3]!;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function parseDocxSchedule(html: string): { groups: ParsedGroup[]; shift: number; rawText: string; debug: string; detectedDate: string | null } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rawText = doc.body.textContent || '';
  const debugLines: string[] = [];

  // Extract date from document
  const detectedDate = extractDateFromText(rawText);
  debugLines.push(`Detected date: ${detectedDate || 'none'}`);

  // Find ALL tables in document (schedule may span multiple pages = multiple tables)
  const tables = doc.querySelectorAll('table');
  debugLines.push(`Found ${tables.length} table(s)`);
  if (tables.length === 0) return { groups: [], shift: 1, rawText, debug: debugLines.join('\n'), detectedDate };

  // Collect all groups from ALL tables
  const groupFirstPair = new Map<string, { pair: number; shift: number; auditorium: string }>(); 

  // Determine shift for each table:
  // - If document has 2+ tables, assume table 0 = shift 1, table 1 = shift 2
  //   UNLESS text before a table explicitly says otherwise
  // - If only 1 table, detect shift from document text
  const hasMultipleTables = tables.length >= 2;

  for (let t = 0; t < tables.length; t++) {
    const table = tables[t]!;
    if (table.rows.length < 2) {
      debugLines.push(`Table ${t}: skipped (only ${table.rows.length} rows)`);
      continue;
    }

    // Detect shift for this table
    let tableShift = hasMultipleTables ? (t + 1) : 1; // default: table index + 1
    
    // Check text before this table for explicit shift indicators
    let prevEl = table.previousElementSibling;
    for (let scan = 0; scan < 15 && prevEl; scan++) {
      const txt = (prevEl.textContent || '').toLowerCase();
      if (txt.includes('ii смена') || txt.includes('ii ауысым') || txt.includes('2 смена') || txt.includes('2-смена') || txt.includes('2 ауысым')) {
        tableShift = 2; break;
      }
      if (txt.includes('i смена') || txt.includes('i ауысым') || txt.includes('1 смена') || txt.includes('1-смена') || txt.includes('1 ауысым')) {
        tableShift = 1; break;
      }
      prevEl = prevEl.previousElementSibling;
    }
    // Clamp shift to 1 or 2
    if (tableShift > 2) tableShift = 2;
    debugLines.push(`Table ${t}: ${table.rows.length} rows, shift=${tableShift}`);

    // Build column → pair number mapping from header row(s)
    const colToPair = new Map<number, number>();
    const headerRow = table.rows[0]!;
    debugLines.push(`  Header cells: ${headerRow.cells.length}`);

    // Roman numeral to digit
    const romanToNum = (s: string): number | null => {
      const map: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7 };
      return map[s.toUpperCase()] ?? null;
    };

    let logicalCol = 0;
    for (let hc = 0; hc < headerRow.cells.length; hc++) {
      const cell = headerRow.cells[hc]!;
      const cellText = (cell.textContent || '').trim();
      const colspan = cell.colSpan || 1;
      
      debugLines.push(`  Header[${hc}] col=${logicalCol} cs=${colspan}: "${cellText.substring(0, 50)}"`);

      // Try to extract pair number from header cell text
      // Patterns: "1 пара", "1-пара", "I пара", "пара 1", just "1", Roman "II", etc.
      let pairNum = 0;
      
      // Arabic digit + пара/сабақ
      const arabicMatch = cellText.match(/(\d)\s*[-–]?\s*(?:пара|сабақ|pair)/i)
        || cellText.match(/(?:пара|сабақ|pair)\s*[-–]?\s*(\d)/i);
      if (arabicMatch) {
        pairNum = parseInt(arabicMatch[1]!);
      }
      
      // Roman numeral + пара/сабақ
      if (!pairNum) {
        const romanMatch = cellText.match(/([IVX]{1,4})\s*[-–]?\s*(?:пара|сабақ|pair)/i)
          || cellText.match(/(?:пара|сабақ|pair)\s*[-–]?\s*([IVX]{1,4})/i);
        if (romanMatch) {
          pairNum = romanToNum(romanMatch[1]!) || 0;
        }
      }
      
      // Just a bare digit or Roman numeral (if cell is short)
      if (!pairNum && cellText.length <= 5) {
        const bareDigit = cellText.match(/^(\d)$/);
        if (bareDigit) {
          pairNum = parseInt(bareDigit[1]!);
        } else {
          const bareRoman = cellText.match(/^([IVX]{1,4})$/);
          if (bareRoman) {
            pairNum = romanToNum(bareRoman[1]!) || 0;
          }
        }
      }

      if (pairNum > 0) {
        for (let s = 0; s < colspan; s++) {
          colToPair.set(logicalCol + s, pairNum);
        }
        debugLines.push(`    → pair ${pairNum}`);
      }
      
      logicalCol += colspan;
    }

    // Fallback: if no pair numbers found, infer from structure
    if (colToPair.size === 0) {
      debugLines.push(`  No pair numbers in header, using fallback`);
      const dataRow = table.rows.length > 1 ? table.rows[1]! : null;
      const dataCols = dataRow ? dataRow.cells.length : headerRow.cells.length;

      if (headerRow.cells.length < dataCols) {
        // Header cells span multiple sub-columns → each header cell (after first) = 1 pair
        let lCol = 0;
        let pairCounter = 0;
        for (let hc = 0; hc < headerRow.cells.length; hc++) {
          const cs = headerRow.cells[hc]!.colSpan || 1;
          if (hc > 0) {
            pairCounter++;
            for (let s = 0; s < cs; s++) colToPair.set(lCol + s, pairCounter);
            debugLines.push(`    Fallback: cell ${hc} → pair ${pairCounter}`);
          }
          lCol += cs;
        }
      } else {
        for (let cc = 1; cc < dataCols; cc++) {
          colToPair.set(cc, cc);
          debugLines.push(`    Fallback 1:1: col ${cc} → pair ${cc}`);
        }
      }
    }

    // Parse data rows — extract group codes from cells
    // Column 0 is the auditorium (e.g. "ГК 100", "МК 131")
    for (let r = 1; r < table.rows.length; r++) {
      const row = table.rows[r]!;
      // Auditorium is always in the first cell of the row
      const rowRoom = (row.cells[0]?.textContent || '').trim();
      let logCol = 0;
      for (let c = 0; c < row.cells.length; c++) {
        const cell = row.cells[c]!;
        const colspan = cell.colSpan || 1;
        const cellText = cell.textContent || '';
        const matches = cellText.match(GROUP_CODE_RE);
        
        if (matches && c > 0) {
          const pairNum = colToPair.get(logCol) || colToPair.get(logCol + 1) || 0;
          // Use row's first cell as room; fallback to extractRoom from cell text
          const room = rowRoom || extractRoom(cellText, matches);
          debugLines.push(`  R${r}C${c}: "${cellText.substring(0, 60)}" → groups=[${matches.join(',')}] room="${room}" pair=${pairNum}`);
          
          if (pairNum > 0) {
            for (const m of matches) {
              const groupKey = m.trim();
              const existing = groupFirstPair.get(groupKey);
              if (!existing || pairNum < existing.pair) {
                groupFirstPair.set(groupKey, { pair: pairNum, shift: tableShift, auditorium: room });
              }
            }
          } else {
            debugLines.push(`  Row ${r}, col ${c} (log ${logCol}): groups [${matches.join(', ')}] no pair!`);
          }
        }
        
        logCol += colspan;
      }
    }
  }

  const groups: ParsedGroup[] = [];
  for (const [group_name, info] of groupFirstPair) {
    groups.push({ group_name, shift: info.shift, first_pair: info.pair, auditorium: info.auditorium });
  }

  groups.sort((a, b) => a.group_name.localeCompare(b.group_name));

  const debug = debugLines.join('\n');
  console.log('[Schedule Parser Debug]\n' + debug);
  console.log(`[Schedule Parser] Found ${groups.length} groups:`, groups);

  return { groups, shift: groups[0]?.shift ?? 1, rawText, debug, detectedDate };
}

function AutoAssignModal({ lang, onClose, onDone }: {
  lang: 'kz' | 'ru'; onClose: () => void; onDone: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'config' | 'results'>('upload');
  const [parsedGroups, setParsedGroups] = useState<ParsedGroup[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [duration, setDuration] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<AutoAssignResults | null>(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const wdNamesRu = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const wdNamesKz = ['Жексенбі', 'Дүйсенбі', 'Сейсенбі', 'Сәрсенбі', 'Бейсенбі', 'Жұма', 'Сенбі'];

  // Today's date for min constraint (no backdating)
  const todayStr = new Date().toISOString().split('T')[0]!;

  const SHIFT_TIMES: Record<number, Record<number, string>> = {
    1: { 1: '08:00-08:30', 2: '09:40-10:10', 3: '11:25-11:55', 4: '13:25-13:55' },
    2: { 1: '13:25-13:55', 2: '15:05-15:35', 3: '16:50-17:20', 4: '18:30-19:00' },
  };

  // Get weekday name from date string
  const getWeekdayName = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const wd = d.getDay();
    return lang === 'kz' ? wdNamesKz[wd] : wdNamesRu[wd];
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setParsing(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'docx' || ext === 'doc') {
        const mammoth = await import('mammoth');
        const arrayBuf = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuf });
        const { groups, debug, detectedDate } = parseDocxSchedule(result.value);
        setDebugInfo(debug);

        if (groups.length === 0) {
          setError(lang === 'kz' ? 'Топ кодтары табылмады.' : 'Коды групп не найдены.');
          setShowDebug(true);
          setParsing(false);
          return;
        }

        setParsedGroups(groups);
        // Auto-set date from document (if detected and not in the past)
        if (detectedDate && detectedDate >= todayStr) {
          setSelectedDate(detectedDate);
        }
        setStep('config');
      } else {
        setError(lang === 'kz' ? 'Тек .docx файлдарын жүктеңіз' : 'Загрузите файл .docx');
      }
    } catch (err) {
      setError(`${lang === 'kz' ? 'Қате' : 'Ошибка'}: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedDate) {
      setError(lang === 'kz' ? 'Күнді таңдаңыз' : 'Выберите дату');
      return;
    }
    if (selectedDate < todayStr) {
      setError(lang === 'kz' ? 'Өткен күнге тағайындау мүмкін емес' : 'Нельзя назначать задним числом');
      return;
    }

    // Determine weekday from selected date
    const d = new Date(selectedDate + 'T00:00:00');
    const weekday = d.getDay() === 0 ? 7 : d.getDay(); // 1=Mon..7=Sun

    // Build schedule: each group with this weekday
    const schedule = parsedGroups.map(g => ({
      group_name: g.group_name,
      weekday,
      shift: g.shift,
      first_pair: g.first_pair,
      auditorium: g.auditorium,
    }));

    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<AutoAssignResults>('/api/admin/sessions/auto-assign', {
        schedule,
        date_from: selectedDate,
        date_to: selectedDate,
        duration_minutes: duration,
      });
      setResults(res);
      setStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  // Count groups by shift
  const shift1Count = parsedGroups.filter(g => g.shift === 1).length;
  const shift2Count = parsedGroups.filter(g => g.shift === 2).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 sm:p-6 shadow-xl max-h-[90vh] flex flex-col my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wand2 size={20} className="text-purple-600" />
            {lang === 'kz' ? 'Автоматты тағайындау' : 'Авто-назначение'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X size={20} /></button>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {debugInfo && (
          <div className="mb-3">
            <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-gray-400 hover:text-gray-600 underline">
              {showDebug ? 'Скрыть отладку' : 'Показать отладку'}
            </button>
            {showDebug && (
              <pre className="mt-1 rounded-lg bg-gray-900 text-green-400 p-3 text-[10px] leading-tight max-h-48 overflow-auto whitespace-pre-wrap">{debugInfo}</pre>
            )}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className="mb-4 rounded-2xl bg-purple-50 p-5 text-center max-w-md w-full">
              <Wand2 size={36} className="mx-auto mb-2 text-purple-500" />
              <p className="text-sm font-medium text-gray-700 mb-1">
                {lang === 'kz' ? 'Кесте файлын жүктеңіз (.docx)' : 'Загрузите расписание (.docx)'}
              </p>
              <p className="text-xs text-gray-500">
                {lang === 'kz'
                  ? 'Дата, топтар, парлар мен смена автоматты анықталады'
                  : 'Дата, группы, пары и смена определятся автоматически'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <input ref={fileRef} type="file" accept=".docx" onChange={handleFile} className="hidden" />
              <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={parsing}>
                {parsing ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Upload size={18} className="mr-2" />}
                {parsing ? (lang === 'kz' ? 'Талдау...' : 'Анализ...') : (lang === 'kz' ? 'Word жүктеу' : 'Загрузить Word')}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Preview & single date */}
        {step === 'config' && (
          <>
            <div className="flex-1 overflow-auto mb-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {shift1Count > 0 && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-700">
                    I {lang === 'kz' ? 'смена' : 'смена'}: {shift1Count}
                  </span>
                )}
                {shift2Count > 0 && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-700">
                    II {lang === 'kz' ? 'смена' : 'смена'}: {shift2Count}
                  </span>
                )}
                <span className="text-sm text-gray-600">
                  {lang === 'kz' ? `${parsedGroups.length} топ` : `${parsedGroups.length} групп`}
                </span>
              </div>

              <div className="rounded-lg border border-gray-200 overflow-auto mb-4 max-h-48">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0"><tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Топ' : 'Группа'}</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Ауд.' : 'Ауд.'}</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Смена' : 'Смена'}</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Пара' : 'Пара'}</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Уақыт' : 'Время'}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedGroups.map((g, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-900 font-medium">{g.group_name}</td>
                        <td className="px-3 py-1.5 text-center text-gray-600 text-xs">{g.auditorium || '—'}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`text-xs font-semibold ${g.shift === 1 ? 'text-blue-600' : 'text-amber-600'}`}>{g.shift === 1 ? 'I' : 'II'}</span>
                        </td>
                        <td className="px-3 py-1.5 text-center text-gray-600">{g.first_pair}</td>
                        <td className="px-3 py-1.5 text-gray-500 text-xs">{SHIFT_TIMES[g.shift]?.[g.first_pair] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'kz' ? 'Күні' : 'Дата'}</label>
                  <input type="date" className="input-field text-sm" value={selectedDate}
                    min={todayStr}
                    onChange={e => setSelectedDate(e.target.value)} />
                  {selectedDate && (
                    <p className="mt-1 text-xs text-purple-600 font-medium">
                      {getWeekdayName(selectedDate)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'kz' ? 'Ұзақтығы' : 'Длительность'}</label>
                  <select className="input-field text-sm" value={duration} onChange={e => setDuration(Number(e.target.value))}>
                    <option value={30}>30 {lang === 'kz' ? 'мин' : 'мин'}</option>
                    <option value={15}>15 {lang === 'kz' ? 'мин (қысқа күн)' : 'мин (короткий день)'}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button className="btn-secondary text-sm" onClick={() => { setStep('upload'); setParsedGroups([]); }}>
                {lang === 'kz' ? 'Артқа' : 'Назад'}
              </button>
              <button className="btn-primary text-sm" onClick={handleSubmit} disabled={submitting || !selectedDate}>
                {submitting ? <Loader2 size={16} className="animate-spin mr-1" /> : <Wand2 size={16} className="mr-1" />}
                {lang === 'kz' ? 'Тағайындау' : 'Назначить'}
              </button>
            </div>
          </>
        )}

        {/* Step 3: Results */}
        {step === 'results' && results && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{results.created}</p>
                <p className="text-xs text-green-600">{lang === 'kz' ? 'Құрылды' : 'Создано'}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{results.duplicates}</p>
                <p className="text-xs text-amber-600">{lang === 'kz' ? 'Қайталанды' : 'Дубликаты'}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{results.errors}</p>
                <p className="text-xs text-red-600">{lang === 'kz' ? 'Қателер' : 'Ошибки'}</p>
              </div>
            </div>

            {results.created > 0 && (
              <div className="mb-3 rounded-lg bg-blue-50 p-2.5 text-xs text-blue-700">
                {lang === 'kz'
                  ? 'Тақырыптар бос — кураторлар толтыруы керек'
                  : 'Темы пустые — кураторам нужно их заполнить'}
              </div>
            )}

            <div className="flex-1 overflow-auto rounded-lg border border-gray-200 mb-4 max-h-60">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0"><tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Топ' : 'Группа'}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Ауд.' : 'Ауд.'}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Пара' : 'Пара'}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Нәтиже' : 'Результат'}</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {results.log.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-gray-900">{r.group}</td>
                      <td className="px-3 py-1.5 text-center text-gray-600 text-xs">{r.room || '—'}</td>
                      <td className="px-3 py-1.5 text-center text-gray-600">{r.pair || '—'}</td>
                      <td className="px-3 py-1.5">
                        {r.status === 'created' && <span className="text-xs text-green-700">✓ {lang === 'kz' ? 'Құрылды' : 'Создано'}</span>}
                        {r.status === 'duplicate' && <span className="text-xs text-amber-700">⟳ {lang === 'kz' ? 'Бар' : 'Дубликат'}</span>}
                        {(r.status === 'error' || r.status === 'group_not_found') && <span className="text-xs text-red-700">✗ {r.message || (lang === 'kz' ? 'Қате' : 'Ошибка')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button className="btn-primary text-sm" onClick={onDone}>{lang === 'kz' ? 'Дайын' : 'Готово'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Session Import Modal ─── */

interface SessionImportEntry {
  group_name: string;
  topic: string;
  date: string;
  pair_number: number;
  auditorium: string;
  error?: string;
}

interface SessionImportResults {
  log: Array<{ group: string; topic: string; date: string; pair: number; room: string; status: string; message?: string }>;
  created: number;
  duplicates: number;
  errors: number;
  total: number;
}

function SessionImportModal({ lang, onClose, onDone }: {
  lang: 'kz' | 'ru'; onClose: () => void; onDone: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload');
  const [entries, setEntries] = useState<SessionImportEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<SessionImportResults | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const parseDate = (raw: unknown): string => {
    if (!raw) return '';
    if (typeof raw === 'number') {
      // Excel serial date — use UTC to avoid timezone offset issues
      const d = new Date((raw - 25569) * 86400000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    const s = String(raw).trim();
    // Try DD.MM.YYYY format
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) { setError(lang === 'kz' ? 'Бос файл' : 'Пустой файл'); return; }
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

      const parsed: SessionImportEntry[] = [];
      // Skip header row if first row's pair column is not a number
      const startIdx = (json[0] && isNaN(Number(json[0][3]))) ? 1 : 0;
      for (let i = startIdx; i < json.length; i++) {
        const row = json[i];
        if (!row || !Array.isArray(row) || row.length < 4) continue;
        const groupName = String(row[0] ?? '').trim();
        const topic = String(row[1] ?? '').trim();
        const date = parseDate(row[2]);
        const pair = Number(row[3]) || 0;
        const auditorium = String(row[4] ?? '').trim();
        if (!groupName && !topic && !date) continue;

        const entry: SessionImportEntry = { group_name: groupName, topic, date, pair_number: pair, auditorium };
        if (!groupName) entry.error = lang === 'kz' ? 'Топ жоқ' : 'Нет группы';
        else if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) entry.error = lang === 'kz' ? 'Күні қате' : 'Неверная дата';
        else if (pair < 1 || pair > 9) entry.error = lang === 'kz' ? 'Пара нөмірі қате' : 'Неверный № пары';
        parsed.push(entry);
      }

      if (parsed.length === 0) {
        setError(lang === 'kz' ? 'Деректер табылмады' : 'Данные не найдены');
        return;
      }
      setEntries(parsed);
      setStep('preview');
    } catch {
      setError(lang === 'kz' ? 'Файлды оқу қатесі' : 'Ошибка чтения файла');
    }
  };

  const validEntries = entries.filter(e => !e.error);
  const hasErrors = entries.some(e => e.error);

  const handleSubmit = async () => {
    if (validEntries.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<SessionImportResults>('/api/admin/sessions/import', {
        sessions: validEntries.map(e => ({
          group_name: e.group_name,
          topic: e.topic,
          date: e.date,
          pair_number: e.pair_number,
          auditorium: e.auditorium,
        })),
      });
      setResults(res);
      setStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Группа', 'Тема', 'Дата', '№ пары', 'Аудитория'],
      ['ИТ-21', 'Патриотизм', '2025-09-02', 1, '301'],
      ['ИТ-21', 'Экология', '2025-09-09', 1, '301'],
      ['ИТ-22', 'Здоровый образ жизни', '2025-09-02', 2, '205'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, 'sessions_import_template.xlsx');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 sm:p-6 shadow-xl max-h-[90vh] flex flex-col my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-green-600" />
            {lang === 'kz' ? 'Сабақтарды Excel-ден импорт' : 'Импорт занятий из Excel'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X size={20} /></button>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Upload */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <div className="mb-4 rounded-2xl bg-green-50 p-5 text-center max-w-lg w-full">
              <FileSpreadsheet size={40} className="mx-auto mb-2 text-green-500" />
              <p className="text-sm font-medium text-gray-700 mb-1">
                {lang === 'kz' ? 'Excel файлды таңдаңыз (.xlsx, .xls)' : 'Выберите Excel файл (.xlsx, .xls)'}
              </p>
              <p className="text-xs text-gray-500">
                {lang === 'kz'
                  ? '5 баған: Топ, Тақырып, Күні, Пара №, Аудитория'
                  : '5 столбцов: Группа, Тема, Дата, № пары, Аудитория'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {lang === 'kz' ? 'Ұзақтығы: 30 мин (автоматты)' : 'Длительность: 30 мин (по умолчанию)'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
              <button className="btn-primary" onClick={() => fileRef.current?.click()}>
                <Upload size={18} className="mr-2" />
                {lang === 'kz' ? 'Файлды таңдау' : 'Выбрать файл'}
              </button>
              <button className="btn-secondary" onClick={downloadTemplate}>
                <Download size={18} className="mr-2" />
                {lang === 'kz' ? 'Үлгіні жүктеу' : 'Скачать шаблон'}
              </button>
            </div>
            <div className="mt-5 rounded-lg bg-blue-50 p-4 text-xs text-blue-700 max-w-lg w-full">
              <p className="font-medium mb-1">{lang === 'kz' ? 'Формат:' : 'Формат:'}</p>
              <div className="overflow-auto">
                <table className="w-full text-left text-blue-600 whitespace-nowrap">
                  <thead><tr className="border-b border-blue-200">
                    <th className="pb-1 pr-2">{lang === 'kz' ? 'Топ' : 'Группа'}</th>
                    <th className="pb-1 pr-2">{lang === 'kz' ? 'Тақырып' : 'Тема'}</th>
                    <th className="pb-1 pr-2">{lang === 'kz' ? 'Күні' : 'Дата'}</th>
                    <th className="pb-1 pr-2">{lang === 'kz' ? 'Пара' : 'Пара'}</th>
                    <th className="pb-1">{lang === 'kz' ? 'Аудитория' : 'Ауд.'}</th>
                  </tr></thead>
                  <tbody>
                    <tr><td className="pr-2 py-0.5">ИТ-21</td><td className="pr-2">Патриотизм</td><td className="pr-2">2025-09-02</td><td className="pr-2">1</td><td>301</td></tr>
                    <tr><td className="pr-2 py-0.5">ИТ-22</td><td className="pr-2">Экология</td><td className="pr-2">2025-09-02</td><td className="pr-2">2</td><td>205</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-blue-500">{lang === 'kz' ? 'Күні: YYYY-MM-DD немесе DD.MM.YYYY' : 'Дата: YYYY-MM-DD или ДД.ММ.ГГГГ'}</p>
            </div>
          </div>
        )}

        {/* Preview */}
        {step === 'preview' && (
          <>
            {hasErrors && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
                <AlertTriangle size={14} />
                {lang === 'kz' ? 'Қателер бар жолдар жіберілмейді' : 'Строки с ошибками не будут импортированы'}
              </div>
            )}

            <div className="flex-1 overflow-auto rounded-lg border border-gray-200 mb-4">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Топ' : 'Группа'}</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Тақырып' : 'Тема'}</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Күні' : 'Дата'}</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Пара' : 'Пара'}</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Ауд.' : 'Ауд.'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((r, i) => (
                    <tr key={i} className={r.error ? 'bg-red-50/50' : ''}>
                      <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{r.group_name}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 max-w-[200px] truncate">{r.topic || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{r.date}</td>
                      <td className="px-3 py-2 text-center text-sm text-gray-600">{r.pair_number}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {r.auditorium || <span className="text-gray-300">—</span>}
                        {r.error && <span className="ml-2 text-xs text-red-500">({r.error})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {lang === 'kz'
                  ? `Барлығы: ${entries.length}, дұрыс: ${validEntries.length}`
                  : `Всего: ${entries.length}, корректных: ${validEntries.length}`}
              </p>
              <div className="flex gap-2">
                <button className="btn-secondary text-sm" onClick={() => { setStep('upload'); setEntries([]); }}>
                  {lang === 'kz' ? 'Артқа' : 'Назад'}
                </button>
                <button className="btn-primary text-sm" onClick={handleSubmit} disabled={submitting || validEntries.length === 0}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> :
                    `${lang === 'kz' ? 'Импорттау' : 'Импортировать'} (${validEntries.length})`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Results */}
        {step === 'results' && results && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{results.created}</p>
                <p className="text-xs text-green-600">{lang === 'kz' ? 'Құрылды' : 'Создано'}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{results.duplicates}</p>
                <p className="text-xs text-amber-600">{lang === 'kz' ? 'Қайталанды' : 'Дубликаты'}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{results.errors}</p>
                <p className="text-xs text-red-600">{lang === 'kz' ? 'Қателер' : 'Ошибки'}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-lg border border-gray-200 mb-4">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0"><tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Топ' : 'Группа'}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Тақырып' : 'Тема'}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Күні' : 'Дата'}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Нәтиже' : 'Результат'}</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {results.log.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-900">{r.group}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">{r.topic || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{r.date}</td>
                      <td className="px-3 py-2">
                        {r.status === 'created' && <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={12} />{lang === 'kz' ? 'Құрылды' : 'Создано'}</span>}
                        {r.status === 'duplicate' && <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} />{lang === 'kz' ? 'Қайталанды' : 'Дубликат'}</span>}
                        {(r.status === 'error' || r.status === 'group_not_found') && <span className="inline-flex items-center gap-1 text-xs text-red-700"><AlertTriangle size={12} />{r.message || (lang === 'kz' ? 'Қате' : 'Ошибка')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary text-sm" onClick={onDone}>{lang === 'kz' ? 'Дайын' : 'Готово'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Booked rooms type ─── */
interface BookedSlot {
  time_slot: string;
  room: string;
  topic: string;
  class_name: string;
}

function CreateSessionModal({ onClose, onCreated, lang }: {
  onClose: () => void; onCreated: () => void; lang: 'kz' | 'ru';
}) {
  const [classId, setClassId] = useState('');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState(30);
  const [timeSlot, setTimeSlot] = useState('');
  const [room, setRoom] = useState('');
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);

  // Room picker state
  const [building, setBuilding] = useState<BuildingCode | ''>('');
  const [floor, setFloor] = useState<number | ''>('');

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>('/api/sessions/classes')
      .then((res) => {
        const data = Array.isArray(res) ? res : (res as { data: Array<{ id: string; name: string }> }).data ?? [];
        setClasses(data);
      })
      .catch(() => setClasses([]));
  }, []);

  // Load booked rooms when date changes
  useEffect(() => {
    if (!date) { setBookedSlots([]); return; }
    api.get<BookedSlot[]>('/api/sessions/booked-rooms', { date })
      .then((res) => setBookedSlots(Array.isArray(res) ? res : []))
      .catch(() => setBookedSlots([]));
  }, [date]);

  const isRoomBooked = (roomName: string, slot: string): boolean => {
    return bookedSlots.some(b => b.room === roomName && b.time_slot === slot);
  };

  const floors = building && building !== 'спорт зал' ? getFloorsForBuilding(building as BuildingCode) : [];

  // Auto-select floor for single-floor buildings
  useEffect(() => {
    if (building && building !== 'спорт зал' && floors.length === 1 && floor === '') {
      setFloor(floors[0]!);
    }
  }, [building, floors, floor]);

  const rooms = building && building !== 'спорт зал' && floor !== ''
    ? getRoomsForFloor(building as BuildingCode, floor as number)
    : building === 'спорт зал'
    ? [{ code: 'спорт зал', building: 'спорт зал' as BuildingCode, floor: 1, displayName: 'спорт зал' }]
    : [];

  const handleBuildingSelect = (b: BuildingCode) => {
    setBuilding(b);
    setFloor('');
    setRoom('');
    if (b === 'спорт зал') {
      setRoom('спорт зал');
    }
  };

  const handleFloorSelect = (f: number) => {
    setFloor(f);
    setRoom('');
  };

  const handleRoomSelect = (r: RoomInfo) => {
    if (timeSlot && isRoomBooked(r.displayName, timeSlot)) return;
    setRoom(r.displayName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeSlot) { setError(lang === 'kz' ? 'Уақытты таңдаңыз' : 'Выберите время'); return; }
    if (!room) { setError(lang === 'kz' ? 'Аудиторияны таңдаңыз' : 'Выберите аудиторию'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<{ id: string }>('/api/sessions', {
        class_id: classId,
        topic,
        planned_date: date,
        time_slot: timeSlot,
        room,
        duration_minutes: duration,
      });
      // If Word file provided, submit for approval
      if (wordFile && res?.id) {
        const formData = new FormData();
        formData.append('session_id', res.id);
        formData.append('file', wordFile);
        try {
          await api.postFormData('/api/lesson-approvals', formData);
        } catch { /* session created, approval upload failed silently */ }
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl my-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {lang === 'kz' ? 'Жаңа сабақ' : 'Новое занятие'}
        </h2>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Class + Topic */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {lang === 'kz' ? 'Топ' : 'Группа'}
              </label>
              <select className="input-field" value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="">{lang === 'kz' ? 'Таңдаңыз' : 'Выберите'}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {lang === 'kz' ? 'Тақырып' : 'Тема'}
              </label>
              <input type="text" className="input-field" value={topic}
                onChange={(e) => setTopic(e.target.value)} required
                placeholder={lang === 'kz' ? 'Тақырыпты енгізіңіз' : 'Введите тему'} />
            </div>
          </div>

          {/* Date + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {lang === 'kz' ? 'Күні' : 'Дата'}
              </label>
              <input type="date" className="input-field" value={date}
                onChange={(e) => { setDate(e.target.value); setTimeSlot(''); setRoom(''); setBuilding(''); setFloor(''); }}
                required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {lang === 'kz' ? 'Ұзақтығы (мин)' : 'Длительность (мин)'}
              </label>
              <select className="input-field" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={30}>30 мин</option>
                <option value={60}>60 мин</option>
                <option value={90}>90 мин</option>
              </select>
            </div>
          </div>

          {/* Pair / Time Slot Picker */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              <Clock size={14} className="inline mr-1" />
              {lang === 'kz' ? 'Пара / Уақыт слоты' : 'Пара / Временной слот'}
            </label>
            <div className="space-y-2">
              {COLLEGE_PAIRS.map((pair) => (
                <div key={pair.number} className="rounded-lg border border-gray-200 p-2">
                  <div className="mb-1.5 text-xs font-medium text-gray-500">
                    {pair.number}-{lang === 'kz' ? 'пара' : 'пара'}: {pair.start} – {pair.end}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pair.slots.map((slot) => {
                      const isSelected = timeSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => { setTimeSlot(slot); setRoom(''); setBuilding(''); setFloor(''); }}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-primary-600 text-white ring-2 ring-primary-300'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Room Picker: Building → Floor → Room */}
          {timeSlot && date && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                <MapPin size={14} className="inline mr-1" />
                {lang === 'kz' ? 'Аудитория' : 'Аудитория'}
                {room && <span className="ml-2 rounded bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700">{room}</span>}
              </label>

              {/* Step 1: Building */}
              <div className="mb-2">
                <p className="mb-1 text-xs text-gray-500">
                  {lang === 'kz' ? '1. Корпусты таңдаңыз' : '1. Выберите корпус'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {BUILDINGS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => handleBuildingSelect(b)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        building === b
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Floor */}
              {building && building !== 'спорт зал' && floors.length > 1 && (
                <div className="mb-2">
                  <p className="mb-1 text-xs text-gray-500">
                    {lang === 'kz' ? '2. Қабатты таңдаңыз' : '2. Выберите этаж'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {floors.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => handleFloorSelect(f)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          floor === f
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {f} {lang === 'kz' ? 'қабат' : 'этаж'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Single-floor buildings: show rooms directly */}

              {/* Step 3: Rooms */}
              {rooms.length > 0 && building !== 'спорт зал' && (
                <div>
                  <p className="mb-1 text-xs text-gray-500">
                    {floors.length > 1 ? '3' : '2'}. {lang === 'kz' ? 'Аудиторияны таңдаңыз' : 'Выберите аудиторию'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {rooms.map((r) => {
                      const booked = isRoomBooked(r.displayName, timeSlot);
                      const isSelected = room === r.displayName;
                      return (
                        <button
                          key={r.displayName}
                          type="button"
                          disabled={booked}
                          onClick={() => handleRoomSelect(r)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            booked
                              ? 'bg-red-100 text-red-400 cursor-not-allowed line-through'
                              : isSelected
                              ? 'bg-primary-600 text-white ring-2 ring-primary-300'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                          title={booked ? (lang === 'kz' ? 'Бос емес' : 'Занята') : r.displayName}
                        >
                          {r.code}
                          {booked && ' ✗'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Word file upload for approval */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              <Upload size={14} className="inline mr-1" />
              {lang === 'kz' ? 'Word файл (бекіту үшін)' : 'Word файл (для утверждения)'}
            </label>
            <input
              type="file"
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setWordFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
            />
            {wordFile && (
              <p className="mt-1 text-xs text-gray-500">✓ {wordFile.name}</p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              {lang === 'kz' ? 'Администратор тексеріп, бекітеді' : 'Администратор проверит и утвердит'}
            </p>
          </div>

          {/* Selected summary */}
          {timeSlot && room && (
            <div className="rounded-lg bg-primary-50 p-3 text-sm">
              <span className="font-medium text-primary-800">
                {lang === 'kz' ? 'Таңдалды' : 'Выбрано'}:
              </span>{' '}
              <span className="text-primary-700">
                {date} · {timeSlot} · {room} · {duration} {lang === 'kz' ? 'мин' : 'мин'}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {lang === 'kz' ? 'Бас тарту' : 'Отмена'}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !timeSlot || !room}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> :
                lang === 'kz' ? 'Жасау' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
