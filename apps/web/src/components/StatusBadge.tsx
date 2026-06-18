// Цветной бейдж статуса занятия (запланировано/проведено/отменено и т.д.)
// с подписью на нужном языке.
import type { SessionStatus } from '@tarbie/shared';
import { useAuthStore } from '../store/auth';

const statusConfig: Record<SessionStatus, { class: string; labelRu: string; labelKz: string }> = {
  pending_approval: { class: 'badge-pending', labelRu: 'На утверждении', labelKz: 'Бекіту күтуде' },
  planned: { class: 'badge-planned', labelRu: 'Запланирован', labelKz: 'Жоспарланған' },
  completed: { class: 'badge-completed', labelRu: 'Завершён', labelKz: 'Аяқталған' },
  cancelled: { class: 'badge-cancelled', labelRu: 'Отменён', labelKz: 'Бас тартылған' },
  rescheduled: { class: 'badge-rescheduled', labelRu: 'Перенесён', labelKz: 'Ауыстырылған' },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const lang = useAuthStore((s) => s.lang);
  const config = statusConfig[status];
  return (
    <span className={config.class}>
      {lang === 'kz' ? config.labelKz : config.labelRu}
    </span>
  );
}
